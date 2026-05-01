/**
 * Permission Pipeline
 *
 * Events: PermissionRequest, PermissionDenied
 * DAG: PermissionCheckNode (single serial node)
 */

import { PipelineExecutor, MiddlewareNode } from '../../core/middleware-pipeline.js';

import type { HttpHookPayload, HttpHookResponse } from '../http-hook-server.js';

export interface PermissionState extends Record<string, unknown> {
  payload: HttpHookPayload;
  response: HttpHookResponse;
}

export function createPermissionPipeline(): PipelineExecutor<PermissionState> {
  const nodes: Array<MiddlewareNode<PermissionState>> = [
    {
      id: 'PermissionCheckNode',
      deps: [],
      parallel: false,
      failBehavior: 'block',
      handle: async (state) => {
        const { event, agentName, data } = state.payload;

        if (event === 'PermissionRequest') {
          const { permissionTool, permissionDescription } = data;
          console.log(
            `[PermissionCheck] Request tool=${permissionTool ?? 'n/a'} agent=${agentName ?? 'n/a'} desc="${permissionDescription ?? ''}"`
          );
          // By default allow; external handlers can override via server.on()
          return state;
        }

        if (event === 'PermissionDenied') {
          console.warn(
            `[PermissionCheck] Denied tool=${data.permissionTool ?? 'n/a'} agent=${agentName ?? 'n/a'}`
          );
        }

        return state;
      },
    },
  ];

  return new PipelineExecutor<PermissionState>(nodes);
}
