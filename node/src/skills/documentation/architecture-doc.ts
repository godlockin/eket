import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface ArchitectureDocInput {
  systemName: string;
  docType?: 'adr' | 'system-overview' | 'both';
  audience?: 'engineers' | 'architects' | 'mixed';
}

export interface ArchitectureDocOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const architectureDocSkill: Skill<ArchitectureDocInput, ArchitectureDocOutput> = {
  name: 'architecture-doc',
  category: SkillCategory.DOCUMENTATION,
  description: 'Architecture Decision Records (ADR) and C4 system architecture documentation guide',
  version: '1.0.0',
  async execute(input: SkillInput<ArchitectureDocInput>): Promise<SkillOutput<ArchitectureDocOutput>> {
    const data = input.data as unknown as ArchitectureDocInput;
    const start = Date.now();
    const systemName = data.systemName || 'system';
    const docType = data.docType || 'both';
    const audience = data.audience || 'engineers';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Set Up ADR Process',
            description: 'Architecture Decision Records capture the "why" — most valuable documentation there is.',
            actions: [
              'Create `docs/decisions/` directory with `README.md` explaining ADR process to new joiners',
              'ADR template: Title | Status (Proposed/Accepted/Deprecated/Superseded) | Context | Decision | Consequences',
              'Numbering: `docs/decisions/ADR-001-database-selection.md` — sequential, never renumber',
              'Trigger: any decision that is costly to reverse should get an ADR (DB choice, auth mechanism, API style)',
              'ADR review: treat like a code review — team discusses before Accepted status',
              'Link from code: `// See ADR-005 for why we use optimistic locking here`',
            ],
          },
          {
            step: 2,
            title: 'Write First ADR (Bootstrapping)',
            description: 'Document the most impactful past decisions first to build institutional memory.',
            actions: [
              'Start with highest-impact decisions: programming language, DB, deployment platform, API style',
              'Context section: what was the situation? What forces/constraints shaped the decision?',
              'Decision section: what did you choose? Be specific — "We use PostgreSQL 15 with pgvector extension"',
              'Alternatives considered: what else was evaluated? Why rejected? (prevents re-litigating decisions)',
              'Consequences: positive (what gets easier), negative (what gets harder), risks accepted',
              'Retrospective ADRs for existing decisions are fine — better late than never',
            ],
          },
          {
            step: 3,
            title: 'System Architecture Overview (C4 Model)',
            description: 'Document architecture at 4 zoom levels: Context → Container → Component → Code.',
            actions: [
              'Level 1 — Context: single diagram showing system, users, and external dependencies',
              'Level 2 — Container: deployable units (web app, API, DB, cache, message queue) with tech labels',
              'Level 3 — Component: internal structure of key containers (only for complex services)',
              'Level 4 — Code: class/module diagrams for critical algorithms (rarely needed)',
              'Use Structurizr DSL or Mermaid for diagrams-as-code — version controlled, not PNG screenshots',
              `Example Mermaid: C4Context → Person(user, "${audience}") → System(${systemName}, "...") → SystemExt(stripe, "Payment")`,
            ],
          },
          {
            step: 4,
            title: 'Document Key Patterns & Boundaries',
            description: 'Explain non-obvious architectural patterns and service boundaries.',
            actions: [
              'Service boundaries: what does each service own? What is explicitly NOT its responsibility?',
              'Communication patterns: synchronous REST vs async events — when each is used and why',
              'Data ownership: which service is the source of truth for each domain entity?',
              'Cross-cutting concerns: how is auth, logging, tracing, rate-limiting handled across services?',
              'Failure modes: what happens when service X is down? How does the system degrade gracefully?',
              'Integration points: document every external dependency with SLA, fallback, and circuit breaker details',
            ],
          },
          {
            step: 5,
            title: 'Runbooks & Operational Context',
            description: 'Architecture docs are incomplete without operational knowledge.',
            actions: [
              'Create `docs/runbooks/` directory with one file per common operation or incident type',
              'Runbook format: Trigger → Diagnosis steps → Remediation → Escalation path',
              'Cover common scenarios: DB failover, high memory alert, authentication service down, data migration',
              'Deployment topology: which regions, which cloud, network diagram, security group rules',
              'Data flow diagrams for sensitive flows: payment processing, PII handling, audit trail',
              'Capacity limits: document known limits (max concurrent users, max request size, rate limits)',
            ],
          },
          {
            step: 6,
            title: 'Keep Architecture Docs Alive',
            description: 'Stale architecture docs are misleading — implement review cadence.',
            actions: [
              'Review trigger: any significant change (new service, DB migration, auth change) requires doc update',
              'Quarterly review: team lead reviews C4 diagrams against reality — update discrepancies',
              'Architecture fitness functions: automated tests that verify architectural constraints are met',
              'Doc in PR checklist: "Does this PR require an ADR?" — mandatory question in PR template',
              'Architecture guild: monthly meeting to discuss evolving architecture and pending decisions',
              'Link docs from onboarding: new engineers read architecture docs in week 1 — measure comprehension',
            ],
          },
        ],
        summary: `Architecture documentation guide for "${systemName}" — type: ${docType}, audience: ${audience}. Covers ADR process, C4 model (4 zoom levels), service boundaries, operational runbooks, and living documentation practices.`,
      },
      duration: Date.now() - start,
    };
  },
};
