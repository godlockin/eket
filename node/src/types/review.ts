/**
 * EKET Framework - Review Types
 */

// ============================================================================
// Ultrareview Types (TASK-119)
// ============================================================================

export interface ReviewerResult {
  reviewerId: string;
  focus: string;
  issues: Array<{ severity: 'critical' | 'warning' | 'info'; message: string; file?: string }>;
  score: number;
}

export interface UltrareviewReport {
  prNumber: number;
  overallScore: number;
  reviewers: ReviewerResult[];
  topIssues: Array<{ severity: string; message: string; reviewers: string[] }>;
  recommendation: 'approve' | 'request-changes' | 'comment';
  generatedAt: number;
}

// ============================================================================
// Completion Validator Types (TASK-116)
// ============================================================================

export interface ValidationCheck {
  dimension: 'architecture' | 'code-style' | 'acceptance-criteria';
  passed: boolean;
  message: string;
  source: string;
}

export interface ValidationReport {
  passed: boolean;
  checks: ValidationCheck[];
  summary: string;
}
