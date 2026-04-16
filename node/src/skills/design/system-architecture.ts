import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface SystemArchitectureInput {
  systemName: string;
  requirements?: string[];
  scale?: string;
  deploymentTarget?: string;
}

export interface SystemArchitectureOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const systemArchitectureSkill: Skill<SystemArchitectureInput, SystemArchitectureOutput> = {
  name: 'system-architecture',
  category: SkillCategory.DESIGN,
  description: 'Design scalable system architecture covering components, communication patterns, data flow, and deployment topology.',
  version: '1.0.0',
  async execute(input: SkillInput<SystemArchitectureInput>): Promise<SkillOutput<SystemArchitectureOutput>> {
    const data = input as unknown as SystemArchitectureInput;
    const start = Date.now();
    const requirements = data.requirements ?? [];
    const scale = data.scale ?? 'medium';
    const deploymentTarget = data.deploymentTarget ?? 'cloud';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Requirements & Quality Attribute Analysis',
            description: 'Translate functional and non-functional requirements into architectural drivers.',
            actions: [
              `Document functional requirements for "${data.systemName}": ${requirements.join('; ') || 'gather from stakeholders'}`,
              'Identify quality attributes (QAs): availability, scalability, latency, security, maintainability',
              'Prioritize QAs using Architecture Tradeoff Analysis Method (ATAM) scoring',
              `Define scale targets: ${scale} — derive concrete metrics (RPS, DAU, data volume)`,
              'Document architectural constraints: budget, compliance (GDPR/SOC2), team expertise',
            ],
          },
          {
            step: 2,
            title: 'Architectural Style Selection',
            description: 'Choose the appropriate architectural style based on requirements and trade-offs.',
            actions: [
              'Evaluate architectural styles: monolith, modular monolith, microservices, event-driven, serverless',
              'Map quality attribute requirements to style trade-offs (e.g., microservices ↑ scalability, ↑ complexity)',
              'Define service boundaries using Domain-Driven Design (DDD) bounded contexts',
              'Select inter-service communication: synchronous (REST/gRPC) vs. asynchronous (message queue)',
              'Document Architecture Decision Records (ADRs) for each major style decision',
            ],
          },
          {
            step: 3,
            title: 'Component Design & Data Flow',
            description: 'Define system components, their responsibilities, and data flows.',
            actions: [
              'Create C4 model: Context → Container → Component diagrams',
              'Define each component: responsibility, interfaces, dependencies, and tech choices',
              'Map data flows: request/response paths, event streams, batch pipelines',
              'Design API gateway and service mesh topology for inter-service communication',
              'Identify shared infrastructure: auth service, config service, observability stack',
            ],
          },
          {
            step: 4,
            title: 'Reliability & Scalability Patterns',
            description: 'Apply proven patterns for fault tolerance and horizontal scaling.',
            actions: [
              'Design horizontal scaling strategy: stateless services, sticky session alternatives',
              'Implement circuit breaker pattern for external dependencies using exponential backoff',
              'Define caching strategy: CDN (static), in-memory (Redis/Memcached) for hot data, DB query cache',
              'Design data partitioning/sharding strategy for high-volume tables',
              'Plan for graceful degradation: feature flags, fallback responses, read replicas',
            ],
          },
          {
            step: 5,
            title: 'Deployment Topology & Observability',
            description: 'Design deployment infrastructure and observability framework.',
            actions: [
              `Design deployment topology for ${deploymentTarget}: containerization (Docker/K8s), IaC (Terraform/Pulumi)`,
              'Define environment promotion pipeline: dev → staging → canary → production',
              'Design observability stack: metrics (Prometheus/Datadog), logs (ELK/Loki), traces (Jaeger/Zipkin)',
              'Define SLOs: uptime %, p99 latency, error rate budget with alerting thresholds',
              'Document runbook for top 5 failure scenarios with detection, mitigation, and escalation steps',
            ],
          },
        ],
        summary: `System architecture design for "${data.systemName}" (${scale} scale, ${deploymentTarget} deployment) covering architectural style selection, component design, reliability patterns, and full observability stack.`,
      },
      duration: Date.now() - start,
    };
  },
};
