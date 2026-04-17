/**
 * EKET Framework - Capacity Planning Skill
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface CapacityPlanningInput {
  /** Service or system name */
  serviceName: string;
  /** Current resource metrics */
  currentMetrics?: {
    cpuUtilization?: number;
    memoryUtilizationPercent?: number;
    rps?: number;
    p99LatencyMs?: number;
  };
  /** Expected growth rate (e.g., "50% YoY") */
  growthRate?: string;
  /** Planning horizon in months */
  horizonMonths?: number;
  /** Infrastructure type: cloud, on-prem, hybrid */
  infraType?: string;
}

export interface CapacityPlanningOutput {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    actions: string[];
  }>;
  summary: string;
}

export const capacityPlanningSkill: Skill<CapacityPlanningInput, CapacityPlanningOutput> = {
  name: 'capacity-planning',
  category: SkillCategory.OPS,
  description: 'Capacity planning and forecasting: baseline analysis, growth modeling, resource projection, scaling strategy.',
  version: '1.0.0',
  tags: ['ops', 'capacity', 'planning', 'forecasting', 'scalability', 'infrastructure'],

  async execute(input: SkillInput<CapacityPlanningInput>): Promise<SkillOutput<CapacityPlanningOutput>> {
    const data = input.data as unknown as CapacityPlanningInput;
    const start = Date.now();
    const service = data.serviceName ?? 'target service';
    const growth = data.growthRate ?? '20% YoY';
    const horizon = data.horizonMonths ?? 12;
    const infra = data.infraType ?? 'cloud';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Establish Current Capacity Baseline',
            description: 'Collect accurate resource utilization metrics to understand current headroom.',
            actions: [
              `Gather 90-day utilization metrics for ${service}: CPU, memory, disk I/O, network throughput`,
              'Identify peak utilization windows: time of day, day of week, seasonal patterns',
              'Calculate current headroom: usable capacity = total capacity × 0.7 (30% safety margin)',
              'Document current auto-scaling thresholds and whether they trigger correctly',
              'Identify resource bottlenecks: which dimension (CPU/memory/I/O) saturates first',
            ],
          },
          {
            step: 2,
            title: 'Model Traffic & Usage Growth',
            description: 'Project future demand using historical trends and business growth expectations.',
            actions: [
              `Apply growth model: ${growth} to current RPS/DAU baseline`,
              'Separate organic growth from planned initiatives (product launches, marketing campaigns)',
              `Project key metrics at 3, 6, 12, and ${horizon} months out`,
              'Build pessimistic (2× expected) and optimistic (0.5× expected) scenarios',
              'Identify cliff points: when current infrastructure will be fully saturated',
            ],
          },
          {
            step: 3,
            title: 'Identify Capacity Gaps & Scaling Requirements',
            description: 'Compare projected demand against current and planned capacity to find gaps.',
            actions: [
              'Plot projected demand curves against capacity limits on timeline chart',
              'Identify first capacity breach date for each resource dimension',
              'Quantify gap: additional instances, cores, memory, or storage needed per projection',
              `For ${infra}: map capacity gaps to specific resource types (instance size, node count, storage tier)`,
              'Prioritize gaps by urgency: < 3 months = urgent, 3-6 months = planned, > 6 months = roadmap',
            ],
          },
          {
            step: 4,
            title: 'Design Scaling Architecture',
            description: 'Define horizontal/vertical scaling strategies and automation.',
            actions: [
              'Evaluate horizontal scaling: confirm stateless components, session handling, data consistency',
              'Define auto-scaling policies: scale-out threshold, scale-in threshold, cooldown periods',
              'Design database scaling: read replicas, connection pooling, sharding strategy',
              'Plan CDN/caching tier expansion to offload origin infrastructure',
              'Document scaling runbook: manual scale-up procedure for emergency situations',
            ],
          },
          {
            step: 5,
            title: 'Cost Modeling & Budget Planning',
            description: 'Estimate infrastructure costs for capacity expansion across scenarios.',
            actions: [
              'Build cost model: current spend per unit (per RPS, per user, per GB)',
              `Project costs at each milestone: 3, 6, 12, ${horizon} months under expected growth`,
              'Compare Reserved vs. On-Demand vs. Spot pricing for baseline + burst capacity',
              'Identify cost optimization opportunities: right-sizing, committed use discounts, storage tiering',
              'Present budget ask with ROI justification: cost per unit served remains flat or improves',
            ],
          },
          {
            step: 6,
            title: 'Capacity Review Cadence & Monitoring',
            description: 'Establish ongoing capacity governance to keep plan current.',
            actions: [
              'Set capacity utilization alerts: warn at 70%, critical at 85% of any resource limit',
              'Schedule quarterly capacity reviews: refresh projections with latest actuals',
              'Define capacity KPIs: headroom %, time-to-saturation, cost-per-unit-served',
              'Create capacity dashboard: current utilization, projected saturation dates, scaling events',
              'Document escalation path: who approves emergency capacity additions and within what SLA',
            ],
          },
        ],
        summary: `Capacity plan for ${service} (${infra}, ${horizon}-month horizon, ${growth} growth): baselined utilization, modeled demand, identified capacity gaps, designed scaling architecture, cost-modeled scenarios, established monitoring cadence.`,
      },
      duration: Date.now() - start,
    };
  },
};
