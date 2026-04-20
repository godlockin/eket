/**
 * PreToolUse Pipeline
 *
 * DAG: GuardrailNode ∥ SecurityNode ∥ EnvConfigNode ∥ ParalysisCheckNode → AuditLogNode
 */

import { PipelineExecutor, MiddlewareNode } from '../../core/middleware-pipeline.js';
import type { HttpHookPayload, HttpHookResponse } from '../http-hook-server.js';
import { globalParalysisDetector } from '../../core/analysis-paralysis-detector.js';

export interface PreToolUseState extends Record<string, unknown> {
  payload: HttpHookPayload;
  response: HttpHookResponse;
}

export function createPreToolUsePipeline(): PipelineExecutor<PreToolUseState> {
  const nodes: MiddlewareNode<PreToolUseState>[] = [
    {
      id: 'GuardrailNode',
      deps: [],
      parallel: true,
      failBehavior: 'block',
      handle: async (state) => {
        const { toolName, toolInput } = state.payload.data;
        const blockedTools = ['rm -rf', 'dd', 'mkfs', 'format'];
        if (toolName && blockedTools.some((t) => toolName.includes(t))) {
          return {
            ...state,
            response: { action: 'deny', reason: `Guardrail: tool "${toolName}" is blocked` },
          };
        }
        // Check for dangerous patterns in input
        if (toolInput) {
          const inputStr = JSON.stringify(toolInput);
          if (inputStr.includes('rm -rf /') || inputStr.includes('DROP TABLE')) {
            return {
              ...state,
              response: { action: 'deny', reason: 'Guardrail: dangerous input pattern detected' },
            };
          }
        }
        return state;
      },
    },
    {
      id: 'SecurityNode',
      deps: [],
      parallel: true,
      failBehavior: 'warn',
      handle: async (state) => {
        const { toolInput } = state.payload.data;
        if (toolInput) {
          const inputStr = JSON.stringify(toolInput);
          if (inputStr.includes('../')) {
            console.warn(`[SecurityNode] Path traversal detected in tool input`);
          }
        }
        return state;
      },
    },
    {
      id: 'EnvConfigNode',
      deps: [],
      parallel: true,
      failBehavior: 'skip',
      handle: async (state) => {
        // Inject env config metadata
        return {
          ...state,
          envConfig: { logLevel: process.env.EKET_LOG_LEVEL ?? 'info' },
        };
      },
    },
    {
      id: 'ParalysisCheckNode',
      deps: [],
      parallel: true,
      failBehavior: 'warn',
      handle: async (state) => {
        const { toolName, toolInput } = state.payload.data;
        if (toolName) {
          const filePath =
            typeof toolInput === 'object' && toolInput !== null
              ? (toolInput as Record<string, unknown>).file_path as string | undefined ??
                (toolInput as Record<string, unknown>).path as string | undefined
              : undefined;
          const warning = globalParalysisDetector.record(toolName, filePath);
          if (warning) {
            console.warn(`[ParalysisCheckNode] ${warning.message}`);
          }
        }
        return state;
      },
    },
    {
      id: 'AuditLogNode',
      deps: ['GuardrailNode', 'SecurityNode', 'EnvConfigNode', 'ParalysisCheckNode'],
      parallel: false,
      failBehavior: 'warn',
      handle: async (state) => {
        const { toolName, toolUseId } = state.payload.data;
        console.log(
          `[AuditLog] PreToolUse tool=${toolName} useId=${toolUseId ?? 'n/a'} session=${state.payload.sessionId}`
        );
        return state;
      },
    },
  ];

  return new PipelineExecutor<PreToolUseState>(nodes);
}
