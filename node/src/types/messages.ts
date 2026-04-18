/**
 * EKET Framework - Cross-Agent Message Types (TASK-042)
 * Zod schemas for 6 typed message variants with bidirectional validation.
 */

import { z } from 'zod';

// ============================================================================
// Message Type Enum
// ============================================================================

export const MessageTypeEnum = z.enum([
  'analysis_review_request',
  'pr_review_request',
  'handoff_ready',
  'blocker_report',
  'human_feedback',
  'task_completed',
]);

export type MessageType = z.infer<typeof MessageTypeEnum>;

// ============================================================================
// Base Message
// ============================================================================

export const BaseMessage = z.object({
  type: MessageTypeEnum,
  from: z.string().min(1),
  to: z.string().min(1),
  ticketId: z.string().min(1),
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export type TypedMessage = z.infer<typeof BaseMessage>;

// ============================================================================
// Specific Message Types
// ============================================================================

export const AnalysisReviewRequest = BaseMessage.extend({
  type: z.literal('analysis_review_request'),
  payload: z.object({
    reportPath: z.string(),
    estimatedHours: z.number().positive(),
    riskLevel: z.enum(['low', 'medium', 'high']),
  }),
});

export const PrReviewRequest = BaseMessage.extend({
  type: z.literal('pr_review_request'),
  payload: z.object({
    branch: z.string(),
    prDescPath: z.string(),
    testsPassed: z.number().nonnegative(),
  }),
});

export const HandoffReady = BaseMessage.extend({
  type: z.literal('handoff_ready'),
  payload: z.object({
    nextTicketId: z.string(),
    artifactsPath: z.string(),
    notes: z.string().optional(),
  }),
});

export const BlockerReport = BaseMessage.extend({
  type: z.literal('blocker_report'),
  payload: z.object({
    blockerDescription: z.string(),
    blockedSince: z.string().datetime(),
    suggestedAction: z.string().optional(),
  }),
});

export const HumanFeedback = BaseMessage.extend({
  type: z.literal('human_feedback'),
  payload: z.object({
    feedbackText: z.string(),
    priority: z.enum(['P0', 'P1', 'P2']),
    requiresAction: z.boolean(),
  }),
});

export const TaskCompleted = BaseMessage.extend({
  type: z.literal('task_completed'),
  payload: z.object({
    summary: z.string(),
    prUrl: z.string().optional(),
    testsRun: z.number().nonnegative(),
    testsPassed: z.number().nonnegative(),
  }),
});

// ============================================================================
// Union Type (for discriminated dispatch)
// ============================================================================

export const AnyMessage = z.discriminatedUnion('type', [
  AnalysisReviewRequest,
  PrReviewRequest,
  HandoffReady,
  BlockerReport,
  HumanFeedback,
  TaskCompleted,
]);

export type AnyMessageType = z.infer<typeof AnyMessage>;
