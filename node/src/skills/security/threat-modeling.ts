/**
 * EKET Framework - STRIDE Threat Modeling Skill
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface ThreatModelingInput {
  /** System or feature name */
  systemName: string;
  /** Brief system description */
  description?: string;
  /** Components involved (e.g., frontend, API, database, message queue) */
  components?: string[];
  /** Trust boundaries (e.g., internet-to-DMZ, DMZ-to-internal) */
  trustBoundaries?: string[];
}

export interface ThreatModelingOutput {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    actions: string[];
  }>;
  summary: string;
}

export const threatModelingSkill: Skill<ThreatModelingInput, ThreatModelingOutput> = {
  name: 'threat-modeling',
  category: SkillCategory.SECURITY,
  description: 'STRIDE threat modeling: decompose system, identify threats per category, rate risk, define mitigations.',
  version: '1.0.0',
  tags: ['security', 'threat-modeling', 'stride', 'risk-assessment', 'architecture'],

  async execute(input: SkillInput<ThreatModelingInput>): Promise<SkillOutput<ThreatModelingOutput>> {
    const data = input as unknown as ThreatModelingInput;
    const start = Date.now();
    const system = data.systemName ?? 'target system';
    const components = data.components?.join(', ') ?? 'system components';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Decompose System & Draw Data Flow Diagram',
            description: 'Map all components, data stores, external entities, and data flows to establish scope.',
            actions: [
              `List all components of ${system}: ${components}`,
              'Draw DFD (Level 0 context + Level 1 detail): show data flows between components',
              'Mark trust boundaries on the DFD (e.g., internet ↔ API gateway, API ↔ DB)',
              'Identify all entry points: user inputs, API endpoints, file uploads, webhooks',
              'Document all data stores and what sensitive data each holds',
            ],
          },
          {
            step: 2,
            title: 'Apply STRIDE: Spoofing & Tampering',
            description: 'Identify threats related to identity spoofing and unauthorized data modification.',
            actions: [
              'Spoofing: list all authentication points; threat = attacker impersonates legitimate user/service',
              'Verify each auth mechanism: tokens validated server-side, no client-side-only auth',
              'Tampering: identify all data flows that cross trust boundaries',
              'Verify integrity protection: HMAC signatures, TLS in transit, checksums for downloads',
              'Rate each threat: Likelihood (1-5) × Impact (1-5) = Risk Score; prioritize > 15',
            ],
          },
          {
            step: 3,
            title: 'Apply STRIDE: Repudiation & Information Disclosure',
            description: 'Address non-repudiation gaps and sensitive data exposure vectors.',
            actions: [
              'Repudiation: identify actions that need audit trails (financial ops, admin changes)',
              'Verify audit logs are immutable, include actor/timestamp/resource, cannot be deleted by actor',
              'Information Disclosure: list all data flows containing PII, credentials, or business secrets',
              'Verify encryption at rest (AES-256) and in transit (TLS 1.2+) for sensitive data',
              'Check error messages and API responses for information leakage (stack traces, internal paths)',
            ],
          },
          {
            step: 4,
            title: 'Apply STRIDE: Denial of Service & Elevation of Privilege',
            description: 'Identify availability risks and privilege escalation paths.',
            actions: [
              'DoS: identify resource-intensive operations (file processing, heavy queries) without rate limiting',
              'Verify rate limiting, request size caps, and circuit breakers on all public endpoints',
              'Check for algorithmic complexity DoS (ReDoS, hash collision attacks)',
              'Elevation of Privilege: map all permission levels; identify any path from low to high privilege',
              'Verify RBAC/ABAC enforcement server-side; test horizontal and vertical privilege escalation',
            ],
          },
          {
            step: 5,
            title: 'Risk Rating & Mitigation Planning',
            description: 'Score all identified threats using DREAD or CVSS and assign mitigations.',
            actions: [
              'Create threat register: ID, STRIDE category, component, description, risk score',
              'Apply DREAD scoring: Damage + Reproducibility + Exploitability + Affected users + Discoverability',
              'Classify: Critical (> 40) → fix before release; High (25-40) → fix this sprint; Medium → backlog',
              'Define specific mitigation for each Critical/High threat with acceptance criteria',
              'Assign owner and target date for each mitigation task',
            ],
          },
          {
            step: 6,
            title: 'Validate Mitigations & Document Residual Risk',
            description: 'Confirm mitigations are effective and formally accept remaining residual risks.',
            actions: [
              'Test each mitigation: write security test or pen-test scenario to confirm it works',
              'Re-score residual risk after mitigation: confirm Critical/High threats are reduced',
              'Document accepted residual risks with business justification and risk owner sign-off',
              'Update architecture documentation and threat model artifacts in confluence',
              'Schedule quarterly threat model review as system evolves',
            ],
          },
        ],
        summary: `STRIDE threat model for ${system} covering ${components}: decomposed system into DFD, identified threats across all 6 STRIDE categories, rated risks, defined mitigations, and documented residual risk acceptance.`,
      },
      duration: Date.now() - start,
    };
  },
};
