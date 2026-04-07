/**
 * EKET Framework - API Documentation Skill
 * Version: 0.9.2
 *
 * API 文档技能：生成 API 参考文档
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * API 文档输入
 */
export interface APIDocumentationInput {
  /** API 名称 */
  apiName: string;
  /** API 版本 */
  version?: string;
  /** API 描述 */
  description?: string;
  /** 基础 URL */
  baseUrl?: string;
  /** 端点列表 */
  endpoints?: EndpointConfig[];
  /** 认证方式 */
  authentication?: AuthConfig;
  /** 数据模型 */
  models?: Record<string, ModelConfig>;
  /** 文档格式 */
  format?: 'markdown' | 'html' | 'openapi';
}

/**
 * 端点配置
 */
export interface EndpointConfig {
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** 路径 */
  path: string;
  /** 描述 */
  description: string;
  /** 请求参数 */
  requestParams?: ParamConfig[];
  /** 请求体示例 */
  requestBody?: Record<string, unknown>;
  /** 响应示例 */
  responseBody?: Record<string, unknown>;
  /** 错误响应 */
  errorResponses?: ErrorResponseConfig[];
  /** 使用示例 */
  examples?: ExampleConfig[];
}

/**
 * 参数配置
 */
export interface ParamConfig {
  /** 参数名称 */
  name: string;
  /** 参数位置 */
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
 * 错误响应配置
 */
export interface ErrorResponseConfig {
  /** HTTP 状态码 */
  statusCode: number;
  /** 错误码 */
  errorCode: string;
  /** 错误描述 */
  description: string;
}

/**
 * 使用示例配置
 */
export interface ExampleConfig {
  /** 示例描述 */
  description: string;
  /** 请求示例 */
  request: string;
  /** 响应示例 */
  response: string;
}

/**
 * 认证配置
 */
export interface AuthConfig {
  /** 认证类型 */
  type: 'bearer' | 'api_key' | 'basic' | 'oauth2' | 'none';
  /** 描述 */
  description: string;
  /** 认证头 */
  header?: string;
  /** 示例值 */
  example?: string;
}

/**
 * 数据模型配置
 */
export interface ModelConfig {
  /** 模型描述 */
  description: string;
  /** 属性列表 */
  properties: ModelPropertyConfig[];
  /** 示例数据 */
  example?: Record<string, unknown>;
}

/**
 * 模型属性配置
 */
export interface ModelPropertyConfig {
  /** 属性名称 */
  name: string;
  /** 属性类型 */
  type: string;
  /** 描述 */
  description: string;
  /** 是否必需 */
  required: boolean;
  /** 示例值 */
  example?: unknown;
  /** 枚举值 */
  enum?: unknown[];
}

/**
 * API 文档输出
 */
export interface APIDocumentationOutput {
  /** Markdown 格式文档 */
  markdown: string;
  /** HTML 格式文档（可选） */
  html?: string;
  /** OpenAPI/Swagger 规格 */
  openApiSpec: Record<string, unknown>;
  /** 目录结构 */
  tableOfContents: Array<{
    title: string;
    anchor: string;
  }>;
  /** 快速入门指南 */
  quickStart: string;
  /** 错误码参考 */
  errorCodeReference: string;
}

/**
 * API 文档 Skill 实例
 */
export const APIDocumentationSkill: Skill<APIDocumentationInput, APIDocumentationOutput> = {
  name: 'api_documentation',
  description: '生成 API 参考文档，支持 Markdown、HTML 和 OpenAPI 格式',
  category: SkillCategory.DOCUMENTATION,
  tags: ['documentation', 'api', 'markdown', 'openapi', 'swagger'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['apiName'],
    properties: {
      apiName: {
        type: 'string',
        description: 'API 名称',
      },
      version: {
        type: 'string',
        description: 'API 版本',
      },
      description: {
        type: 'string',
        description: 'API 描述',
      },
      baseUrl: {
        type: 'string',
        description: '基础 URL',
      },
      endpoints: {
        type: 'array',
        description: '端点列表',
      },
      authentication: {
        type: 'object',
        description: '认证方式',
      },
      models: {
        type: 'object',
        description: '数据模型',
      },
      format: {
        type: 'string',
        enum: ['markdown', 'html', 'openapi'],
        description: '文档格式',
      },
    },
  },

  outputSchema: {
    type: 'object',
    properties: {
      markdown: { type: 'string' },
      openApiSpec: { type: 'object' },
      tableOfContents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            anchor: { type: 'string' },
          },
        },
      },
      quickStart: { type: 'string' },
      errorCodeReference: { type: 'string' },
    },
  },

  validateInput(input: unknown): boolean {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const req = input as Record<string, unknown>;

    if (!req.apiName || typeof req.apiName !== 'string') {
      return false;
    }

    if (req.apiName.toString().trim().length === 0) {
      return false;
    }

    return true;
  },

  async execute(
    input: SkillInput<APIDocumentationInput>
  ): Promise<SkillOutput<APIDocumentationOutput>> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const {
        apiName,
        version = 'v1',
        description,
        baseUrl = 'https://api.example.com',
        endpoints,
        authentication,
        models,
        format = 'markdown',
      } = input.data;

      logs.push(`开始生成 API 文档：${apiName}`);

      // 1. 生成或补充端点数据
      const allEndpoints = endpoints || generateDefaultEndpoints(apiName);
      logs.push(`处理 ${allEndpoints.length} 个端点`);

      // 2. 生成目录
      const tableOfContents = generateTableOfContents(allEndpoints, models);
      logs.push('生成目录');

      // 3. 生成 Markdown 文档
      const markdown = generateMarkdownDocumentation({
        apiName,
        version,
        description,
        baseUrl,
        endpoints: allEndpoints,
        authentication,
        models,
      });
      logs.push('生成 Markdown 文档');

      // 4. 生成 HTML 文档（可选）
      let html: string | undefined;
      if (format === 'html') {
        html = generateHTMLDocumentation(markdown);
        logs.push('生成 HTML 文档');
      }

      // 5. 生成 OpenAPI 规格
      const openApiSpec = generateOpenApiSpec({
        apiName,
        version,
        description,
        baseUrl,
        endpoints: allEndpoints,
        authentication,
        models,
      });
      logs.push('生成 OpenAPI 规格');

      // 6. 生成快速入门指南
      const quickStart = generateQuickStart(apiName, authentication, allEndpoints[0]);

      // 7. 生成错误码参考
      const errorCodeReference = generateErrorCodeReference(allEndpoints);

      logs.push('API 文档生成完成');

      return {
        success: true,
        data: {
          markdown,
          html,
          openApiSpec,
          tableOfContents,
          quickStart,
          errorCodeReference,
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
        errorCode: 'API_DOC_GENERATION_FAILED',
        duration: Date.now() - startTime,
        logs,
      };
    }
  },
};

/**
 * 生成目录
 */
function generateTableOfContents(
  endpoints: EndpointConfig[],
  models?: Record<string, ModelConfig>
): Array<{ title: string; anchor: string }> {
  const toc: Array<{ title: string; anchor: string }> = [
    { title: '概述', anchor: '#overview' },
    { title: '快速入门', anchor: '#quick-start' },
    { title: '认证', anchor: '#authentication' },
    { title: '端点', anchor: '#endpoints' },
  ];

  // 添加端点目录
  const groupedEndpoints = groupEndpointsByTag(endpoints);
  for (const [tag, tagEndpoints] of Object.entries(groupedEndpoints)) {
    toc.push({
      title: tag,
      anchor: `#${tag.toLowerCase().replace(/\s+/g, '-')}`,
    });

    for (const endpoint of tagEndpoints) {
      toc.push({
        title: `${endpoint.method} ${endpoint.path}`,
        anchor: `#${endpoint.method.toLowerCase()}-${endpoint.path.replace(/[^a-z0-9]/g, '-')}`,
      });
    }
  }

  // 添加数据模型目录
  if (models && Object.keys(models).length > 0) {
    toc.push({ title: '数据模型', anchor: '#data-models' });

    for (const modelName of Object.keys(models)) {
      toc.push({
        title: modelName,
        anchor: `#${modelName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      });
    }
  }

  // 添加错误码目录
  toc.push({ title: '错误处理', anchor: '#error-handling' });

  return toc;
}

/**
 * 按标签分组端点
 */
function groupEndpointsByTag(endpoints: EndpointConfig[]): Record<string, EndpointConfig[]> {
  const groups: Record<string, EndpointConfig[]> = {};

  for (const endpoint of endpoints) {
    // 根据路径生成标签
    const pathParts = endpoint.path.split('/').filter((p) => p && !p.startsWith('{'));
    const tag = pathParts[0] || 'General';
    const tagName = tag.charAt(0).toUpperCase() + tag.slice(1);

    if (!groups[tagName]) {
      groups[tagName] = [];
    }

    groups[tagName].push(endpoint);
  }

  return groups;
}

/**
 * 生成 Markdown 文档
 */
function generateMarkdownDocumentation(config: {
  apiName: string;
  version: string;
  description?: string;
  baseUrl: string;
  endpoints: EndpointConfig[];
  authentication?: AuthConfig;
  models?: Record<string, ModelConfig>;
}): string {
  const { apiName, version, description, baseUrl, endpoints, authentication, models } = config;

  let doc = '';

  // 标题
  doc += `# ${apiName} API 文档\n\n`;
  doc += `**版本**: ${version}\n\n`;
  doc += `**基础 URL**: \`${baseUrl}\`\n\n`;

  // 概述
  doc += `## 概述\n\n`;
  doc +=
    description ||
    `${apiName} API 提供参考接口，用于访问和操作${apiName.toLowerCase()}相关的数据和功能。\n\n`;

  // 目录
  doc += `## 目录\n\n`;
  doc += `- [概述](#概述)\n`;
  doc += `- [快速入门](#快速入门)\n`;
  doc += `- [认证](#authentication)\n`;
  doc += `- [端点](#endpoints)\n`;
  if (models && Object.keys(models).length > 0) {
    doc += `- [数据模型](#data-models)\n`;
  }
  doc += `- [错误处理](#错误处理)\n\n`;

  // 快速入门
  doc += `## 快速入门\n\n`;
  doc += `### 前提条件\n\n`;
  doc += `- 有效的 API 密钥或访问令牌\n`;
  doc += `- HTTP 客户端（如 curl、Postman）\n\n`;

  doc += `### 第一个请求\n\n`;
  doc += `\`\`\`bash\n`;
  doc += `curl -X GET "${baseUrl}${endpoints[0]?.path || '/'}" \\\n`;
  doc += `  -H "Authorization: Bearer YOUR_API_TOKEN"\n`;
  doc += `\`\`\`\n\n`;

  // 认证
  doc += `## 认证\n\n`;
  if (authentication && authentication.type !== 'none') {
    doc += `${authentication.description}\n\n`;

    if (authentication.type === 'bearer') {
      doc += `### Bearer Token 认证\n\n`;
      doc += `在所有 API 请求中添加 \`Authorization\` 头：\n\n`;
      doc += `\`\`\`\n`;
      doc += `Authorization: Bearer YOUR_ACCESS_TOKEN\n`;
      doc += `\`\`\`\n\n`;
    } else if (authentication.type === 'api_key') {
      doc += `### API Key 认证\n\n`;
      doc += `在所有 API 请求中添加 \`${authentication.header || 'X-API-Key'}\` 头：\n\n`;
      doc += `\`\`\`\n`;
      doc += `${authentication.header || 'X-API-Key'}: YOUR_API_KEY\n`;
      doc += `\`\`\`\n\n`;
    }
  } else {
    doc += `本 API 不需要认证。\n\n`;
  }

  // 端点
  doc += `## 端点\n\n`;

  const groupedEndpoints = groupEndpointsByTag(endpoints);
  for (const [tag, tagEndpoints] of Object.entries(groupedEndpoints)) {
    doc += `### ${tag}\n\n`;

    for (const endpoint of tagEndpoints) {
      doc += `#### \`${endpoint.method}\` ${endpoint.path}\n\n`;
      doc += `${endpoint.description}\n\n`;

      // 请求参数
      if (endpoint.requestParams && endpoint.requestParams.length > 0) {
        doc += `**请求参数**:\n\n`;
        doc += `| 参数 | 位置 | 类型 | 必需 | 描述 |\n`;
        doc += `|------|------|------|------|------|\n`;

        for (const param of endpoint.requestParams) {
          doc += `| ${param.name} | ${param.in} | ${param.type} | ${param.required ? '是' : '否'} | ${param.description} |\n`;
        }

        doc += `\n`;
      }

      // 请求体示例
      if (endpoint.requestBody) {
        doc += `**请求体示例**:\n\n`;
        doc += `\`\`\`json\n`;
        doc += `${JSON.stringify(endpoint.requestBody, null, 2)}\n`;
        doc += `\`\`\`\n\n`;
      }

      // 响应示例
      if (endpoint.responseBody) {
        doc += `**响应示例**:\n\n`;
        doc += `\`\`\`json\n`;
        doc += `${JSON.stringify(endpoint.responseBody, null, 2)}\n`;
        doc += `\`\`\`\n\n`;
      }

      // 错误响应
      if (endpoint.errorResponses && endpoint.errorResponses.length > 0) {
        doc += `**错误响应**:\n\n`;
        doc += `| 状态码 | 错误码 | 描述 |\n`;
        doc += `|--------|--------|------|\n`;

        for (const err of endpoint.errorResponses) {
          doc += `| ${err.statusCode} | ${err.errorCode} | ${err.description} |\n`;
        }

        doc += `\n`;
      }

      // 使用示例
      if (endpoint.examples && endpoint.examples.length > 0) {
        doc += `**使用示例**:\n\n`;

        for (const example of endpoint.examples) {
          doc += `${example.description}\n\n`;
          doc += `\`\`\`bash\n${example.request}\n\`\`\`\n\n`;
          doc += `响应:\n\n`;
          doc += `\`\`\`json\n${example.response}\n\`\`\`\n\n`;
        }
      }
    }
  }

  // 数据模型
  if (models && Object.keys(models).length > 0) {
    doc += `## 数据模型\n\n`;

    for (const [modelName, model] of Object.entries(models)) {
      doc += `### ${modelName}\n\n`;
      doc += `${model.description}\n\n`;

      doc += `**属性**:\n\n`;
      doc += `| 属性 | 类型 | 必需 | 描述 |\n`;
      doc += `|------|------|------|------|\n`;

      for (const prop of model.properties) {
        doc += `| ${prop.name} | ${prop.type} | ${prop.required ? '是' : '否'} | ${prop.description} |\n`;
      }

      doc += `\n`;

      if (model.example) {
        doc += `**示例**:\n\n`;
        doc += `\`\`\`json\n`;
        doc += `${JSON.stringify(model.example, null, 2)}\n`;
        doc += `\`\`\`\n\n`;
      }
    }
  }

  // 错误处理
  doc += `## 错误处理\n\n`;
  doc += `API 使用标准 HTTP 状态码表示请求结果：\n\n`;
  doc += `- \`200 OK\`: 请求成功\n`;
  doc += `- \`201 Created\`: 资源创建成功\n`;
  doc += `- \`400 Bad Request\`: 请求参数错误\n`;
  doc += `- \`401 Unauthorized\`: 认证失败\n`;
  doc += `- \`403 Forbidden\`: 权限不足\n`;
  doc += `- \`404 Not Found\`: 资源不存在\n`;
  doc += `- \`500 Internal Server Error\`: 服务器错误\n\n`;

  doc += `错误响应格式:\n\n`;
  doc += `\`\`\`json\n`;
  doc += `{\n`;
  doc += `  "error": {\n`;
  doc += `    "code": "ERROR_CODE",\n`;
  doc += `    "message": "错误描述"\n`;
  doc += `  }\n`;
  doc += `}\n`;
  doc += `\`\`\`\n`;

  return doc;
}

/**
 * 生成 HTML 文档
 */
function generateHTMLDocumentation(markdown: string): string {
  // 简单的 Markdown 转 HTML 转换
  const html = markdown
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
    .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/```\n([\s\S]*?)\n```/g, '<pre><code>$1</code></pre>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API 文档</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1, h2, h3, h4 {
      color: #2c3e50;
      margin-top: 1.5em;
    }
    code {
      background-color: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
    }
    pre {
      background-color: #f4f4f4;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }
    pre code {
      background-color: transparent;
      padding: 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 15px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 10px;
      text-align: left;
    }
    th {
      background-color: #f4f4f4;
      font-weight: 600;
    }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
}

/**
 * 生成 OpenAPI 规格
 */
function generateOpenApiSpec(config: {
  apiName: string;
  version: string;
  description?: string;
  baseUrl: string;
  endpoints: EndpointConfig[];
  authentication?: AuthConfig;
  models?: Record<string, ModelConfig>;
}): Record<string, unknown> {
  const { apiName, version, description, baseUrl, endpoints, authentication, models } = config;

  return {
    openapi: '3.0.0',
    info: {
      title: `${apiName} API`,
      version,
      description: description || `${apiName} API 参考文档`,
    },
    servers: [
      {
        url: baseUrl,
        description: '生产环境',
      },
    ],
    security: authentication && authentication.type !== 'none' ? [{ bearerAuth: [] }] : [],
    paths: Object.fromEntries(
      endpoints.map((endpoint) => [
        endpoint.path,
        {
          [endpoint.method.toLowerCase()]: {
            summary: endpoint.description,
            operationId: `${endpoint.method.toLowerCase()}${endpoint.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
            parameters:
              endpoint.requestParams?.map((param) => ({
                name: param.name,
                in: param.in,
                required: param.required,
                schema: {
                  type: param.type,
                  ...(param.default !== undefined && { default: param.default }),
                },
                description: param.description,
              })) || [],
            requestBody: endpoint.requestBody
              ? {
                  content: {
                    'application/json': {
                      schema: convertToOpenApiSchema(endpoint.requestBody),
                    },
                  },
                }
              : undefined,
            responses: {
              '200': {
                description: '成功响应',
                content: {
                  'application/json': {
                    schema: endpoint.responseBody
                      ? convertToOpenApiSchema(endpoint.responseBody)
                      : undefined,
                  },
                },
              },
              ...Object.fromEntries(
                (endpoint.errorResponses || []).map((err) => [
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
                                code: { type: 'string', example: err.errorCode },
                                message: { type: 'string', example: err.description },
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
      securitySchemes:
        authentication?.type === 'bearer'
          ? {
              bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
              },
            }
          : authentication?.type === 'api_key'
            ? {
                apiKeyAuth: {
                  type: 'apiKey',
                  in: 'header',
                  name: authentication.header || 'X-API-Key',
                },
              }
            : {},
      schemas: models
        ? (Object.fromEntries(
            Object.entries(models).map(([modelName, model]) => [
              modelName,
              {
                type: 'object',
                description: model.description,
                properties: Object.fromEntries(
                  model.properties.map((prop) => [
                    prop.name,
                    {
                      type: prop.type.split('<')[0], // 处理泛型类型
                      description: prop.description,
                      ...(prop.example ? { example: prop.example } : {}),
                      ...(prop.enum ? { enum: prop.enum } : {}),
                    },
                  ])
                ) as Record<string, unknown>,
                required: model.properties.filter((p) => p.required).map((p) => p.name),
              } as Record<string, unknown>,
            ])
          ) as Record<string, unknown>)
        : {},
    },
  };
}

/**
 * 将普通对象转换为 OpenAPI Schema
 */
function convertToOpenApiSchema(obj: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key,
        {
          type: typeof value,
          example: value,
        },
      ])
    ),
  };
}

/**
 * 生成快速入门指南
 */
function generateQuickStart(
  apiName: string,
  authentication?: AuthConfig,
  firstEndpoint?: EndpointConfig
): string {
  return `# ${apiName} 快速入门

## 1. 获取访问凭证

${
  authentication?.type === 'bearer'
    ? '首先，您需要获取访问令牌。调用认证接口获取 JWT Token。'
    : authentication?.type === 'api_key'
      ? '首先，在控制台申请 API Key。'
      : '本 API 无需认证。'
}

## 2. 发送第一个请求

\`\`\`bash
curl -X ${firstEndpoint?.method || 'GET'} "${firstEndpoint?.path || '/'}" \\
  -H "Content-Type: application/json" \\
  ${authentication?.type === 'bearer' ? '-H "Authorization: Bearer YOUR_TOKEN" \\\n  ' : authentication?.type === 'api_key' ? `-H "${authentication.header || 'X-API-Key'}: YOUR_API_KEY" \\\n  ` : ''}
\`\`\`

## 3. 处理响应

成功的响应将返回 JSON 格式的数据。检查响应状态码：
- 200: 请求成功
- 400: 请求参数错误
- 401: 认证失败
- 500: 服务器错误

## 4. 下一步

- 阅读完整 [API 参考](#端点)
- 查看 [数据模型](#数据模型)
- 了解 [错误处理](#错误处理)
`;
}

/**
 * 生成错误码参考
 */
function generateErrorCodeReference(endpoints: EndpointConfig[]): string {
  const errorCodes = new Map<string, { code: string; description: string; statusCode: number }>();

  // 收集所有错误码
  for (const endpoint of endpoints) {
    for (const err of endpoint.errorResponses || []) {
      const key = `${err.statusCode}-${err.errorCode}`;
      if (!errorCodes.has(key)) {
        errorCodes.set(key, {
          code: err.errorCode,
          description: err.description,
          statusCode: err.statusCode,
        });
      }
    }
  }

  // 添加通用错误码
  const commonErrors = [
    { code: 'INVALID_REQUEST', description: '请求参数无效', statusCode: 400 },
    { code: 'UNAUTHORIZED', description: '未授权访问', statusCode: 401 },
    { code: 'FORBIDDEN', description: '权限不足', statusCode: 403 },
    { code: 'NOT_FOUND', description: '资源不存在', statusCode: 404 },
    { code: 'INTERNAL_ERROR', description: '服务器内部错误', statusCode: 500 },
  ];

  for (const err of commonErrors) {
    const key = `${err.statusCode}-${err.code}`;
    if (!errorCodes.has(key)) {
      errorCodes.set(key, err);
    }
  }

  // 生成文档
  let doc = '## 错误码参考\n\n';
  doc += '| 错误码 | 状态码 | 描述 |\n';
  doc += '|--------|--------|------|\n';

  for (const [, err] of errorCodes.entries()) {
    doc += `| ${err.code} | ${err.statusCode} | ${err.description} |\n`;
  }

  return doc;
}

/**
 * 生成默认端点
 */
function generateDefaultEndpoints(apiName: string): EndpointConfig[] {
  const resourceName = apiName.toLowerCase().replace(/\s+/g, '-');

  return [
    {
      method: 'GET',
      path: `/api/v1/${resourceName}`,
      description: `获取${apiName}列表`,
      requestParams: [
        {
          name: 'page',
          in: 'query',
          type: 'number',
          required: false,
          description: '页码',
          example: 1,
        },
        {
          name: 'limit',
          in: 'query',
          type: 'number',
          required: false,
          description: '每页数量',
          example: 20,
        },
      ],
      responseBody: {
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 100,
        },
      },
      errorResponses: [
        { statusCode: 401, errorCode: 'UNAUTHORIZED', description: '未授权' },
        { statusCode: 500, errorCode: 'INTERNAL_ERROR', description: '服务器错误' },
      ],
    },
    {
      method: 'GET',
      path: `/api/v1/${resourceName}/{id}`,
      description: `获取单个${apiName}详情`,
      requestParams: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          required: true,
          description: `${apiName} ID`,
          example: '123',
        },
      ],
      responseBody: {
        id: '123',
        name: `${apiName}示例`,
      },
      errorResponses: [
        { statusCode: 404, errorCode: 'NOT_FOUND', description: '资源不存在' },
        { statusCode: 401, errorCode: 'UNAUTHORIZED', description: '未授权' },
      ],
    },
    {
      method: 'POST',
      path: `/api/v1/${resourceName}`,
      description: `创建${apiName}`,
      requestBody: {
        name: `${apiName}名称`,
      },
      responseBody: {
        id: '123',
        name: `${apiName}名称`,
        createdAt: '2024-01-01T00:00:00Z',
      },
      errorResponses: [
        { statusCode: 400, errorCode: 'INVALID_REQUEST', description: '请求参数无效' },
        { statusCode: 401, errorCode: 'UNAUTHORIZED', description: '未授权' },
      ],
    },
  ];
}

/**
 * 默认导出
 */
export default APIDocumentationSkill;
