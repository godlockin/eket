import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface DatabaseSchemaInput {
  systemName: string;
  entities?: string[];
  dbType?: 'relational' | 'document' | 'graph' | 'timeseries';
  scalingTarget?: string;
}

export interface DatabaseSchemaOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const databaseSchemaSkill: Skill<DatabaseSchemaInput, DatabaseSchemaOutput> = {
  name: 'database-schema',
  category: SkillCategory.DESIGN,
  description: 'Design a normalized, performant database schema with proper indexing, constraints, and migration strategy.',
  version: '1.0.0',
  async execute(input: SkillInput<DatabaseSchemaInput>): Promise<SkillOutput<DatabaseSchemaOutput>> {
    const data = input as unknown as DatabaseSchemaInput;
    const start = Date.now();
    const dbType = data.dbType ?? 'relational';
    const entities = data.entities ?? [];
    const scalingTarget = data.scalingTarget ?? 'not specified';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Domain Modeling & Entity Identification',
            description: 'Identify all domain entities, their attributes, and relationships.',
            actions: [
              `Identify core entities for "${data.systemName}": ${entities.join(', ') || 'derive from domain model'}`,
              'Define entity attributes with data types, nullability, and uniqueness constraints',
              'Map entity relationships: one-to-one, one-to-many, many-to-many',
              'Create Entity-Relationship Diagram (ERD) using crow\'s foot notation',
              `Select database type: ${dbType} — validate fit against access patterns and scaling target: ${scalingTarget}`,
            ],
          },
          {
            step: 2,
            title: 'Normalization & Schema Design',
            description: 'Apply normalization rules to eliminate redundancy while balancing query performance.',
            actions: [
              'Apply 1NF: eliminate repeating groups, ensure atomic column values',
              'Apply 2NF: eliminate partial dependencies on composite primary keys',
              'Apply 3NF: eliminate transitive dependencies between non-key columns',
              'Identify cases for intentional denormalization (e.g., read-heavy aggregation tables)',
              'Define primary keys (prefer surrogate UUID/BIGINT over natural keys for flexibility)',
            ],
          },
          {
            step: 3,
            title: 'Constraints & Data Integrity',
            description: 'Define constraints to enforce data integrity at the database level.',
            actions: [
              'Define foreign key constraints with explicit ON DELETE / ON UPDATE behaviors (CASCADE, RESTRICT, SET NULL)',
              'Apply UNIQUE constraints for business keys (email, username, slug)',
              'Define CHECK constraints for range validation (e.g., price > 0, status IN (...))',
              'Add NOT NULL constraints for required fields; document nullable field rationale',
              'Design soft-delete pattern: use deleted_at TIMESTAMP instead of hard DELETE where audit required',
            ],
          },
          {
            step: 4,
            title: 'Index Strategy & Query Optimization',
            description: 'Design indexes to support critical query patterns without over-indexing.',
            actions: [
              'List top 10 most frequent and most critical queries for the system',
              'Add B-tree indexes for equality and range filters on high-cardinality columns',
              'Design composite indexes matching (equality columns first, then range/sort columns)',
              'Consider partial indexes for filtered queries (e.g., WHERE deleted_at IS NULL)',
              'Avoid indexing low-cardinality columns (boolean, status with few values) as standalone indexes',
            ],
          },
          {
            step: 5,
            title: 'Migration Strategy & Versioning',
            description: 'Plan schema evolution with backward-compatible migrations.',
            actions: [
              'Adopt migration tool: Flyway, Liquibase, or framework-native (e.g., Prisma Migrate, Alembic)',
              'Follow additive migration principle: add columns/tables first, migrate data, then remove old columns',
              'Write rollback scripts for every forward migration',
              'Test migrations against production-sized dataset snapshot in staging',
              'Document schema version history and breaking change log in repository',
            ],
          },
        ],
        summary: `${dbType} database schema design for "${data.systemName}" covering ${entities.length || 'all'} entities with normalization, integrity constraints, index strategy, and migration plan targeting ${scalingTarget}.`,
      },
      duration: Date.now() - start,
    };
  },
};
