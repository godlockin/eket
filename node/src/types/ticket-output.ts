/**
 * TicketOutputSchema — Zod强制验证Slaver提交结构
 * TASK-198: 借鉴openai-agents output_type机制
 */

import { z } from 'zod';

// GitHub PR URL regex: https://github.com/<owner>/<repo>/pull/<number>
const githubPrUrlRegex = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;

export const TicketOutputSchema = z.object({
  status: z.enum(['completed', 'blocked', 'needs_review']),

  prUrl: z
    .string()
    .regex(githubPrUrlRegex, 'Must be a valid GitHub PR URL (https://github.com/<owner>/<repo>/pull/<number>)')
    .optional(),

  testResults: z
    .object({
      passed: z.number().int().min(0),
      failed: z.number().int().min(0),
      skipped: z.number().int().min(0).optional(),
      coverage: z.number().min(0).max(100).optional(),
    })
    .optional(),

  knowledgeNotes: z
    .array(z.string().min(1, 'Knowledge note must not be empty'))
    .min(1, 'At least 1 knowledgeNote required (SLAVER-RULES: 复盘强制)'),

  blockers: z.array(z.string()),
});

export type TicketOutput = z.infer<typeof TicketOutputSchema>;

/**
 * Validate ticket output payload.
 * Returns { success, data } or { success: false, errors }.
 */
export function validateTicketOutput(payload: unknown):
  | { success: true; data: TicketOutput }
  | { success: false; errors: Array<{ path: string; message: string }> } {
  const result = TicketOutputSchema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.errors.map((e) => ({
    path: e.path.join('.') || '(root)',
    message: e.message,
  }));
  return { success: false, errors };
}
