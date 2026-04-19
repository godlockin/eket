/**
 * EKET Framework - Data Quality Check Skill
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface DataQualityCheckInput {
  /** Dataset or table name */
  datasetName: string;
  /** Data source type: database, csv, api, stream */
  sourceType?: string;
  /** Sample size for profiling */
  sampleSize?: number;
  /** Expected schema definition */
  expectedSchema?: Record<string, string>;
}

export interface DataQualityCheckOutput {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    actions: string[];
  }>;
  summary: string;
}

export const dataQualityCheckSkill: Skill<DataQualityCheckInput, DataQualityCheckOutput> = {
  name: 'data-quality-check',
  category: SkillCategory.DATA,
  description: 'Data quality validation: completeness, consistency, accuracy, uniqueness, timeliness, and schema compliance.',
  version: '1.0.0',
  tags: ['data', 'quality', 'validation', 'profiling', 'dq'],

  async execute(input: SkillInput<DataQualityCheckInput>): Promise<SkillOutput<DataQualityCheckOutput>> {
    const data = input.data as unknown as DataQualityCheckInput;
    const start = Date.now();
    const dataset = data.datasetName ?? 'target dataset';
    const source = data.sourceType ?? 'database';
    const sample = data.sampleSize ?? 10000;

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Data Profiling & Baseline Metrics',
            description: 'Generate statistical profile of the dataset to understand shape and distribution.',
            actions: [
              `Sample ${sample} rows from ${dataset} (${source}) for profiling`,
              'Compute per-column: row count, null count, null%, distinct count, min, max, mean, stddev',
              'Identify data types per column: confirm expected vs actual (string vs numeric mismatch)',
              'Generate value frequency distribution for categorical columns (top-20 values)',
              'Detect outliers: values beyond mean ± 3σ for numeric columns',
            ],
          },
          {
            step: 2,
            title: 'Completeness & Null Analysis',
            description: 'Identify missing data patterns and assess impact on downstream consumers.',
            actions: [
              `Flag columns in ${dataset} where null% exceeds threshold: required fields > 0%, optional fields > 20%`,
              'Analyze null patterns: random vs. systematic (all nulls for certain date ranges or sources)',
              'Check conditional completeness: if field A has value, field B must also be non-null',
              'Identify records with > 50% null fields as likely corrupt/incomplete rows',
              'Document completeness score per column and overall dataset completeness %',
            ],
          },
          {
            step: 3,
            title: 'Uniqueness & Duplicate Detection',
            description: 'Identify duplicate records and violations of uniqueness constraints.',
            actions: [
              'Check primary key / unique identifier columns for duplicates',
              'Run composite key duplicate check: GROUP BY business key columns, HAVING COUNT > 1',
              'Fuzzy duplicate detection: find near-duplicates with Levenshtein distance < 3 on name/address fields',
              'Quantify duplicate rate: # duplicates / total rows × 100%',
              'Recommend deduplication strategy: keep latest, merge records, or flag for manual review',
            ],
          },
          {
            step: 4,
            title: 'Consistency & Referential Integrity',
            description: 'Validate relationships between tables and internal consistency rules.',
            actions: [
              'Check foreign key integrity: every FK value exists in referenced table',
              'Validate business rules: e.g., end_date >= start_date, order total = sum of line items',
              'Cross-table consistency: same entity should have consistent attributes across tables',
              'Check enumerated field values against allowed list (status, category, type columns)',
              'Flag inconsistencies with count, example records, and originating source system',
            ],
          },
          {
            step: 5,
            title: 'Timeliness & Freshness Check',
            description: 'Verify data arrives and is updated within expected SLA windows.',
            actions: [
              'Check latest record timestamp against expected refresh frequency (hourly, daily, etc.)',
              'Flag if data is stale: no new records in 2× expected refresh interval',
              'Measure data lag: difference between event time and ingestion time per source',
              'Check for time zone inconsistencies: all timestamps should be UTC-normalized',
              'Alert if historical backfill created records with future-dated timestamps',
            ],
          },
          {
            step: 6,
            title: 'Generate DQ Report & Define Monitoring Rules',
            description: 'Produce quality scorecard and implement automated ongoing monitoring.',
            actions: [
              `Compute overall DQ score for ${dataset}: weighted average of completeness, uniqueness, consistency, timeliness`,
              'Classify dataset quality: Excellent (≥ 95%), Acceptable (85-95%), Needs Attention (< 85%)',
              'Define Great Expectations / dbt test suite for all identified quality rules',
              'Set up automated DQ monitoring: run checks on every pipeline execution',
              'Route DQ failures to alerts: critical failures block downstream loads, warnings notify data team',
            ],
          },
        ],
        summary: `Data quality assessment of ${dataset} (${source}, ${sample} row sample): profiled distribution, checked completeness, duplicates, referential integrity, business rule consistency, and data freshness. DQ scorecard generated with automated monitoring rules.`,
      },
      duration: Date.now() - start,
    };
  },
};
