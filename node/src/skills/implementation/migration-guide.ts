import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface MigrationGuideInput {
  systemName: string;
  sourceSystem?: string;
  targetSystem?: string;
  dataSize?: string;
}

export interface MigrationGuideOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const migrationGuideSkill: Skill<MigrationGuideInput, MigrationGuideOutput> = {
  name: 'migration-guide',
  category: SkillCategory.DEVOPS,
  description: 'Guides system or data migration with assessment, planning, dry-run, execution, validation, and rollback strategies.',
  version: '1.0.0',
  async execute(input: SkillInput<MigrationGuideInput>): Promise<SkillOutput<MigrationGuideOutput>> {
    const data = input as unknown as MigrationGuideInput;
    const start = Date.now();
    const system = data.systemName || 'target system';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Assess Current State',
            description: 'Thoroughly audit the existing system to understand data structures, dependencies, and constraints before migration.',
            actions: [
              'Inventory all data schemas, volumes, and formats',
              'Identify external dependencies and integrations',
              'Document current SLAs and performance baselines',
              'Catalog known data quality issues or anomalies',
              'Estimate migration complexity and risk score',
            ],
          },
          {
            step: 2,
            title: 'Plan Migration Strategy',
            description: 'Design a detailed migration plan covering scope, phasing, rollback triggers, and communication.',
            actions: [
              'Choose migration strategy: big-bang vs phased vs parallel-run',
              'Define data transformation and mapping rules',
              'Set rollback criteria and decision thresholds',
              'Schedule maintenance windows and stakeholder notifications',
              'Prepare runbook with step-by-step execution instructions',
            ],
          },
          {
            step: 3,
            title: 'Dry Run in Staging',
            description: 'Execute the full migration against a production-like staging environment to surface issues safely.',
            actions: [
              'Restore latest production snapshot to staging',
              'Execute migration scripts and transformation jobs',
              'Measure duration and resource utilization',
              'Run automated data integrity checks',
              'Document all errors and edge cases encountered',
            ],
          },
          {
            step: 4,
            title: 'Execute Production Migration',
            description: 'Perform the actual migration with real-time monitoring and a dedicated war room for incident response.',
            actions: [
              'Enable maintenance mode or traffic cut-over',
              'Take final production backup and verify integrity',
              'Execute migration in agreed sequence with checkpoints',
              'Monitor progress via dashboards and logs in real time',
              'Communicate status updates to stakeholders every 30 min',
            ],
          },
          {
            step: 5,
            title: 'Validate Post-Migration',
            description: 'Confirm data completeness, correctness, and system health before declaring success.',
            actions: [
              'Run row-count and checksum comparisons between source and target',
              'Execute smoke tests and critical path user journeys',
              'Verify application logs show no unexpected errors',
              'Confirm performance metrics meet pre-defined SLAs',
              'Obtain sign-off from business and technical stakeholders',
            ],
          },
          {
            step: 6,
            title: 'Rollback Plan & Post-Mortem',
            description: 'Document rollback procedures and capture lessons learned to improve future migrations.',
            actions: [
              'Keep rollback scripts ready for 48h post-migration window',
              'Define automated rollback triggers (error rate thresholds)',
              'Schedule post-mortem within 3 business days',
              'Update runbook with lessons learned',
              'Archive migration artifacts and metrics for audit trail',
            ],
          },
        ],
        summary: `Migration guide for ${system} completed: 6-step process covering assessment through rollback planning to ensure safe, auditable migration.`,
      },
      duration: Date.now() - start,
    };
  },
};
