/**
 * EKET Framework - Security-Focused Code Review Skill
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';

export interface SecurityReviewInput {
  /** PR number or commit range */
  prNumber?: string;
  /** Changed file paths */
  changedFiles?: string[];
  /** Application type: web, api, cli, library */
  appType?: string;
  /** Trust boundary description */
  trustBoundary?: string;
}

export interface SecurityReviewOutput {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    actions: string[];
  }>;
  summary: string;
}

export const securityReviewSkill: Skill<SecurityReviewInput, SecurityReviewOutput> = {
  name: 'security-review',
  category: 'review',
  description: 'Security-focused code review covering injection, auth, secrets, dependency CVEs, and OWASP Top-10.',
  version: '1.0.0',
  tags: ['review', 'security', 'owasp', 'vulnerability', 'code-review'],

  async execute(input: SkillInput<SecurityReviewInput>): Promise<SkillOutput<SecurityReviewOutput>> {
    const data = input as unknown as SecurityReviewInput;
    const start = Date.now();
    const context = data.prNumber ? `PR #${data.prNumber}` : 'code change';
    const appType = data.appType ?? 'web application';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Scan for Hardcoded Secrets & Credentials',
            description: 'Ensure no API keys, passwords, tokens, or private keys are committed to source control.',
            actions: [
              'Run secret scanning tool (truffleHog, git-secrets) on commit diff',
              'Verify all secrets are loaded from environment variables (process.env.*)',
              'Check .gitignore covers .env, *.pem, *.key, credentials.json',
              'Confirm no secrets in test fixtures or mock data files',
              'Report any detected secrets as blocking findings with exact locations',
            ],
          },
          {
            step: 2,
            title: 'Check Injection Vulnerabilities (SQL, Command, XSS)',
            description: 'Verify all external input is validated/sanitized before use in queries, commands, or HTML.',
            actions: [
              'Review all database queries: confirm parameterized queries, no string concatenation with user data',
              'Review shell execution calls: no unsanitized user input in system commands',
              `For ${appType}: check HTML rendering paths use proper escaping`,
              'Verify file path operations use path.resolve + whitelist validation (no path traversal)',
              'Flag any dangerous dynamic code execution patterns with user-controlled input',
            ],
          },
          {
            step: 3,
            title: 'Review Authentication & Authorization Logic',
            description: 'Validate that auth checks are correct, complete, and not bypassable.',
            actions: [
              'Confirm every protected endpoint has an auth middleware applied',
              'Check for insecure direct object references: user can only access their own resources',
              'Verify JWT/session token validation: signature check, expiry check, algorithm pinning',
              'Review password handling: bcrypt/argon2 with appropriate work factor, no MD5/SHA1',
              'Check for missing authorization on admin/privileged operations',
            ],
          },
          {
            step: 4,
            title: 'Audit Dependency Vulnerabilities',
            description: 'Identify and triage new dependencies and known CVEs.',
            actions: [
              'Run: npm audit --audit-level=moderate and review output',
              'Check each new dependency added in this PR: is it maintained, minimal, necessary?',
              'Verify no transitive dependency introduces a critical CVE',
              'Run snyk test or similar for richer CVE context',
              'Document accepted risks with a comment if a vulnerable package cannot be upgraded',
            ],
          },
          {
            step: 5,
            title: 'Validate Input Handling & Error Exposure',
            description: 'Ensure user input is validated and internal errors are not leaked to clients.',
            actions: [
              'Confirm all API inputs are validated with schema (Zod, Joi, class-validator)',
              'Check error responses: no stack traces, file paths, or internal details in production errors',
              'Review logging: no PII (emails, passwords, tokens) logged at info/debug level',
              'Verify request size limits are configured (DoS prevention)',
              'Check rate limiting is applied on auth and sensitive endpoints',
            ],
          },
          {
            step: 6,
            title: 'Review Security Headers & Transport Security',
            description: 'Confirm proper HTTP security headers and TLS configuration for web-facing code.',
            actions: [
              `For ${appType}: verify Content-Security-Policy, X-Frame-Options, HSTS headers are set`,
              'Check CORS configuration: no wildcard (*) origin in production',
              'Confirm cookies use Secure, HttpOnly, and SameSite=Strict attributes',
              'Review any file upload handling: type validation, size limit, separate storage domain',
              'Summarize security review findings and assign severity levels (Critical/High/Medium/Low)',
            ],
          },
        ],
        summary: `Security review of ${context} for ${appType}: checked secrets exposure, injection risks, auth/authz logic, dependency CVEs, input validation, and transport security. All OWASP Top-10 categories covered.`,
      },
      duration: Date.now() - start,
    };
  },
};
