import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface ApiDocsInput {
  apiName: string;
  format?: 'openapi-3' | 'swagger-2' | 'asyncapi';
  language?: string;
  hasAuthentication?: boolean;
}

export interface ApiDocsOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const apiDocsSkill: Skill<ApiDocsInput, ApiDocsOutput> = {
  name: 'api-docs',
  category: SkillCategory.DOCUMENTATION,
  description: 'Comprehensive OpenAPI/Swagger documentation strategy — spec-first or code-first, with interactive explorer',
  version: '1.0.0',
  async execute(input: SkillInput<ApiDocsInput>): Promise<SkillOutput<ApiDocsOutput>> {
    const data = input as unknown as ApiDocsInput;
    const start = Date.now();
    const apiName = data.apiName || 'API';
    const format = data.format || 'openapi-3';
    const lang = data.language || 'TypeScript';
    const hasAuth = data.hasAuthentication ?? true;

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Choose Documentation Approach',
            description: 'Decide between spec-first (design) vs code-first (annotate) based on team workflow.',
            actions: [
              'Spec-first: write OpenAPI YAML before implementation — ideal for new APIs or multi-team contracts',
              'Code-first: generate spec from code annotations — ideal for existing APIs (less drift)',
              `For ${lang}: ${lang.includes('TypeScript') ? 'use tsoa or @nestjs/swagger for code-first generation' : lang.includes('Python') ? 'use FastAPI (auto-generates) or drf-spectacular (Django)' : 'use swagger-jsdoc for JS or Swashbuckle for .NET'}`,
              `Selected format: ${format} — ${format === 'openapi-3' ? 'current standard, full feature support' : format === 'swagger-2' ? 'legacy, limited to synchronous REST' : 'event-driven APIs (WebSocket, Kafka)'}`,
              'Store spec in repo: `docs/api/openapi.yaml` — version controlled alongside code',
              'Set up CI validation: `openapi-validator lint docs/api/openapi.yaml` — fail on invalid spec',
            ],
          },
          {
            step: 2,
            title: 'Structure the OpenAPI Specification',
            description: 'Write a complete, accurate spec that serves as the contract.',
            actions: [
              'Info section: title, version, description, contact, license, servers (dev/staging/prod URLs)',
              'Tags: group endpoints by resource (`User`, `Order`, `Product`) — matches navigation structure',
              'Schemas: define reusable components in `#/components/schemas` — avoid inline duplication',
              'All response schemas documented: 200, 201, 400, 401, 403, 404, 422, 500 — no undocumented responses',
              'Request body schemas: mark required fields, add `example` values, add `description` per field',
              hasAuth ? 'Security schemes: define Bearer JWT + API Key schemes in components/securitySchemes' : 'Mark public endpoints explicitly with empty security array `security: []`',
            ],
          },
          {
            step: 3,
            title: 'Write High-Quality Descriptions',
            description: 'Good descriptions are the difference between docs that help and docs that exist.',
            actions: [
              'Endpoint summary: one line — what this endpoint does ("Create a new user account")',
              'Endpoint description: multi-line — when to use it, side effects, rate limits, deprecation notices',
              'Parameter descriptions: explain format, constraints, default values, allowed values',
              'Error descriptions: explain why each error occurs and how to resolve it (developer-friendly)',
              'Add realistic examples: use actual valid data, not placeholder "string" or "0" values',
              'Markdown supported: use `**bold**`, code blocks, and links in descriptions for readability',
            ],
          },
          {
            step: 4,
            title: 'Authentication & Authorization Docs',
            description: `Document ${hasAuth ? 'authentication flows clearly — auth confusion is the #1 API integration pain point' : 'clearly that the API is public and any rate limits'}.`,
            actions: [
              hasAuth ? 'Authentication guide: step-by-step token acquisition with curl examples' : 'State clearly: public endpoints, no auth required, rate limit: X req/min per IP',
              hasAuth ? 'Token lifetime: document expiry, refresh flow, re-authentication steps' : 'Document CORS policy: allowed origins, methods, headers',
              hasAuth ? 'Permission model: what scopes/roles are needed per endpoint group' : 'Document any API key for analytics/tracking (even if not auth)',
              hasAuth ? 'Error reference: 401 (not authenticated) vs 403 (authenticated but not authorized) — both documented with resolution steps' : 'Document abuse protection: what triggers rate limiting, how to request higher limits',
              'Add working curl/HTTPie/fetch examples in the description for each auth pattern',
              'Provide Postman Collection or Bruno collection export for quick testing setup',
            ],
          },
          {
            step: 5,
            title: 'Interactive Documentation Portal',
            description: 'Make docs interactive so developers can test without leaving the browser.',
            actions: [
              'Deploy Swagger UI: `npx swagger-ui-express` or host on `/docs` route in development',
              'Deploy Redoc for production-facing docs: cleaner UI, better for public APIs',
              'Enable "Try it out": configure CORS on dev/staging to allow browser requests from docs portal',
              'Provide pre-configured authentication: populate Bearer token field via query param for demos',
              'Version the docs portal: `/docs/v1`, `/docs/v2` — keep old versions accessible',
              'Embed changelog in docs: link to CHANGELOG.md, highlight breaking changes prominently',
            ],
          },
          {
            step: 6,
            title: 'Keep Docs in Sync & Prevent Drift',
            description: 'Outdated docs are worse than no docs — implement automated drift prevention.',
            actions: [
              'Contract testing: Pact or Dredd validates implementation against OpenAPI spec on every PR',
              'CI gate: spec must be valid OpenAPI + implementation must match spec — both required for merge',
              'Changelog automation: generate API changelog from spec diff between versions',
              'Breaking change detection: openapi-diff in CI — warn/block on breaking changes to published API',
              'SDK generation: if applicable, auto-generate client SDKs from spec (openapi-generator-cli)',
              'Doc review in PR template: checklist item "API changes documented in OpenAPI spec"',
            ],
          },
        ],
        summary: `API documentation guide for "${apiName}" using ${format} (${lang}). Auth: ${hasAuth ? 'Bearer JWT + API Key' : 'public API'}. 6-phase: approach selection → spec structure → quality descriptions → auth docs → interactive portal → drift prevention.`,
      },
      duration: Date.now() - start,
    };
  },
};
