import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface CIPipelineInput {
  platform?: 'github-actions' | 'gitlab-ci' | 'jenkins' | 'circleci';
  language?: string;
  deployTarget?: 'kubernetes' | 'aws-ecs' | 'heroku' | 'vercel' | 'bare-metal';
  hasDockerRegistry?: boolean;
}

export interface CIPipelineOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const ciPipelineSkill: Skill<CIPipelineInput, CIPipelineOutput> = {
  name: 'ci-pipeline',
  category: SkillCategory.DEVOPS,
  description: 'Design and implement CI/CD pipeline with quality gates, security scanning, and zero-downtime deployment',
  version: '1.0.0',
  async execute(input: SkillInput<CIPipelineInput>): Promise<SkillOutput<CIPipelineOutput>> {
    const data = input as unknown as CIPipelineInput;
    const start = Date.now();
    const platform = data.platform || 'github-actions';
    const lang = data.language || 'TypeScript/Node.js';
    const deployTarget = data.deployTarget || 'kubernetes';
    const hasRegistry = data.hasDockerRegistry ?? true;

    const platformFiles: Record<string, string> = {
      'github-actions': '.github/workflows/ci.yml',
      'gitlab-ci': '.gitlab-ci.yml',
      'jenkins': 'Jenkinsfile',
      'circleci': '.circleci/config.yml',
    };

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Pipeline Architecture Design',
            description: `Design stage-gate pipeline for ${lang} on ${platform}.`,
            actions: [
              `Pipeline stages: validate → build → test → security-scan → package → deploy-staging → smoke-test → deploy-prod`,
              `Config file: ${platformFiles[platform] || '.github/workflows/ci.yml'}`,
              'Fail fast principle: linting/type-check first (seconds) before tests (minutes)',
              'Parallel execution: unit tests + linting + security scan run concurrently',
              'Environment strategy: dev (every commit) → staging (every merge) → prod (manual trigger or tag)',
              'Branch protection: require CI green + 1 reviewer before merge to main',
            ],
          },
          {
            step: 2,
            title: 'Code Quality Gates',
            description: 'Enforce quality standards automatically — no manual code quality reviews needed.',
            actions: [
              `${lang.includes('TypeScript') ? 'Type check: `tsc --noEmit` — fail on any type error' : 'Static analysis: run language linter with zero-warning policy'}`,
              'Lint: ESLint/Pylint with team ruleset — treat warnings as errors in CI',
              'Format check: Prettier/Black diff — fail if any file would be reformatted',
              'Test coverage gate: fail if coverage drops below configured threshold',
              'Dependency audit: `npm audit --audit-level=high` — fail on high/critical CVEs',
              'Secret scanning: detect accidental credential commits before they reach repo history',
            ],
          },
          {
            step: 3,
            title: 'Build & Package',
            description: 'Create reproducible, immutable build artifacts.',
            actions: [
              'Dependency caching: cache node_modules keyed on lockfile hash — 3-5x faster CI',
              'Build: `npm run build` — output to `dist/` or Docker image',
              hasRegistry ? 'Docker build: multi-stage Dockerfile (builder + runtime layers) — minimize image size' : 'Create tarball artifact with build output + dependencies',
              hasRegistry ? `Push to registry with two tags: \`sha-${platform === 'github-actions' ? '${{ github.sha }}' : '${CI_COMMIT_SHA}'}\` (immutable) + \`latest\` (mutable)` : 'Upload artifact to CI storage with build number as identifier',
              'Record build provenance: record git SHA, build time, builder identity in artifact metadata',
              'Image scanning: Trivy or Snyk scan Docker image for OS-level CVEs before push',
            ],
          },
          {
            step: 4,
            title: 'Staging Deployment & Validation',
            description: 'Deploy to staging and validate before production.',
            actions: [
              `Deploy to staging ${deployTarget}: apply manifests/config with new image tag`,
              'Wait for rollout: poll deployment status until all pods healthy (or timeout)',
              'Run smoke tests: hit critical endpoints (health, auth, core API) — fail fast if broken',
              'Run E2E tests against staging: cover top 5 user journeys',
              'Performance check: run k6 smoke load test — ensure p99 < threshold',
              'Manual approval gate (optional): require QA sign-off before production deploy',
            ],
          },
          {
            step: 5,
            title: 'Production Deployment Strategy',
            description: 'Zero-downtime deployment with automatic rollback capability.',
            actions: [
              deployTarget === 'kubernetes' ? 'Rolling update: maxSurge=1, maxUnavailable=0 — always have capacity during rollout' : 'Blue-green deployment: switch LB target after health check passes',
              'Deployment window: restrict to business hours unless hotfix (reduce blast radius)',
              'Readiness probe: new pods must pass health check before old pods are terminated',
              'Rollback trigger: if error rate > 1% within 5min of deploy, auto-rollback to previous image tag',
              'Notify on deploy: Slack/PagerDuty message with SHA, environment, deployer identity',
              'Post-deploy verification: run monitoring dashboard check, confirm key metrics nominal',
            ],
          },
          {
            step: 6,
            title: 'Observability & Pipeline Maintenance',
            description: 'Track pipeline health and optimize for developer velocity.',
            actions: [
              'Track pipeline metrics: build duration, success rate, MTTR (mean time to restore)',
              'Alert on pipeline failures: post to Slack #eng-alerts with link to failed run',
              'Cache hit rate: monitor cache effectiveness, update cache keys if invalidating too often',
              'Review pipeline monthly: identify slowest stages, parallelization opportunities',
              'Dependency pinning: pin all action versions (`actions/checkout@v4`) — prevent supply-chain attacks',
              'Secret rotation: rotate CI secrets quarterly, use short-lived OIDC tokens where possible',
            ],
          },
        ],
        summary: `CI/CD pipeline design for ${lang} on ${platform} → deploy to ${deployTarget}. 8-stage pipeline: validate → build → test → security → package → staging → smoke → prod. Zero-downtime with auto-rollback.`,
      },
      duration: Date.now() - start,
    };
  },
};
