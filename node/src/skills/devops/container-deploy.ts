import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface ContainerDeployInput {
  appName: string;
  orchestrator?: 'kubernetes' | 'docker-compose' | 'ecs';
  replicas?: number;
  hasStatefulDependencies?: boolean;
}

export interface ContainerDeployOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const containerDeploySkill: Skill<ContainerDeployInput, ContainerDeployOutput> = {
  name: 'container-deploy',
  category: SkillCategory.DEVOPS,
  description: 'Docker containerization and Kubernetes/ECS deployment guide with production-ready configuration',
  version: '1.0.0',
  async execute(input: SkillInput<ContainerDeployInput>): Promise<SkillOutput<ContainerDeployOutput>> {
    const data = input as unknown as ContainerDeployInput;
    const start = Date.now();
    const appName = data.appName || 'app';
    const orchestrator = data.orchestrator || 'kubernetes';
    const replicas = data.replicas || 3;
    const stateful = data.hasStatefulDependencies ?? false;

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Production Dockerfile',
            description: 'Write minimal, secure, multi-stage Dockerfile.',
            actions: [
              'Multi-stage build: Stage 1 (builder) installs deps + compiles. Stage 2 (runtime) copies only artifacts',
              'Use exact version tags: `node:20.11-alpine3.19` not `node:latest` — reproducible builds',
              'Run as non-root: `USER node` in final stage — principle of least privilege',
              'Set NODE_ENV=production in runtime stage — disables devDependencies, enables optimizations',
              'COPY only necessary files: use `.dockerignore` to exclude node_modules, .git, tests',
              'Final image size target: <150MB for Node.js apps — use `docker history` to find large layers',
            ],
          },
          {
            step: 2,
            title: 'Container Configuration & Secrets',
            description: 'Configure application for container runtime — 12-factor app principles.',
            actions: [
              'All config via environment variables — never bake config into image',
              'Secrets via secret store: Kubernetes Secrets / AWS Secrets Manager — never in Dockerfile ENV',
              'Health check endpoint: `GET /health` returns 200 + `{"status":"ok","version":"x.y.z"}`',
              'Graceful shutdown: handle SIGTERM, drain in-flight requests, close DB connections',
              'Log to stdout/stderr only — container runtime captures and routes logs',
              'Start time target: container healthy within 10s — lazy-load heavy dependencies if needed',
            ],
          },
          {
            step: 3,
            title: `${orchestrator === 'kubernetes' ? 'Kubernetes Manifests' : orchestrator === 'ecs' ? 'ECS Task Definition' : 'Docker Compose'} Configuration`,
            description: `Define ${orchestrator} resources with production-ready settings.`,
            actions: [
              orchestrator === 'kubernetes'
                ? `Deployment: replicas: ${replicas}, strategy: RollingUpdate (maxSurge: 1, maxUnavailable: 0)`
                : orchestrator === 'ecs'
                ? `Task definition: cpu: 256, memory: 512, desiredCount: ${replicas}, launchType: FARGATE`
                : `Services: ${appName} (replicas: ${replicas}), nginx reverse proxy, redis cache`,
              'Resource limits: set CPU request/limit and memory request/limit — prevent noisy neighbor',
              'Liveness probe: HTTP GET /health, initialDelaySeconds: 10, periodSeconds: 30',
              'Readiness probe: HTTP GET /ready, initialDelaySeconds: 5, periodSeconds: 10',
              stateful ? 'PersistentVolumeClaim: storage class, access mode, retention policy for stateful deps' : 'All state external: app is stateless, state in Redis/DB/S3',
              'Pod disruption budget: minAvailable: 1 — prevent all replicas being down during maintenance',
            ],
          },
          {
            step: 4,
            title: 'Networking & Service Exposure',
            description: 'Configure ingress, TLS, and internal service communication.',
            actions: [
              orchestrator === 'kubernetes'
                ? 'Service type: ClusterIP (internal) + Ingress (external) — never NodePort in production'
                : 'ALB/NLB target group with health check path and healthy threshold',
              'TLS termination: at load balancer/ingress — cert-manager for auto-renewal (Let\'s Encrypt)',
              'Internal service discovery: DNS-based (`http://service-name.namespace.svc.cluster.local`)',
              'Network policies (K8s): deny all ingress by default, whitelist only required pod-to-pod traffic',
              'Rate limiting at ingress: nginx-ingress `limit-rps` annotation or ALB WAF rules',
              'CORS headers: configure at ingress level, not in application code',
            ],
          },
          {
            step: 5,
            title: 'Scaling & Resource Management',
            description: 'Configure autoscaling to handle traffic spikes cost-efficiently.',
            actions: [
              orchestrator === 'kubernetes'
                ? 'HorizontalPodAutoscaler: scale on CPU >70% or custom metric (RPS/pod) — min/max replicas'
                : 'ECS Service Auto Scaling: target tracking on ALBRequestCountPerTarget',
              'Vertical autoscaling: VPA in recommendation mode — use data to right-size requests/limits',
              'Node autoscaling: Cluster Autoscaler (K8s) or ECS capacity provider with EC2 Auto Scaling',
              'Resource quotas: set namespace/account quotas to prevent runaway costs',
              'Spot/preemptible instances for stateless workloads: 60-80% cost reduction with proper handling',
              'Cost tagging: label all resources with team, project, environment for cost attribution',
            ],
          },
          {
            step: 6,
            title: 'Day-2 Operations',
            description: 'Operational practices for maintaining containers in production.',
            actions: [
              'Image update policy: automated Dependabot/Renovate PRs for base image updates',
              'Vulnerability scanning: weekly Trivy scan of running images — patch within SLA (critical: 24h)',
              'Log aggregation: FluentBit DaemonSet → Elasticsearch/CloudWatch Logs with retention policy',
              'Backup strategy: if stateful, automated daily backups with tested restore procedure',
              'Incident runbook: documented steps for common failures (OOMKilled, CrashLoopBackOff, image pull errors)',
              'Capacity planning: review resource utilization monthly, scale proactively before events',
            ],
          },
        ],
        summary: `Container deployment guide for "${appName}" using ${orchestrator} with ${replicas} replicas. Covers Dockerfile optimization, config management, ${orchestrator} manifests, networking, autoscaling, and day-2 ops. Stateful: ${stateful}.`,
      },
      duration: Date.now() - start,
    };
  },
};
