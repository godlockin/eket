import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface MonitoringSetupInput {
  environment?: 'kubernetes' | 'bare-metal' | 'aws' | 'gcp';
  services?: string[];
  alertingChannel?: 'pagerduty' | 'slack' | 'opsgenie' | 'email';
}

export interface MonitoringSetupOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const monitoringSetupSkill: Skill<MonitoringSetupInput, MonitoringSetupOutput> = {
  name: 'monitoring-setup',
  category: SkillCategory.DEVOPS,
  description: 'Full observability stack setup: metrics (Prometheus/Grafana), logs (Loki), traces (Jaeger/OTEL), alerts',
  version: '1.0.0',
  async execute(input: SkillInput<MonitoringSetupInput>): Promise<SkillOutput<MonitoringSetupOutput>> {
    const data = input.data as unknown as MonitoringSetupInput;
    const start = Date.now();
    const env = data.environment || 'kubernetes';
    const services = data.services || ['api-gateway', 'user-service', 'database'];
    const alerting = data.alertingChannel || 'pagerduty';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Define Observability Strategy (Three Pillars)',
            description: 'Plan metrics, logs, and traces before implementing — avoid partial observability.',
            actions: [
              'Metrics (Prometheus): numeric time-series — CPU, request rate, error rate, latency percentiles',
              'Logs (Loki/CloudWatch): text events with context — errors, audit trail, debug info',
              'Traces (Jaeger/Tempo): distributed request flow — identify latency across service boundaries',
              'Define SLOs: error rate < 0.1%, p99 latency < 500ms, availability > 99.9%',
              'Identify golden signals per service: latency, traffic, errors, saturation (Google SRE)',
              `Services to instrument: ${services.join(', ')}`,
            ],
          },
          {
            step: 2,
            title: 'Metrics Stack: Prometheus + Grafana',
            description: 'Deploy Prometheus for collection and Grafana for visualization.',
            actions: [
              env === 'kubernetes'
                ? 'Deploy: `helm install prometheus prometheus-community/kube-prometheus-stack`'
                : 'Install Prometheus binary, configure prometheus.yml with scrape targets',
              'Instrument application: expose `/metrics` endpoint with prom-client (Node.js) or prometheus-client (Python)',
              'Expose RED metrics per service: Request rate, Error rate, Duration (histogram)',
              'Add USE metrics for infrastructure: Utilization, Saturation, Errors per resource',
              'Configure recording rules for expensive queries (pre-compute aggregations)',
              'Set data retention: 15 days in Prometheus, long-term in Thanos/Cortex/Mimir',
            ],
          },
          {
            step: 3,
            title: 'Log Aggregation: Loki + FluentBit',
            description: 'Centralize logs with structured format for efficient querying.',
            actions: [
              env === 'kubernetes'
                ? 'Deploy FluentBit as DaemonSet — collects logs from all pods automatically'
                : 'Install FluentBit/Filebeat on each host — tail application log files',
              'Enforce structured logging: JSON format with fields: timestamp, level, service, traceId, message',
              'Add correlation IDs: inject X-Request-ID header, propagate through all service calls',
              'Configure log levels: ERROR and WARN always on, INFO in staging, DEBUG off in production',
              'Set retention policy: hot (3 days) → warm (30 days) → cold/archive (1 year)',
              'Create Grafana Loki datasource and test with `{service="api-gateway"} |= "ERROR"`',
            ],
          },
          {
            step: 4,
            title: 'Distributed Tracing: OpenTelemetry',
            description: 'Instrument services for end-to-end request tracing across service boundaries.',
            actions: [
              'Install OpenTelemetry SDK per language (auto-instrumentation where available)',
              'Configure OTLP exporter to Jaeger/Grafana Tempo endpoint',
              'Propagate trace context via W3C TraceContext headers between services',
              'Instrument custom spans for critical business operations: payment processing, auth flows',
              'Sample strategy: 100% errors, 10% success traces — reduce storage while preserving signal',
              'Link traces to logs: inject traceId into log records for correlation in Grafana',
            ],
          },
          {
            step: 5,
            title: 'Alerting Rules & On-Call Setup',
            description: `Configure meaningful alerts that page humans only when action is required. Channel: ${alerting}.`,
            actions: [
              'SLO burn rate alerts: alert when error budget burns 5x faster than expected (fast-burn)',
              'Symptom-based alerts: alert on user-facing impact (high error rate) not causes (high CPU)',
              `Severity tiers: P1 (service down → page ${alerting} immediately) / P2 (degraded → Slack) / P3 (warning → ticket)`,
              'Alert fatigue prevention: start with <5 P1 alerts, prove they require action before adding more',
              'Dead man\'s switch: alert if monitoring pipeline itself stops sending heartbeat',
              'Runbook links: every alert must link to runbook with diagnosis + remediation steps',
            ],
          },
          {
            step: 6,
            title: 'Dashboards & Ongoing Practice',
            description: 'Build dashboards that enable rapid incident diagnosis.',
            actions: [
              'Service overview dashboard: traffic, error rate, latency p50/p95/p99, saturation — visible at a glance',
              'Infrastructure dashboard: node CPU/memory/disk, pod restarts, HPA scaling events',
              'Business metrics dashboard: orders/min, active users, conversion rate — non-technical stakeholders',
              'Conduct quarterly alerting review: false positive rate > 10% → alert needs tuning',
              'Chaos engineering: run Game Day — kill a pod, verify alerts fire within 2 minutes',
              'On-call onboarding: new engineers shadow for 2 weeks before solo on-call rotation',
            ],
          },
        ],
        summary: `Full observability stack for ${env} — metrics (Prometheus/Grafana), logs (Loki/FluentBit), traces (OpenTelemetry/Jaeger), alerts via ${alerting}. Monitoring ${services.length} services: ${services.join(', ')}.`,
      },
      duration: Date.now() - start,
    };
  },
};
