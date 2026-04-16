/**
 * EKET Framework - Analytics Query Optimization Skill
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface AnalyticsQueryInput {
  /** Query to optimize */
  query?: string;
  /** Database / query engine: postgresql, bigquery, snowflake, spark, presto */
  engine?: string;
  /** Table names involved */
  tables?: string[];
  /** Current query performance metrics */
  currentMetrics?: { durationMs?: number; bytesScanned?: number; rowsProcessed?: number };
}

export interface AnalyticsQueryOutput {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    actions: string[];
  }>;
  summary: string;
}

export const analyticsQuerySkill: Skill<AnalyticsQueryInput, AnalyticsQueryOutput> = {
  name: 'analytics-query',
  category: SkillCategory.DATA,
  description: 'Analytics query optimization: execution plan analysis, partitioning, indexing, query rewriting, materialization.',
  version: '1.0.0',
  tags: ['data', 'analytics', 'sql', 'query-optimization', 'performance'],

  async execute(input: SkillInput<AnalyticsQueryInput>): Promise<SkillOutput<AnalyticsQueryOutput>> {
    const data = input as unknown as AnalyticsQueryInput;
    const start = Date.now();
    const engine = data.engine ?? 'SQL database';
    const tables = data.tables?.join(', ') ?? 'target tables';
    const current = data.currentMetrics;
    const baseline = current
      ? `current: ${current.durationMs ?? '?'}ms, ${current.bytesScanned ?? '?'} bytes scanned`
      : 'no baseline provided';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Analyze Query Execution Plan',
            description: 'Understand how the query engine executes the query and identify bottlenecks.',
            actions: [
              `Run EXPLAIN ANALYZE (or ${engine} equivalent) on the target query`,
              'Identify sequential scans on large tables: flag for index or partition pruning',
              'Find expensive operations: hash joins on large tables, sort operations, nested loops',
              'Check estimated vs. actual row counts: large discrepancies indicate stale statistics',
              `Update table statistics: ANALYZE ${tables} (or equivalent for ${engine})`,
            ],
          },
          {
            step: 2,
            title: 'Apply Partition Pruning & Predicate Pushdown',
            description: 'Ensure queries scan only relevant partitions by pushing filters as early as possible.',
            actions: [
              'Confirm query filters on partition key columns (date, region, etc.) are present',
              'Verify predicates reference partition column directly (no function wrapping: DATE(ts) kills pruning)',
              'Check that JOIN predicates are pushed below aggregations in query plan',
              'Review subquery placement: move WHERE filters inside subqueries to reduce intermediate rows',
              `Measure partition scan reduction: before (${baseline}) vs. after optimization`,
            ],
          },
          {
            step: 3,
            title: 'Optimize Joins & Aggregations',
            description: 'Rewrite joins and aggregations for minimal data movement.',
            actions: [
              'Order joins: smallest filtered table first; use broadcast join for small dimension tables',
              'Replace correlated subqueries with JOIN or window functions',
              'Pre-aggregate before joining: reduce rows before expensive joins',
              'Use approximate functions where exact results not needed (APPROX_COUNT_DISTINCT, HyperLogLog)',
              'Evaluate window function alternatives to self-joins for running totals and ranks',
            ],
          },
          {
            step: 4,
            title: 'Index Design & Sort Key Optimization',
            description: 'Ensure proper index coverage and storage layout for query access patterns.',
            actions: [
              `For ${engine}: identify columns in WHERE, JOIN ON, ORDER BY, GROUP BY — add composite indexes`,
              'Check index cardinality: low-cardinality columns (boolean, status) benefit from bitmap indexes',
              'Review sort keys / cluster keys: aligned with most frequent GROUP BY / ORDER BY columns',
              'Identify covering indexes: include all SELECT columns to avoid table lookups',
              'Monitor index usage: drop unused indexes that add write overhead without read benefit',
            ],
          },
          {
            step: 5,
            title: 'Materialized Views & Result Caching',
            description: 'Pre-compute expensive aggregations and cache frequent query results.',
            actions: [
              'Identify top-10 most frequent query patterns: candidates for materialized views',
              'Create materialized view for expensive multi-table aggregations run > 10x/day',
              'Configure refresh schedule: real-time (incremental), hourly, or daily based on freshness SLA',
              'Enable result set caching (Snowflake result cache, BigQuery BI Engine) for dashboard queries',
              'Document view refresh latency and data freshness guarantees for consumers',
            ],
          },
          {
            step: 6,
            title: 'Benchmark & Document Optimizations',
            description: 'Measure improvement, document changes, and establish ongoing query governance.',
            actions: [
              'Run optimized query 5 times and record median duration, bytes scanned, rows processed',
              `Compare to baseline (${baseline}): calculate % improvement in each metric`,
              'Document each optimization applied with before/after EXPLAIN plan snippets',
              'Add query hints or comments explaining non-obvious optimization choices',
              'Set up query performance monitoring: alert if query regresses > 20% from optimized baseline',
            ],
          },
        ],
        summary: `Analytics query optimization for ${engine} on tables (${tables}): analyzed execution plan, applied partition pruning, rewrote joins, optimized indexes, evaluated materialization. Baseline: ${baseline}.`,
      },
      duration: Date.now() - start,
    };
  },
};
