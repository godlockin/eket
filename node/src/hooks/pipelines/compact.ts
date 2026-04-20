/**
 * Compact Pipeline
 *
 * Events: PreCompact, PostCompact
 * DAG: SummarizationNode (single parallel node)
 */

import { PipelineExecutor, MiddlewareNode } from '../../core/middleware-pipeline.js';
import type { HttpHookPayload, HttpHookResponse } from '../http-hook-server.js';

export interface CompactState extends Record<string, unknown> {
  payload: HttpHookPayload;
  response: HttpHookResponse;
}

export function createCompactPipeline(): PipelineExecutor<CompactState> {
  const nodes: MiddlewareNode<CompactState>[] = [
    {
      id: 'SummarizationNode',
      deps: [],
      parallel: true,
      failBehavior: 'warn',
      handle: async (state) => {
        const { event, sessionId } = state.payload;
        console.log(`[Summarization] ${event} session=${sessionId} ts=${Date.now()}`);
        return state;
      },
    },
  ];

  return new PipelineExecutor<CompactState>(nodes);
}
