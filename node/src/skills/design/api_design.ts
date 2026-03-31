/**
 * EKET Framework - API Design Skill
 * Version: 0.9.2
 *
 * API 设计技能：设计和规范 RESTful API 接口
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * API 设计输入
 */
export interface APIDesignInput {
  /** API 用途描述 */
  description: string;
  /** 资源名称 */
  resource: string;
  /** HTTP 方法列表（可选） */
  methods?: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[];
  /** 是否需要认证 */
  requiresAuth?: boolean;
  /** 数据模型（可选） */
  models?: Record<string, unknown>;
  /** 版本（可选） */
  version?: string;
}

/**
 * API 端点定义
 */
export interface APIEndpoint {
  /** HTTP 方法 */
  method: string;
  /** 路径 */
  path: string;
  /** 描述 */
  description: string;
  /** 请求参数 */
  requestParams?: APIParameter[];
  /** 请求体 Schema */
  requestBody?: APISchema;
  /** 响应 Schema */
  responseBody: APISchema;
  /** 错误响应 */
  errorResponses: APIErrorResponse[];
  /** 是否需要认证 */
  requiresAuth: boolean;
  /** 速率限制（请求/分钟） */
  rateLimit?: number;
}

/**
 * API 参数定义
 */
export interface APIParameter {
  /** 参数名称 */
  name: string;
  /** 参数位置（query/path/header/body） */
  in: 'query' | 'path' | 'header' | 'body';
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** 是否必需 */
  required: boolean;
  /** 描述 */
  description: string;
  /** 默认值 */
  default?: unknown;
  /** 示例值 */
  example?: unknown;
}

/**
 * API Schema 定义
 */
export interface APISchema {
  /** Schema 类型 */
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  /** 属性（对象类型） */
  properties?: Record<string, APISchemaProperty>;
  /** 必需字段 */
  required?: string[];
  /** 数组项类型 */
  items?: APISchema;
  /** 描述 */
  description?: string;
}

/**
 * API Schema 属性
 */
export interface APISchemaProperty {
  /** 类型 */
  type: string;
  /** 描述 */
  description?: string;
  /** 示例值 */
  example?: unknown;
  /** 枚举值 */
  enum?: unknown[];
  /** 最小值 */
  minimum?: number;
  /** 最大值 */
  maximum?: number;
  /** 最小长度 */
  minLength?: number;
  /** 最大长度 */
  maxLength?: number;
  /** 格式 */
  format?: string;
  /** 嵌套属性 */
  properties?: Record<string, APISchemaProperty>;
  /** 嵌套必需字段 */
  required?: string[];
}

/**
 * API 错误响应
 */
export interface APIErrorResponse {
  /** HTTP 状态码 */
  statusCode: number;
  /** 错误码 */
  errorCode: string;
  /** 错误描述 */
  description: string;
}

/**
 * API 设计输出
 */
export interface APIDesignOutput {
  /** API 名称 */
  name: string;
  /** API 版本 */
  version: string;
  /** 基础路径 */
  basePath: string;
  /** 端点列表 */
  endpoints: APIEndpoint[];
  /** 公共 Schema 定义 */
  schemas: Record<string, APISchema>;
  /** 认证方式 */
  authentication?: {
    type: 'bearer' | 'api_key' | 'basic' | 'oauth2';
    description: string;
  };
  /** OpenAPI/Swagger 片段 */
  openApiSpec: Record<string, unknown>;
  /** 使用示例 */
  examples: {
    endpoint: string;
    request: string;
    response: string;
  }[];
}

/**
 * API 设计 Skill 实例
 */
export const APIDesignSkill: Skill<APIDesignInput, APIDesignOutput> = {
  name: 'api_design',
  description: '设计和规范 RESTful API 接口，生成 OpenAPI 规格文档',
  category: SkillCategory.DESIGN,
  tags: ['api', 'design', 'rest', 'openapi', 'swagger'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['description', 'resource'],
    properties: {
      description: {
        type: 'string',
        description: 'API 用途描述',
      },
      resource: {
        type: 'string',
        description: '资源名称',
      },
      methods: {
        type: 'array',
        items: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
        description: 'HTTP 方法列表',
      },
      requiresAuth: {
        type: 'boolean',
        description: '是否需要认证',
      },
      version: {
        type: 'string',
        description: 'API 版本',
      },
    },
  },

  outputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      version: { type: 'string' },
      basePath: { type: 'string' },
      endpoints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            method: { type: 'string' },
            path: { type: 'string' },
            description: { type: 'string' },
          },
        },
      },
      schemas: { type: 'object' },
      authentication: { type: 'object' },
      openApiSpec: { type: 'object' },
      examples: { type: 'array' },
    },
  },

  validateInput(input: unknown): boolean {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const req = input as Record<string, unknown>;

    if (!req.description || typeof req.description !== 'string') {
      return false;
    }

    if (!req.resource || typeof req.resource !== 'string') {
      return false;
    }

    if (req.resource.toString().trim().length === 0) {
      return false;
    }

    return true;
  },

  async execute(
    input: SkillInput<APIDesignInput>
  ): Promise<SkillOutput<APIDesignOutput>> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const {
        description,
        resource,
        methods,
        requiresAuth = true,
        models,
        version = 'v1',
      } = input.data;

      logs.push(`开始设计 API：${resource}`);

      // 1. 生成基础路径
      const basePath = generateBasePath(resource, version);
      logs.push(`基础路径：${basePath}`);

      // 2. 确定 HTTP 方法
      const httpMethods = methods || determineMethods(description);
      logs.push(`HTTP 方法：${httpMethods.join(', ')}`);

      // 3. 生成端点
      const endpoints = generateEndpoints(resource, httpMethods, basePath, requiresAuth);
      logs.push(`生成 ${endpoints.length} 个端点`);

      // 4. 生成 Schema
      const schemas = generateSchemas(resource, models);

      // 5. 生成认证配置
      const authentication = requiresAuth
        ? {
            type: 'bearer' as const,
            description: '使用 JWT Bearer Token 进行认证',
          }
        : undefined;

      // 6. 生成 OpenAPI 规格
      const openApiSpec = generateOpenApiSpec(
        resource,
        description,
        endpoints,
        schemas,
        authentication
      );

      // 7. 生成使用示例
      const examples = generateExamples(endpoints);

      logs.push('API 设计完成');

      return {
        success: true,
        data: {
          name: `${resource} API`,
          version,
          basePath,
          endpoints,
          schemas,
          authentication,
          openApiSpec,
          examples,
        },
        duration: Date.now() - startTime,
        logs,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logs.push(`错误：${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        errorCode: 'API_DESIGN_FAILED',
        duration: Date.now() - startTime,
        logs,
      };
    }
  },
};

/**
 * 生成基础路径
 */
function generateBasePath(resource: string, version: string): string {
  // 将资源名转换为 kebab-case
  const kebabResource = resource
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();

  return `/api/${version}/${kebabResource}`;
}

/**
 * 根据描述确定 HTTP 方法
 */
function determineMethods(description: string): ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[] {
  const lowerDesc = description.toLowerCase();
  const methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[] = ['GET'];

  // 创建/新增
  if (/\b(create|add|new|insert|生成 | 创建 | 新增)\b/i.test(lowerDesc)) {
    methods.push('POST');
  }

  // 更新/修改
  if (/\b(update|edit|modify|change|更新 | 修改 | 编辑)\b/i.test(lowerDesc)) {
    methods.push('PUT', 'PATCH');
  }

  // 删除
  if (/\b(delete|remove|drop|删除 | 移除)\b/i.test(lowerDesc)) {
    methods.push('DELETE');
  }

  return methods;
}

/**
 * 生成端点
 */
function generateEndpoints(
  resource: string,
  methods: string[],
  basePath: string,
  requiresAuth: boolean
): APIEndpoint[] {
  const endpoints: APIEndpoint[] = [];

  // GET /{resource} - 获取列表
  if (methods.includes('GET')) {
    endpoints.push({
      method: 'GET',
      path: basePath,
      description: `获取${resource}列表`,
      requestParams: [
        {
          name: 'page',
          in: 'query',
          type: 'number',
          required: false,
          description: '页码',
          default: 1,
          example: 1,
        },
        {
          name: 'limit',
          in: 'query',
          type: 'number',
          required: false,
          description: '每页数量',
          default: 20,
          example: 20,
        },
        {
          name: 'sort',
          in: 'query',
          type: 'string',
          required: false,
          description: '排序字段',
          example: 'createdAt',
        },
      ],
      responseBody: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            description: `${resource}列表`,
          },
          pagination: {
            type: 'object',
            description: '分页信息',
          },
        },
      },
      errorResponses: [
        { statusCode: 401, errorCode: 'UNAUTHORIZED', description: '未授权' },
        { statusCode: 500, errorCode: 'INTERNAL_ERROR', description: '服务器错误' },
      ],
      requiresAuth,
      rateLimit: 100,
    });

    // GET /{resource}/{id} - 获取详情
    endpoints.push({
      method: 'GET',
      path: `${basePath}/{id}`,
      description: `获取单个${resource}详情`,
      requestParams: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          required: true,
          description: `${resource} ID`,
          example: '123',
        },
      ],
      responseBody: {
        type: 'object',
        properties: {
          data: { type: 'object', description: `${resource}对象` },
        },
      },
      errorResponses: [
        { statusCode: 404, errorCode: 'NOT_FOUND', description: '资源不存在' },
        { statusCode: 401, errorCode: 'UNAUTHORIZED', description: '未授权' },
      ],
      requiresAuth,
      rateLimit: 100,
    });
  }

  // POST /{resource} - 创建
  if (methods.includes('POST')) {
    endpoints.push({
      method: 'POST',
      path: basePath,
      description: `创建${resource}`,
      requestBody: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '名称' },
        },
        required: ['name'],
      },
      responseBody: {
        type: 'object',
        properties: {
          data: { type: 'object', description: '创建的${resource}对象' },
          message: { type: 'string', example: '创建成功' },
        },
      },
      errorResponses: [
        { statusCode: 400, errorCode: 'INVALID_INPUT', description: '输入参数无效' },
        { statusCode: 401, errorCode: 'UNAUTHORIZED', description: '未授权' },
        { statusCode: 409, errorCode: 'CONFLICT', description: '资源已存在' },
      ],
      requiresAuth,
      rateLimit: 50,
    });
  }

  // PUT /{resource}/{id} - 全量更新
  if (methods.includes('PUT')) {
    endpoints.push({
      method: 'PUT',
      path: `${basePath}/{id}`,
      description: `全量更新${resource}`,
      requestParams: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          required: true,
          description: `${resource} ID`,
        },
      ],
      requestBody: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '名称' },
        },
        required: ['name'],
      },
      responseBody: {
        type: 'object',
        properties: {
          data: { type: 'object', description: '更新后的${resource}对象' },
          message: { type: 'string', example: '更新成功' },
        },
      },
      errorResponses: [
        { statusCode: 400, errorCode: 'INVALID_INPUT', description: '输入参数无效' },
        { statusCode: 404, errorCode: 'NOT_FOUND', description: '资源不存在' },
        { statusCode: 401, errorCode: 'UNAUTHORIZED', description: '未授权' },
      ],
      requiresAuth,
      rateLimit: 50,
    });
  }

  // PATCH /{resource}/{id} - 部分更新
  if (methods.includes('PATCH')) {
    endpoints.push({
      method: 'PATCH',
      path: `${basePath}/{id}`,
      description: `部分更新${resource}`,
      requestParams: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          required: true,
          description: `${resource} ID`,
        },
      ],
      requestBody: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '名称（可选）' },
        },
      },
      responseBody: {
        type: 'object',
        properties: {
          data: { type: 'object', description: '更新后的${resource}对象' },
          message: { type: 'string', example: '更新成功' },
        },
      },
      errorResponses: [
        { statusCode: 400, errorCode: 'INVALID_INPUT', description: '输入参数无效' },
        { statusCode: 404, errorCode: 'NOT_FOUND', description: '资源不存在' },
        { statusCode: 401, errorCode: 'UNAUTHORIZED', description: '未授权' },
      ],
      requiresAuth,
      rateLimit: 50,
    });
  }

  // DELETE /{resource}/{id} - 删除
  if (methods.includes('DELETE')) {
    endpoints.push({
      method: 'DELETE',
      path: `${basePath}/{id}`,
      description: `删除${resource}`,
      requestParams: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          required: true,
          description: `${resource} ID`,
        },
      ],
      responseBody: {
        type: 'object',
        properties: {
          message: { type: 'string', example: '删除成功' },
        },
      },
      errorResponses: [
        { statusCode: 404, errorCode: 'NOT_FOUND', description: '资源不存在' },
        { statusCode: 401, errorCode: 'UNAUTHORIZED', description: '未授权' },
      ],
      requiresAuth,
      rateLimit: 30,
    });
  }

  return endpoints;
}

/**
 * 生成 Schema
 */
function generateSchemas(
  resource: string,
  models?: Record<string, unknown>
): Record<string, APISchema> {
  const schemas: Record<string, APISchema> = {
    [resource]: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '唯一标识符',
          example: '123',
        },
        name: {
          type: 'string',
          description: '名称',
          example: `${resource}示例`,
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
          description: '创建时间',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
          description: '更新时间',
        },
      },
      required: ['id', 'name', 'createdAt'],
    },

    [`${resource}List`]: {
      type: 'array',
      description: `${resource}列表`,
    },

    [`${resource}Response`]: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'object' },
        error: { type: 'string' },
      },
    },
  };

  // 合并自定义模型
  if (models) {
    Object.assign(schemas, models);
  }

  return schemas;
}

/**
 * 生成 OpenAPI 规格
 */
function generateOpenApiSpec(
  resource: string,
  description: string,
  endpoints: APIEndpoint[],
  schemas: Record<string, APISchema>,
  authentication?: { type: string; description: string }
): Record<string, unknown> {
  return {
    openapi: '3.0.0',
    info: {
      title: `${resource} API`,
      version: '1.0.0',
      description,
    },
    servers: [
      {
        url: 'https://api.example.com',
        description: '生产环境',
      },
      {
        url: 'https://staging-api.example.com',
        description: '预发布环境',
      },
    ],
    security: authentication
      ? [
          {
            bearerAuth: [],
          },
        ]
      : [],
    paths: Object.fromEntries(
      endpoints.map((endpoint) => [
        endpoint.path,
        {
          [endpoint.method.toLowerCase()]: {
            summary: endpoint.description,
            operationId: `${endpoint.method.toLowerCase()}${endpoint.path.replace(/[^a-zA-Z]/g, '_')}`,
            parameters: endpoint.requestParams?.map((param) => ({
              name: param.name,
              in: param.in,
              required: param.required,
              schema: {
                type: param.type,
              },
              description: param.description,
            })),
            requestBody: endpoint.requestBody
              ? {
                  content: {
                    'application/json': {
                      schema: endpoint.requestBody,
                    },
                  },
                }
              : undefined,
            responses: {
              '200': {
                description: '成功响应',
                content: {
                  'application/json': {
                    schema: endpoint.responseBody,
                  },
                },
              },
              ...Object.fromEntries(
                endpoint.errorResponses.map((err) => [
                  err.statusCode.toString(),
                  {
                    description: err.description,
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            error: {
                              type: 'object',
                              properties: {
                                code: {
                                  type: 'string',
                                  example: err.errorCode,
                                },
                                message: {
                                  type: 'string',
                                  example: err.description,
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                ])
              ),
            },
          },
        },
      ])
    ),
    components: {
      securitySchemes: authentication
        ? {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          }
        : {},
      schemas,
    },
  };
}

/**
 * 生成使用示例
 */
function generateExamples(endpoints: APIEndpoint[]): {
  endpoint: string;
  request: string;
  response: string;
}[] {
  return endpoints.slice(0, 3).map((endpoint) => ({
    endpoint: `${endpoint.method} ${endpoint.path}`,
    request: generateCurlRequest(endpoint),
    response: JSON.stringify(
      {
        success: true,
        data: endpoint.responseBody,
      },
      null,
      2
    ),
  }));
}

/**
 * 生成 cURL 请求示例
 */
function generateCurlRequest(endpoint: APIEndpoint): string {
  let curl = `curl -X ${endpoint.method} https://api.example.com${endpoint.path}`;

  if (endpoint.requiresAuth) {
    curl += ' \\';
    curl += `\n  -H "Authorization: Bearer <token>"`;
  }

  if (endpoint.requestBody) {
    curl += ' \\';
    curl += `\n  -H "Content-Type: application/json"`;
    curl += ` \\`;
    curl += `\n  -d '{"name": "example"}'`;
  }

  return curl;
}

/**
 * 默认导出
 */
export default APIDesignSkill;
