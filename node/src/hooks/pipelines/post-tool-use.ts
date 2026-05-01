/**
 * PostToolUse Pipeline
 *
 * Events: PostToolUse, PostToolUseFailure
 * DAG: MetricsNode ∥ AuditNode (both parallel, no serial)
 */

import { PipelineExecutor, MiddlewareNode } from '../../core/middleware-pipeline.js';

import type { HttpHookPayload, HttpHookResponse } from '../http-hook-server.js';

export interface PostToolUseState extends Record<string, unknown> {
  payload: HttpHookPayload;
  response: HttpHookResponse;
}

export function createPostToolUsePipeline(): PipelineExecutor<PostToolUseState> {
  const nodes: Array<MiddlewareNode<PostToolUseState>> = [
    {
      id: 'MetricsNode',
      deps: [],
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
      deps: [],
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
