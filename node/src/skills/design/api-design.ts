import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface ApiDesignInput {
  serviceName: string;
  apiType?: 'REST' | 'GraphQL' | 'gRPC';
  resources?: string[];
  authStrategy?: string;
}

export interface ApiDesignOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const apiDesignSkill: Skill<ApiDesignInput, ApiDesignOutput> = {
  name: 'api-design',
  category: SkillCategory.DESIGN,
  description: 'Design well-structured REST or GraphQL APIs following industry best practices for versioning, security, and developer experience.',
  version: '1.0.0',
  async execute(input: SkillInput<ApiDesignInput>): Promise<SkillOutput<ApiDesignOutput>> {
    const data = input as unknown as ApiDesignInput;
    const start = Date.now();
    const apiType = data.apiType ?? 'REST';
    const resources = data.resources ?? [];
    const authStrategy = data.authStrategy ?? 'JWT Bearer Token';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Define API Contract & Resources',
            description: 'Identify all resources, operations, and data models the API must expose.',
            actions: [
              `Define API scope for "${data.serviceName}" using ${apiType} style`,
              `Enumerate core resources: ${resources.join(', ') || 'identify from domain model'}`,
              'Map CRUD operations to HTTP verbs (REST) or queries/mutations (GraphQL) for each resource',
              'Define resource relationships and decide on embedded vs. linked representations',
              'Draft initial OpenAPI 3.x (REST) or SDL (GraphQL) schema as living documentation',
            ],
          },
          {
            step: 2,
            title: 'Design URL Structure & Naming Conventions',
            description: 'Establish consistent, intuitive endpoint naming following REST conventions or GraphQL schema design.',
            actions: [
              'Use plural nouns for REST collections (e.g., /users, /orders), avoid verbs in URLs',
              'Design hierarchical routes only for true ownership relationships (e.g., /users/{id}/addresses)',
              'Define versioning strategy: URL path (/v1/), header (Accept-Version), or query param',
              'Establish consistent casing: kebab-case for URLs, camelCase for JSON fields',
              'Design pagination pattern: cursor-based (preferred for large datasets) or offset-limit',
            ],
          },
          {
            step: 3,
            title: 'Authentication & Authorization Design',
            description: 'Define security model including authentication mechanisms and permission scopes.',
            actions: [
              `Implement auth strategy: ${authStrategy}`,
              'Define OAuth2 scopes or RBAC permission matrix for each endpoint',
              'Design token lifecycle: expiry, refresh, revocation endpoints',
              'Specify rate limiting strategy: per-user, per-IP, per-API key with headers (X-RateLimit-*)',
              'Document security requirements in API spec using OpenAPI security schemes',
            ],
          },
          {
            step: 4,
            title: 'Request/Response Schema Design',
            description: 'Design consistent, well-typed request and response payloads.',
            actions: [
              'Define standard error response envelope: { error: { code, message, details[] } }',
              'Design consistent success envelope for list responses: { data: [], meta: { total, page } }',
              'Apply JSON Schema validation for all request bodies with required field declarations',
              'Design idempotency support for POST/PUT using Idempotency-Key header pattern',
              'Document all response status codes per endpoint with clear semantics (200/201/400/401/403/404/422/429/500)',
            ],
          },
          {
            step: 5,
            title: 'Developer Experience & Documentation',
            description: 'Ensure the API is easy to consume, test, and integrate.',
            actions: [
              'Generate interactive API docs using Swagger UI or Redoc from OpenAPI spec',
              'Create a Postman/Insomnia collection with example requests for all endpoints',
              'Write SDK generation configuration (openapi-generator) for major languages (JS, Python, Go)',
              'Define SLA and performance expectations per endpoint in documentation',
              'Establish API changelog policy and deprecation notice process (minimum 6-month sunset)',
            ],
          },
        ],
        summary: `${apiType} API design for "${data.serviceName}" covering ${resources.length || 'all'} resources with auth strategy (${authStrategy}), consistent schemas, and developer-friendly documentation.`,
      },
      duration: Date.now() - start,
    };
  },
};
