/**
 * Task Pipeline
 *
 * Events: TaskCreated, TaskCompleted, TeammateIdle
 * DAG: FeedbackNode ∥ WorktreeCleanupNode → SkillGraphUpdateNode (serial)
 */

import { PipelineExecutor, MiddlewareNode } from '../../core/middleware-pipeline.js';

import type { HttpHookPayload, HttpHookResponse } from '../http-hook-server.js';

export interface TaskState extends Record<string, unknown> {
  payload: HttpHookPayload;
  response: HttpHookResponse;
}

export function createTaskPipeline(): PipelineExecutor<TaskState> {
  const nodes: Array<MiddlewareNode<TaskState>> = [
    {
      id: 'FeedbackNode',
      deps: [],
      parallel: true,
      failBehavior: 'warn',
      handle: async (state) => {
        const { event, agentName, data } = state.payload;
        if (event === 'TeammateIdle' && data.idleReason === 'available') {
          console.log(`[Feedback] Agent ${agentName ?? 'n/a'} is idle and available`);
          return {
            ...state,
            response: {
              ...state.response,
              feedback: `Agent ${agentName ?? 'unknown'} ready for new task`,
            },
          };
        }
        if (event === 'TaskCompleted') {
          console.log(
            `[Feedback] Task ${data.taskId ?? 'n/a'} completed with status=${data.taskStatus ?? 'n/a'}`
          );
        }
        return state;
      },
    },
    {
      id: 'WorktreeCleanupNode',
      deps: [],
      parallel: true,
      failBehavior: 'warn',
      handle: async (state) => {
        const { event, data } = state.payload;
        if (event === 'TaskCompleted' && data.taskId) {
          console.log(`[WorktreeCleanup] Scheduling cleanup for task=${data.taskId}`);
        }
        return state;
      },
    },
    {
      id: 'SkillGraphUpdateNode',
      deps: ['FeedbackNode', 'WorktreeCleanupNode'],
      parallel: false,
      failBehavior: 'warn',
      handle: async (state) => {
        const { event, agentName } = state.payload;
        console.log(`[SkillGraph] Updating skill graph after ${event} agent=${agentName ?? 'n/a'}`);
        return state;
      },
    },
  ];

  return new PipelineExecutor<TaskState>(nodes);
}
