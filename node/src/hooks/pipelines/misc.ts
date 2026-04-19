/**
 * Misc Pipeline
 *
 * Events: Notification, UserPromptSubmit, Stop, StopFailure, SubagentStart,
 *         SubagentStop, Setup, Elicitation, ElicitationResult, ConfigChange,
 *         WorktreeCreate, WorktreeRemove, InstructionsLoaded, CwdChanged, FileChanged
 *
 * DAG: PassthroughNode (single node — directly allow)
 */

import { PipelineExecutor, MiddlewareNode } from '../../core/middleware-pipeline.js';
import type { HttpHookPayload, HttpHookResponse } from '../http-hook-server.js';

export interface MiscState extends Record<string, unknown> {
  payload: HttpHookPayload;
  response: HttpHookResponse;
}

export function createMiscPipeline(): PipelineExecutor<MiscState> {
  const nodes: MiddlewareNode<MiscState>[] = [
    {
      id: 'PassthroughNode',
      deps: [],
      parallel: false,
      failBehavior: 'warn',
      handle: async (state) => {
        // Passthrough: log and allow
        console.log(
          `[Misc] ${state.payload.event} session=${state.payload.sessionId} agent=${state.payload.agentName ?? 'n/a'}`
        );
        return state;
      },
    },
  ];

  return new PipelineExecutor<MiscState>(nodes);
}
