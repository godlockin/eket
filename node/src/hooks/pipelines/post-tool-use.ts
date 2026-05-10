/**
 * PostToolUse Pipeline
 *
 * Events: PostToolUse, PostToolUseFailure
 * DAG: FilterNode → (MetricsNode ∥ AuditNode)
 */

import { PipelineExecutor, MiddlewareNode } from '../../core/middleware-pipeline.js';
import { filterToolOutput } from '../../utils/tool-output-filter.js';

import type { HttpHookPayload, HttpHookResponse } from '../http-hook-server.js';

export interface PostToolUseState extends Record<string, unknown> {
  payload: HttpHookPayload;
  response: HttpHookResponse;
}

export function createPostToolUsePipeline(): PipelineExecutor<PostToolUseState> {
  const nodes: Array<MiddlewareNode<PostToolUseState>> = [
    {
      id: 'FilterNode',
      deps: [],
      parallel: false,
      failBehavior: 'warn',
      handle: async (state) => {
        const { toolName, toolResult } = state.payload.data;

        // TASK-605: Filter tool output (grep/glob/ls)
        if (toolName && typeof toolResult === 'string') {
          const cwd = process.cwd(); // TODO: extract from toolInput if available
          const filtered = filterToolOutput(toolName, toolResult, cwd);

          // Mutate payload to apply filter
          state.payload.data.toolResult = filtered;
        }

        return state;
      },
    },
    {
      id: 'MetricsNode',
      deps: ['FilterNode'],
      parallel: true,
      failBehavior: 'warn',
      handle: async (state) => {
        const { toolName, durationMs } = state.payload.data;
        const isFailure = state.payload.event === 'PostToolUseFailure';
        console.log(
          `[Metrics] tool=${toolName} duration=${durationMs ?? 'n/a'}ms failure=${isFailure}`
        );
        return state;
      },
    },
    {
      id: 'AuditNode',
      deps: ['FilterNode'],
      parallel: true,
      failBehavior: 'warn',
      handle: async (state) => {
        const { toolName, toolUseId, toolError } = state.payload.data;
        const entry = {
          event: state.payload.event,
          toolName,
          toolUseId,
          toolError,
          sessionId: state.payload.sessionId,
          ts: new Date().toISOString(),
        };
        console.log(`[Audit] ${JSON.stringify(entry)}`);
        return state;
      },
    },
  ];

  return new PipelineExecutor<PostToolUseState>(nodes);
}
