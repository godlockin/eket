/**
 * EKET Framework - SLA Management Skill
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface SlaManagementInput {
  /** Service name */
  serviceName: string;
  /** Customer-facing or internal SLA */
  slaType?: 'external' | 'internal';
  /** Current availability metrics (e.g., 99.5) */
  currentAvailability?: number;
  /** Target SLA tier: 99, 99.9, 99.95, 99.99 */
  targetSla?: number;
  /** Key user journeys to protect */
  criticalJourneys?: string[];
}

export interface SlaManagementOutput {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    actions: string[];
  }>;
  summary: string;
}

export const slaManagementSkill: Skill<SlaManagementInput, SlaManagementOutput> = {
  name: 'sla-management',
  category: SkillCategory.OPS,
  description: 'SLA definition and monitoring: define SLOs, error budgets, SLIs, alerting, and review cadence.',
  version: '1.0.0',
  tags: ['ops', 'sla', 'slo', 'sli', 'reliability', 'error-budget', 'monitoring'],

  async execute(input: SkillInput<SlaManagementInput>): Promise<SkillOutput<SlaManagementOutput>> {
    const data = input.data as unknown as SlaManagementInput;
    const start = Date.now();
    const service = data.serviceName ?? 'target service';
    const slaType = data.slaType ?? 'external';
    const target = data.targetSla ?? 99.9;
    const current = data.currentAvailability ?? 99.5;
    const journeys = data.criticalJourneys?.join(', ') ?? 'critical user journeys';

    // Error budget = (1 - SLA%) × 30 days in minutes
    const errorBudgetMinutes = ((100 - target) / 100) * 30 * 24 * 60;

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Define Service Level Indicators (SLIs)',
            description: 'Identify measurable signals that best represent user experience.',
            actions: [
              `For ${service}: define availability SLI = successful requests / total requests × 100%`,
              `Define latency SLI: % of requests completing within threshold (e.g., p99 < 500ms)`,
              `Define error rate SLI: 5xx responses / total responses < 0.1%`,
              `Map SLIs to critical user journeys: ${journeys}`,
              'Ensure SLI data is collected from the user-facing measurement point (not internal)',
            ],
          },
          {
            step: 2,
            title: 'Set Service Level Objectives (SLOs) & Error Budget',
            description: 'Define achievable reliability targets and calculate error budget allowance.',
            actions: [
              `Set SLO target: ${target}% availability for ${service} (${slaType} commitment)`,
              `Calculate error budget: ${errorBudgetMinutes.toFixed(0)} minutes/month of allowed downtime`,
              'Gap analysis: current ${current}% vs target ${target}% — quantify reliability improvement needed',
              'Define SLO window: rolling 28-day, calendar month, or trailing 90-day',
              'Document SLO rationale: business impact of each SLI missing target',
            ],
          },
          {
            step: 3,
            title: 'Implement SLI Measurement & Dashboards',
            description: 'Set up accurate, real-time SLI measurement and visibility.',
            actions: [
              'Instrument service with structured metrics: request count, error count, latency histogram',
              'Configure Prometheus/Datadog/CloudWatch metrics with proper labels (service, endpoint, status)',
              'Build SLO dashboard: real-time SLI gauges, error budget burn rate, trend graphs',
              'Implement synthetic monitoring: uptime checks from multiple regions every 60 seconds',
              'Set up SLO status page for stakeholders (internal or public status.service.com)',
            ],
          },
          {
            step: 4,
            title: 'Configure Error Budget Alerting',
            description: 'Set tiered alerts to warn before error budget is exhausted.',
            actions: [
              'Alert at 2% burn rate: 1-hour window consumes 2% of monthly budget → page on-call',
              'Alert at 5% burn rate: 6-hour window → P1 incident, freeze non-critical deployments',
              'Alert at error budget < 10% remaining: trigger reliability sprint, halt feature work',
              'Alert on error budget exhaustion: SLA violation imminent, executive escalation',
              'Tune alert thresholds to eliminate false positives (test against 90-day historical data)',
            ],
          },
          {
            step: 5,
            title: 'Operationalize Error Budget Policy',
            description: 'Define team policies for error budget consumption and reliability investment.',
            actions: [
              'Document error budget policy: if budget > 50% remaining, feature velocity continues normally',
              'Policy: if budget 10-50% remaining, 20% of engineering time allocated to reliability',
              'Policy: if budget < 10%, freeze non-critical deployments until replenished',
              'Establish change review process: high-risk changes require SRE approval when budget is low',
              'Track error budget consumption source: deployments vs. infrastructure vs. dependency failures',
            ],
          },
          {
            step: 6,
            title: 'SLA Review Cadence & Customer Communication',
            description: 'Establish monthly SLA reviews and define customer communication protocols.',
            actions: [
              'Schedule monthly SLO review: review actual vs. target, error budget consumption, top incidents',
              'Produce monthly reliability report: SLI trends, incident count, MTTR, MTBF',
              'Define customer communication protocol: notify within 15min of SLA breach, RCA within 5 days',
              `Update ${slaType} SLA contract if persistent gap between target (${target}%) and actual (${current}%)`,
              'Plan annual SLO renegotiation: raise targets as reliability improves, align with business needs',
            ],
          },
        ],
        summary: `SLA management for ${service} (${slaType}, target ${target}%): defined SLIs for ${journeys}, set SLOs with ${errorBudgetMinutes.toFixed(0)}-minute/month error budget, instrumented measurement, configured burn-rate alerts, formalized error budget policy, and established review cadence.`,
      },
      duration: Date.now() - start,
    };
  },
};
