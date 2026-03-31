/**
 * EKET Framework - API Design Skill Tests
 * Version: 0.9.2
 *
 * Tests for API Design Skill: RESTful endpoint design,
 * resource identification, method mapping
 */

import {
  APIDesignSkill,
  APIDesignInput,
  APIEndpoint,
} from '@/skills/design/api_design.js';
import type { SkillInput } from '@/skills/types.js';

describe('APIDesignSkill', () => {
  describe('Metadata', () => {
    it('should have correct name', () => {
      expect(APIDesignSkill.name).toBe('api_design');
    });

    it('should have description', () => {
      expect(APIDesignSkill.description).toBeDefined();
      expect(APIDesignSkill.description.length).toBeGreaterThan(0);
    });

    it('should be in design category', () => {
      expect(APIDesignSkill.category).toBe('design');
    });

    it('should have version', () => {
      expect(APIDesignSkill.version).toBe('1.0.0');
    });

    it('should have relevant tags', () => {
      expect(APIDesignSkill.tags).toContain('api');
      expect(APIDesignSkill.tags).toContain('design');
      expect(APIDesignSkill.tags).toContain('rest');
    });
  });

  describe('Input Schema', () => {
    it('should have input schema defined', () => {
      expect(APIDesignSkill.inputSchema).toBeDefined();
      expect(APIDesignSkill.inputSchema?.required).toContain('description');
      expect(APIDesignSkill.inputSchema?.required).toContain('resource');
    });

    it('should define required fields', () => {
      const props = APIDesignSkill.inputSchema?.properties;
      expect(props?.description).toBeDefined();
      expect(props?.resource).toBeDefined();
    });

    it('should define optional fields', () => {
      const props = APIDesignSkill.inputSchema?.properties;
      expect(props?.methods).toBeDefined();
      expect(props?.requiresAuth).toBeDefined();
      expect(props?.models).toBeDefined();
      expect(props?.version).toBeDefined();
    });
  });

  describe('Output Schema', () => {
    it('should have output schema defined', () => {
      expect(APIDesignSkill.outputSchema).toBeDefined();
    });

    it('should define endpoints array', () => {
      const props = APIDesignSkill.outputSchema?.properties;
      expect(props?.endpoints).toBeDefined();
    });

    it('should define basePath', () => {
      const props = APIDesignSkill.outputSchema?.properties;
      expect(props?.basePath).toBeDefined();
    });

    it('should define schemas', () => {
      const props = APIDesignSkill.outputSchema?.properties;
      expect(props?.schemas).toBeDefined();
    });

    it('should define openApiSpec', () => {
      const props = APIDesignSkill.outputSchema?.properties;
      expect(props?.openApiSpec).toBeDefined();
    });

    it('should define examples', () => {
      const props = APIDesignSkill.outputSchema?.properties;
      expect(props?.examples).toBeDefined();
    });
  });

  describe('validateInput()', () => {
    it('should return true for valid input', () => {
      const validInput: APIDesignInput = {
        description: 'User management API',
        resource: 'users',
      };

      expect(APIDesignSkill.validateInput?.(validInput)).toBe(true);
    });

    it('should return true with all optional fields', () => {
      const validInput: APIDesignInput = {
        description: 'Create and manage users',
        resource: 'users',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        requiresAuth: true,
        version: 'v2',
      };

      expect(APIDesignSkill.validateInput?.(validInput)).toBe(true);
    });

    it('should return false for null input', () => {
      expect(APIDesignSkill.validateInput?.(null)).toBe(false);
    });

    it('should return false for undefined input', () => {
      expect(APIDesignSkill.validateInput?.(undefined)).toBe(false);
    });

    it('should return false when description is missing', () => {
      const invalidInput = { resource: 'users' };
      expect(APIDesignSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return false when resource is missing', () => {
      const invalidInput = { description: 'User API' };
      expect(APIDesignSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return false when description is not a string', () => {
      const invalidInput = { description: 123, resource: 'users' };
      expect(APIDesignSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return false when resource is not a string', () => {
      const invalidInput = { description: 'User API', resource: 123 };
      expect(APIDesignSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return false when resource is empty string', () => {
      const invalidInput = { description: 'User API', resource: '' };
      expect(APIDesignSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return false when resource is whitespace only', () => {
      const invalidInput = { description: 'User API', resource: '   ' };
      expect(APIDesignSkill.validateInput?.(invalidInput)).toBe(false);
    });
  });

  describe('execute()', () => {
    it('should successfully design API', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'User management API',
          resource: 'users',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.name).toBe('users API');
      expect(result.data?.endpoints).toBeDefined();
      expect(result.data?.endpoints.length).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should generate base path from resource and version', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Product API',
          resource: 'products',
          version: 'v1',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      expect(result.data?.basePath).toBe('/api/v1/products');
    });

    it('should convert resource name to kebab-case', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'User Profile API',
          resource: 'userProfiles',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      expect(result.data?.basePath).toBe('/api/v1/user-profiles');
    });

    it('should generate GET endpoints by default', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Read-only API',
          resource: 'items',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const getEndpoints = result.data?.endpoints?.filter(e => e.method === 'GET') || [];
      expect(getEndpoints.length).toBeGreaterThan(0);
    });

    it('should generate POST endpoint for create operations', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Create new items',
          resource: 'items',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const postEndpoints = result.data?.endpoints?.filter(e => e.method === 'POST') || [];
      expect(postEndpoints.length).toBeGreaterThan(0);
    });

    it('should generate PUT and PATCH for update operations', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Update existing items',
          resource: 'items',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const putEndpoints = result.data?.endpoints?.filter(e => e.method === 'PUT') || [];
      const patchEndpoints = result.data?.endpoints?.filter(e => e.method === 'PATCH') || [];
      expect(putEndpoints.length).toBeGreaterThan(0);
      expect(patchEndpoints.length).toBeGreaterThan(0);
    });

    it('should generate DELETE endpoint for delete operations', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Delete items from system',
          resource: 'items',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const deleteEndpoints = result.data?.endpoints?.filter(e => e.method === 'DELETE') || [];
      expect(deleteEndpoints.length).toBeGreaterThan(0);
    });

    it('should generate endpoints with correct structure', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Resource API',
          resource: 'todos',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const endpoints = result.data?.endpoints || [];

      for (const endpoint of endpoints) {
        expect(endpoint.method).toBeDefined();
        expect(endpoint.path).toBeDefined();
        expect(endpoint.description).toBeDefined();
        expect(endpoint.errorResponses).toBeDefined();
        expect(endpoint.requiresAuth).toBeDefined();
      }
    });

    it('should include list endpoint (GET /{resource})', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Todos API',
          resource: 'todos',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const listEndpoint = result.data?.endpoints?.find(
        e => e.method === 'GET' && !e.path.includes('{id}')
      );

      expect(listEndpoint).toBeDefined();
      expect(listEndpoint?.requestParams).toBeDefined();
      expect(listEndpoint?.requestParams?.some(p => p.name === 'page')).toBe(true);
      expect(listEndpoint?.requestParams?.some(p => p.name === 'limit')).toBe(true);
    });

    it('should include detail endpoint (GET /{resource}/{id})', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Todos API',
          resource: 'todos',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const detailEndpoint = result.data?.endpoints?.find(
        e => e.method === 'GET' && e.path.includes('{id}')
      );

      expect(detailEndpoint).toBeDefined();
      expect(detailEndpoint?.requestParams?.some(p => p.name === 'id' && p.in === 'path')).toBe(true);
    });

    it('should include authentication when requiresAuth is true', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Secure API',
          resource: 'secrets',
          requiresAuth: true,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      expect(result.data?.authentication).toBeDefined();
      expect(result.data?.authentication?.type).toBe('bearer');
    });

    it('should not include authentication when requiresAuth is false', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Public API',
          resource: 'public',
          requiresAuth: false,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      expect(result.data?.authentication).toBeUndefined();
    });

    it('should generate OpenAPI spec', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Test API',
          resource: 'tests',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const openApiSpec = result.data?.openApiSpec;

      expect(openApiSpec).toBeDefined();
      expect((openApiSpec as any).openapi).toBe('3.0.0');
      expect((openApiSpec as any).info).toBeDefined();
      expect((openApiSpec as any).paths).toBeDefined();
    });

    it('should generate examples', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Example API',
          resource: 'examples',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      expect(result.data?.examples).toBeDefined();
      expect(result.data?.examples?.length).toBeGreaterThan(0);

      const example = result.data?.examples?.[0];
      expect(example?.endpoint).toBeDefined();
      expect(example?.request).toBeDefined();
      expect(example?.response).toBeDefined();
    });

    it('should include logs in result', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Logging API',
          resource: 'logs',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      expect(result.logs).toBeDefined();
      expect(result.logs?.length).toBeGreaterThan(0);
    });

    it('should generate error responses for endpoints', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Error API',
          resource: 'errors',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const endpoints = result.data?.endpoints || [];

      for (const endpoint of endpoints) {
        expect(endpoint.errorResponses).toBeDefined();
        expect(endpoint.errorResponses?.length).toBeGreaterThan(0);

        for (const error of endpoint.errorResponses!) {
          expect(error.statusCode).toBeDefined();
          expect(error.errorCode).toBeDefined();
          expect(error.description).toBeDefined();
        }
      }
    });

    it('should set rate limits for endpoints', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Rate Limited API',
          resource: 'limited',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const endpoints = result.data?.endpoints || [];

      for (const endpoint of endpoints) {
        expect(endpoint.rateLimit).toBeDefined();
      }
    });
  });

  describe('Custom Methods', () => {
    it('should use specified methods only', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Read-only API',
          resource: 'readonly',
          methods: ['GET'],
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const methods = result.data?.endpoints?.map(e => e.method) || [];
      expect(methods).toContain('GET');
      expect(methods).not.toContain('POST');
      expect(methods).not.toContain('PUT');
      expect(methods).not.toContain('DELETE');
    });

    it('should support custom method combinations', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'CRUD API',
          resource: 'crud',
          methods: ['GET', 'POST', 'DELETE'],
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const methods = new Set(result.data?.endpoints?.map(e => e.method) || []);
      expect(methods.has('GET')).toBe(true);
      expect(methods.has('POST')).toBe(true);
      expect(methods.has('DELETE')).toBe(true);
      expect(methods.has('PUT')).toBe(false);
      expect(methods.has('PATCH')).toBe(false);
    });
  });

  describe('Schema Generation', () => {
    it('should generate basic resource schema', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Resource API',
          resource: 'articles',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const schemas = result.data?.schemas || {};
      expect(schemas['articles']).toBeDefined();
      expect(schemas['articlesList']).toBeDefined();
      expect(schemas['articlesResponse']).toBeDefined();
    });

    it('should merge custom models', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'Custom API',
          resource: 'custom',
          models: {
            CustomModel: {
              type: 'object',
              properties: {
                customField: { type: 'string' },
              },
            },
          },
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      const schemas = result.data?.schemas || {};
      expect(schemas['CustomModel']).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle camelCase resource names', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'User Profile API',
          resource: 'userProfiles',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      expect(result.data?.basePath).toBe('/api/v1/user-profiles');
    });

    it('should handle PascalCase resource names', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'User Profile API',
          resource: 'UserProfiles',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      expect(result.data?.basePath).toBe('/api/v1/user-profiles');
    });

    it('should handle kebab-case resource names', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'User Profile API',
          resource: 'user-profiles',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      expect(result.data?.basePath).toBe('/api/v1/user-profiles');
    });

    it('should handle snake_case resource names', async () => {
      const input: SkillInput<APIDesignInput> = {
        data: {
          description: 'User Profile API',
          resource: 'user_profiles',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await APIDesignSkill.execute(input);

      expect(result.data?.basePath).toBe('/api/v1/user-profiles');
    });
  });
});
