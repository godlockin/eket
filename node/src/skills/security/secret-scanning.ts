/**
 * EKET Framework - Secret Scanning Skill
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface SecretScanningInput {
  /** Repository path or PR diff to scan */
  repoPath?: string;
  /** Specific file paths to scan */
  filePaths?: string[];
  /** Branch or commit range */
  commitRange?: string;
  /** Scan mode: full-repo, diff, staged */
  scanMode?: string;
}

export interface SecretScanningOutput {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    actions: string[];
  }>;
  summary: string;
}

export const secretScanningSkill: Skill<SecretScanningInput, SecretScanningOutput> = {
  name: 'secret-scanning',
  category: SkillCategory.SECURITY,
  description: 'Secrets and credentials scanning: detect API keys, tokens, passwords, private keys in code and history.',
  version: '1.0.0',
  tags: ['security', 'secret-scanning', 'credentials', 'compliance', 'devsecops'],

  async execute(input: SkillInput<SecretScanningInput>): Promise<SkillOutput<SecretScanningOutput>> {
    const data = input.data as unknown as SecretScanningInput;
    const start = Date.now();
    const target = data.repoPath ?? 'repository';
    const mode = data.scanMode ?? 'full-repo';
    const range = data.commitRange ?? 'HEAD~1..HEAD';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Configure & Run Automated Secret Scanners',
            description: 'Execute multiple complementary scanning tools to maximize detection coverage.',
            actions: [
              `Run truffleHog3 on ${target} (${mode} mode): trufflehog git file://${target} --only-verified`,
              `Run gitleaks on commit range: gitleaks detect --source ${target} --log-opts="${range}"`,
              'Run detect-secrets baseline scan: detect-secrets scan > .secrets.baseline',
              'Run GitHub Secret Scanning (if hosted on GitHub) and review alerts',
              'Combine all tool outputs into unified findings list with deduplication',
            ],
          },
          {
            step: 2,
            title: 'Scan for High-Risk Secret Patterns',
            description: 'Apply regex patterns for common credential types across all target files.',
            actions: [
              'Scan for AWS credentials: AKIA[0-9A-Z]{16} and 40-char secret key pattern',
              'Scan for private key PEM headers: -----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----',
              'Scan for generic high-entropy strings (> 4.5 bits/char in base64/hex blocks > 20 chars)',
              'Scan for connection strings: jdbc:, mongodb://, redis://, postgres:// with credentials embedded',
              'Scan for OAuth tokens, JWT secrets, and webhook signing keys in config files',
            ],
          },
          {
            step: 3,
            title: 'Audit Git History for Previously Committed Secrets',
            description: 'Search full commit history to detect secrets that may have been removed but remain in history.',
            actions: [
              `Run: git log --all --full-history -p -- "*.env" "*.key" "*.pem" in ${target}`,
              'Run truffleHog with --since-commit flag from repo creation to HEAD',
              'Check for .env files ever committed: git log --all --full-history -- .env',
              'Identify if any secrets found in history are still active (not rotated)',
              'Document each historical secret finding with commit SHA, date, and author',
            ],
          },
          {
            step: 4,
            title: 'Triage & Validate Findings',
            description: 'Distinguish true positives from false positives and assess current exposure.',
            actions: [
              'For each finding: attempt to validate if the credential is currently active/valid',
              'Classify: Confirmed Active (critical) > Possibly Active (high) > Likely Expired (medium) > False Positive',
              'Check if secret is in production config, test-only, or example placeholder',
              'Identify the secret type, owning service, and last-used timestamp from provider',
              'Escalate all Confirmed Active findings immediately to security team',
            ],
          },
          {
            step: 5,
            title: 'Remediate: Rotate Secrets & Clean History',
            description: 'Revoke exposed credentials and scrub them from repository history.',
            actions: [
              'Immediately revoke/rotate all Confirmed Active secrets in their respective service portals',
              'Replace hardcoded values with environment variable references (process.env.SECRET_NAME)',
              'Clean git history using git-filter-repo: git filter-repo --path-glob "*.env" --invert-paths',
              'Force-push cleaned history (coordinate with team to avoid disruption)',
              'Verify scrubbing: re-run scanners on cleaned history to confirm zero findings',
            ],
          },
          {
            step: 6,
            title: 'Implement Prevention Controls',
            description: 'Set up pre-commit hooks and CI gates to prevent future secret commits.',
            actions: [
              'Install pre-commit hook: gitleaks protect --staged as git pre-commit hook',
              'Add GitHub Actions / CI step: gitleaks detect on every PR',
              'Configure .gitleaksignore for known false positives with expiry dates',
              'Add .env.example with placeholder values; enforce no real .env files in repo',
              'Document secret rotation runbook and add to onboarding checklist',
            ],
          },
        ],
        summary: `Secret scanning of ${target} (${mode}, range: ${range}): automated tool scan, pattern-based detection, full git history audit, triage of findings, remediation via secret rotation and history cleaning, prevention controls implemented.`,
      },
      duration: Date.now() - start,
    };
  },
};
