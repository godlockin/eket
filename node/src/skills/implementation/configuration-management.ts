import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface ConfigurationManagementInput {
  projectName: string;
  environments?: string[];
  hasSecrets?: boolean;
}

export interface ConfigurationManagementOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const configurationManagementSkill: Skill<ConfigurationManagementInput, ConfigurationManagementOutput> = {
  name: 'configuration-management',
  category: SkillCategory.DEVOPS,
  description: 'Establishes a robust configuration management system covering env hierarchy, secrets vault, feature flags, validation, and rotation.',
  version: '1.0.0',
  async execute(input: SkillInput<ConfigurationManagementInput>): Promise<SkillOutput<ConfigurationManagementOutput>> {
    const data = input as unknown as ConfigurationManagementInput;
    const start = Date.now();
    const project = data.projectName || 'project';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Define Environment Hierarchy',
            description: 'Establish a clear layered configuration model that separates defaults, environment-specific values, and local overrides.',
            actions: [
              'Create base config layer: defaults shared across all environments',
              'Add environment layers: development, staging, production',
              'Define local override layer (.env.local) excluded from version control',
              'Document precedence order: local > environment > base',
              'Use a single schema to validate all layers at startup',
            ],
          },
          {
            step: 2,
            title: 'Integrate Secrets Vault',
            description: 'Centralize secret management using a vault solution to eliminate hardcoded credentials.',
            actions: [
              'Adopt HashiCorp Vault, AWS Secrets Manager, or equivalent',
              'Migrate all credentials, API keys, and certificates to vault',
              'Implement dynamic secrets with short TTL where possible',
              'Configure audit logging for every secret access event',
              'Set up automated alerts for unauthorized access attempts',
            ],
          },
          {
            step: 3,
            title: 'Implement Feature Flags',
            description: 'Decouple deployment from release using feature flags to enable safe rollouts and A/B testing.',
            actions: [
              'Adopt a feature flag platform (LaunchDarkly, Unleash, or custom)',
              'Define flag naming convention: <service>.<feature>.<variant>',
              'Implement flag evaluation with fallback defaults',
              'Create kill-switch flags for all new high-risk features',
              'Add flag change audit trail integrated with incident tracking',
            ],
          },
          {
            step: 4,
            title: 'Schema Validation at Startup',
            description: 'Validate all configuration values at application boot to fail fast on misconfiguration.',
            actions: [
              'Define Zod or Joi schema covering all required config keys',
              'Validate types, ranges, and format constraints',
              'Throw descriptive error listing all missing/invalid fields',
              'Block application start on validation failure',
              'Add CI job to validate config schema against all environment files',
            ],
          },
          {
            step: 5,
            title: 'Credential Rotation Automation',
            description: 'Automate regular rotation of secrets to minimize blast radius of credential compromise.',
            actions: [
              'Implement zero-downtime rotation using dual-credential pattern',
              'Schedule rotation jobs: API keys 90d, DB passwords 30d, certs 365d',
              'Test rotation procedure in staging before production rollout',
              'Monitor for rotation failures and alert on-call team',
              'Document manual rotation runbook as fallback',
            ],
          },
        ],
        summary: `Configuration management framework for ${project} established: 5-step system covering env hierarchy, vault, feature flags, validation, and rotation.`,
      },
      duration: Date.now() - start,
    };
  },
};
