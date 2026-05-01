/**
 * Session Pipeline
 *
 * Events: SessionStart, SessionEnd
 * DAG: IndexLoadNode ∥ HeartbeatNode (parallel, no serial)
 */

import { PipelineExecutor, MiddlewareNode } from '../../core/middleware-pipeline.js';

import type { HttpHookPayload, HttpHookResponse } from '../http-hook-server.js';

export interface SessionState extends Record<string, unknown> {
  payload: HttpHookPayload;
  response: HttpHookResponse;
}

export function createSessionPipeline(): PipelineExecutor<SessionState> {
  const nodes: Array<MiddlewareNode<SessionState>> = [
    {
      id: 'IndexLoadNode',
      deps: [],
      parallel: true,
      failBehavior: 'warn',
      handle: async (state) => {
        const { event, sessionId } = state.payload;
        console.log(`[IndexLoad] ${event} session=${sessionId}`);
        return state;
      },
    },
    {
      id: 'HeartbeatNode',
      deps: [],
      parallel: true,
      failBehavior: 'warn',
      handle: async (state) => {
        const { event, sessionId, agentName } = state.payload;
        console.log(
          `[Heartbeat] ${event} session=${sessionId} agent=${agentName ?? 'n/a'} ts=${Date.now()}`
        );
        return state;
      },
    },
  ];

  return new PipelineExecutor<SessionState>(nodes);
}
