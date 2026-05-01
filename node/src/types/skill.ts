/**
 * EKET Framework - Skill Types
 */

// ============================================================================
// Skill Graph Types (TASK-104b)
// ============================================================================

export interface SkillNodeRecord {
  id: string;
  type: 'skill' | 'expert';
  domain: string;
  level: 1 | 2 | 3;
  model_hint?: string;
  triggers?: string[];
}

export interface SkillEdgeRecord {
  source_id: string;
  target_id: string;
  weight: number;
  co_activation_count: number;
  last_activated_at: string;
}

// ============================================================================
// Skill Types (Phase 4.3)
// ============================================================================

export interface SkillDefinition {
  name: string;
  description: string;
  category: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  steps: SkillStep[];
}

export interface SkillStep {
  name: string;
  action: string;
  parameters?: Record<string, unknown>;
}

export interface SkillExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  duration: number;
}

// ============================================================================
// Skill Feedback Types (TASK-104b)
// ============================================================================

export interface LevelChange {
  from: number;
  to: number;
  reason: string;
  at: string;
}

export interface SkillFeedback {
  ticketId: string;
  slaverId: string;
  recommendedLevel: 1 | 2 | 3;
  actualLevel: 1 | 2 | 3;
  activatedSkills: string[];
  activatedExperts: string[];
  levelChanges: LevelChange[];
  completedAt: string;
}
