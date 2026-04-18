/**
 * EKET Framework - ETL Pipeline Design Skill
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface EtlDesignInput {
  /** Pipeline name */
  pipelineName: string;
  /** Source systems */
  sources?: string[];
  /** Target systems / data warehouse */
  targets?: string[];
  /** Expected data volume per run */
  dataVolume?: string;
  /** Refresh frequency: real-time, hourly, daily, weekly */
  frequency?: string;
}

export interface EtlDesignOutput {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    actions: string[];
  }>;
  summary: string;
}

export const etlDesignSkill: Skill<EtlDesignInput, EtlDesignOutput> = {
  name: 'etl-design',
  category: SkillCategory.DATA,
  description: 'ETL pipeline design: source analysis, extraction strategy, transformation logic, loading patterns, orchestration.',
  version: '1.0.0',
  tags: ['data', 'etl', 'pipeline', 'data-engineering', 'warehouse'],

  async execute(input: SkillInput<EtlDesignInput>): Promise<SkillOutput<EtlDesignOutput>> {
    const data = input.data as unknown as EtlDesignInput;
    const start = Date.now();
    const pipeline = data.pipelineName ?? 'ETL pipeline';
    const sources = data.sources?.join(', ') ?? 'source systems';
    const targets = data.targets?.join(', ') ?? 'target systems';
    const freq = data.frequency ?? 'daily';
    const volume = data.dataVolume ?? 'unspecified volume';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Source Analysis & Extraction Strategy',
            description: 'Understand source system capabilities and design the safest extraction approach.',
            actions: [
              `Analyze sources: ${sources} — document schema, record count, update mechanism, API rate limits`,
              'Choose extraction pattern: full load vs. incremental (CDC, watermark, log-based)',
              'For incremental: identify reliable change indicator (updated_at, sequence, CDC log)',
              'Assess source system impact: read replica, off-peak scheduling, or shadow copy',
              `Define extraction job for ${freq} frequency targeting ${volume} data volume`,
            ],
          },
          {
            step: 2,
            title: 'Data Staging & Raw Layer Design',
            description: 'Design immutable raw landing zone to preserve source fidelity.',
            actions: [
              'Create raw/staging tables mirroring source schema exactly (no transformations)',
              'Add pipeline metadata columns: ingested_at, source_system, pipeline_run_id, batch_id',
              'Choose storage format: Parquet (analytics), Avro (streaming), JSON (flexibility)',
              'Implement partitioning strategy: partition by date + source for efficient pruning',
              'Set retention policy for raw data (e.g., 7 years for compliance, 90 days for operational)',
            ],
          },
          {
            step: 3,
            title: 'Transformation Logic Design',
            description: 'Define data cleansing, business logic, and dimensional model transformations.',
            actions: [
              'Map source columns to target schema: document type casts, renames, derivations',
              'Define data cleansing rules: null handling, trim whitespace, normalize enumerations',
              'Apply business logic: calculate derived fields (revenue = quantity × unit_price)',
              'Design dimensional model (if DW target): identify fact tables, dimensions, SCD Type 1/2/3',
              'Write dbt models or SQL transformation scripts with unit tests for each rule',
            ],
          },
          {
            step: 4,
            title: 'Loading Strategy & Target Design',
            description: 'Design efficient load patterns for target systems.',
            actions: [
              `Target: ${targets} — analyze constraints (upsert support, bulk load limits, partition pruning)`,
              'Choose load pattern: full replace, incremental append, merge/upsert, SCD logic',
              'Design target table DDL: column types, sort keys, distribution keys, indexes',
              'Implement idempotent loads: re-running pipeline for same period produces same result',
              'Define transaction boundaries: atomic batch commits to prevent partial loads',
            ],
          },
          {
            step: 5,
            title: 'Error Handling & Recovery Design',
            description: 'Build robust error handling and pipeline recovery mechanisms.',
            actions: [
              'Implement dead letter queue: malformed records written to error table with reason',
              'Define retry policy: transient failures (3 retries with exponential backoff)',
              'Design checkpoint/restart: pipeline resumes from last successful batch after failure',
              'Set error thresholds: abort if > 1% records fail validation (configurable)',
              'Implement alerting: Slack/PagerDuty notification on pipeline failure with context',
            ],
          },
          {
            step: 6,
            title: 'Orchestration, Monitoring & Documentation',
            description: 'Integrate pipeline into orchestration framework and set up observability.',
            actions: [
              'Define Airflow/Prefect DAG: task dependencies, SLA expectations, retry config',
              'Implement pipeline metadata logging: rows extracted/transformed/loaded, duration, errors',
              'Create data lineage documentation: source → raw → staging → mart column mappings',
              'Set up dashboards: pipeline success rate, SLA compliance, data freshness metrics',
              `Document ${pipeline} runbook: how to trigger manually, re-run failed batches, debug errors`,
            ],
          },
        ],
        summary: `ETL pipeline design for ${pipeline}: sources (${sources}) → targets (${targets}), ${freq} frequency, ${volume}. Covers extraction strategy, staging, transformation, loading, error handling, orchestration, and monitoring.`,
      },
      duration: Date.now() - start,
    };
  },
};
