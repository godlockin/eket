# Schema 定义

**版本**: 2.14.0-beta | **最后更新**: 2026-05-24 | **依赖 EPIC**: EPIC-011

> 定义代码分析图中的节点类型和边类型，覆盖代码和非代码文件。

---

## 前置要求

- 理解 [代码分析架构](analysis-architecture.md)
- 了解图数据结构基础（可选）

---

## 概述

EKET 代码分析使用图结构表示代码库：

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Node    │────▶│   Edge   │────▶│  Node    │
│ (文件/   │     │ (关系)   │     │ (文件/   │
│  函数等) │     │          │     │  服务等) │
└──────────┘     └──────────┘     └──────────┘
```

---

## 节点类型 (Node Types)

### 代码节点

| 类型 | 说明 | 适用文件 | 示例 |
|------|------|----------|------|
| `file` | 源代码文件 | `.ts`, `.rs`, `.py`, `.go` | `src/core/election.rs` |
| `function` | 函数/方法 | 所有代码文件 | `elect_master()` |
| `class` | 类/结构体 | `.ts`, `.py`, `.java`, `.rs` | `ElectionManager` |
| `interface` | 接口/trait | `.ts`, `.go`, `.rs` | `IQueueService` |
| `module` | 模块 | `.py`, `.rs` | `crate::queue` |
| `constant` | 常量 | 所有代码文件 | `MAX_RETRY_COUNT` |

**节点属性**：

```json
{
  "id": "file:src/core/election.rs",
  "type": "file",
  "path": "src/core/election.rs",
  "language": "rust",
  "metadata": {
    "line_count": 245,
    "complexity": "medium",
    "layer": "infrastructure"
  },
  "children": [
    "function:src/core/election.rs#elect_master",
    "class:src/core/election.rs#ElectionConfig"
  ]
}
```

### 非代码节点

| 类型 | 说明 | 适用文件 | 示例 |
|------|------|----------|------|
| `config` | 配置文件 | `.yaml`, `.json`, `.toml`, `.env` | `config/database.yaml` |
| `document` | 文档 | `.md`, `.rst`, `.txt` | `docs/README.md` |
| `service` | 容器定义 | `Dockerfile`, `docker-compose.yaml` | `Dockerfile` |
| `table` | 数据库表 | `.sql`, `schema.prisma` | `migrations/001_users.sql` |
| `endpoint` | API 端点 | `openapi.yaml`, `.http` | `/api/v1/users` |
| `pipeline` | CI/CD 配置 | `.github/workflows/*.yaml` | `.github/workflows/ci.yaml` |
| `schema` | Schema 定义 | `.graphql`, `.proto` | `schema.graphql` |
| `resource` | 基础设施资源 | `.tf`, `*.k8s.yaml` | `main.tf` |

**非代码节点属性**：

```json
{
  "id": "config:config/database.yaml",
  "type": "config",
  "path": "config/database.yaml",
  "format": "yaml",
  "metadata": {
    "keys": ["host", "port", "database", "pool_size"],
    "environment_refs": ["DATABASE_HOST", "DATABASE_PORT"]
  }
}
```

---

## 边类型 (Edge Types)

### 代码边

| 类型 | 方向 | 说明 | 示例 |
|------|------|------|------|
| `imports` | A → B | A 导入 B | `auth.ts` imports `crypto.ts` |
| `exports` | A → B | A 导出 B（反向引用） | `index.ts` exports `auth.ts` |
| `extends` | A → B | A 继承/实现 B | `Manager` extends `BaseService` |
| `calls` | A → B | A 调用 B 的函数 | `login()` calls `hashPassword()` |
| `contains` | A → B | A 包含 B（父子关系） | `file` contains `function` |
| `references` | A → B | A 引用 B（类型引用） | `User` references `Role` |

### 非代码边

| 类型 | 方向 | 说明 | 示例 |
|------|------|------|------|
| `configures` | config → code | 配置文件配置代码 | `database.yaml` configures `db.ts` |
| `documents` | doc → code | 文档描述代码 | `README.md` documents `src/` |
| `deploys` | service → code | 容器部署代码 | `Dockerfile` deploys `app` |
| `triggers` | pipeline → service | CI/CD 触发服务 | `ci.yaml` triggers `api-service` |
| `defines_schema` | schema → code | Schema 定义代码结构 | `schema.graphql` defines_schema `resolvers/` |
| `migrates` | table → table | 数据库迁移关系 | `002_add_email.sql` migrates `001_users.sql` |
| `provisions` | resource → service | 资源供应服务 | `main.tf` provisions `api-service` |

**边属性**：

```json
{
  "source": "file:src/services/auth.ts",
  "target": "file:src/utils/crypto.ts",
  "type": "imports",
  "metadata": {
    "import_type": "named",
    "symbols": ["hashPassword", "verifyPassword"],
    "line": 3
  }
}
```

---

## 关联关系图

```
                    ┌─────────────┐
                    │   config    │
                    │ (yaml/json) │
                    └──────┬──────┘
                           │ configures
                           ▼
┌──────────┐         ┌─────────────┐         ┌──────────┐
│ document │─────────│    file     │─────────│  schema  │
│   (md)   │documents│   (code)    │ defines │(graphql) │
└──────────┘         └─────┬───────┘         └──────────┘
                           │ contains
                           ▼
                    ┌─────────────┐
                    │  function   │
                    │   /class    │
                    └──────┬──────┘
                           │ calls/extends
                           ▼
                    ┌─────────────┐
                    │  function   │
                    │   /class    │
                    └─────────────┘

┌──────────┐         ┌─────────────┐         ┌──────────┐
│ pipeline │─────────│   service   │─────────│ resource │
│  (ci)    │ triggers│ (container) │provisions│  (tf)   │
└──────────┘         └──────┬──────┘         └──────────┘
                           │ deploys
                           ▼
                    ┌─────────────┐
                    │    file     │
                    │   (code)    │
                    └─────────────┘
```

---

## 扩展指南

### 添加新节点类型

1. 在 `node/src/schema/types.ts` 中定义类型：

```typescript
export interface CustomNode extends BaseNode {
  type: 'custom';
  customField: string;
}
```

2. 在解析器中处理该类型：

```typescript
// node/src/parsers/custom-parser.ts
export function parseCustomFile(path: string): CustomNode {
  return {
    id: `custom:${path}`,
    type: 'custom',
    path,
    customField: '...'
  };
}
```

3. 注册到类型检测器：

```typescript
// node/src/schema/registry.ts
registerNodeType({
  type: 'custom',
  extensions: ['.custom'],
  parser: parseCustomFile
});
```

### 添加新边类型

1. 定义边类型：

```typescript
export interface CustomEdge extends BaseEdge {
  type: 'custom_relation';
  weight?: number;
}
```

2. 在边提取器中实现：

```typescript
// node/src/extractors/custom-extractor.ts
export function extractCustomEdges(node: Node): CustomEdge[] {
  // 分析节点，提取关系
}
```

---

## JSON Schema

### 节点 Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "type", "path"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-z]+:.+$"
    },
    "type": {
      "type": "string",
      "enum": ["file", "function", "class", "interface", "module", "constant",
               "config", "document", "service", "table", "endpoint", "pipeline",
               "schema", "resource"]
    },
    "path": {
      "type": "string"
    },
    "metadata": {
      "type": "object"
    },
    "children": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

### 边 Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["source", "target", "type"],
  "properties": {
    "source": {
      "type": "string"
    },
    "target": {
      "type": "string"
    },
    "type": {
      "type": "string",
      "enum": ["imports", "exports", "extends", "calls", "contains", "references",
               "configures", "documents", "deploys", "triggers", "defines_schema",
               "migrates", "provisions"]
    },
    "metadata": {
      "type": "object"
    }
  }
}
```

---

## 常见问题

### Q: 如何区分 `imports` 和 `references`？

**A**: 
- `imports` 是显式的模块导入语句（`import`, `require`, `use`）
- `references` 是类型级别的引用（函数参数类型、返回类型）

### Q: 非代码节点的 `id` 格式是什么？

**A**: `{type}:{path}`，例如 `config:config/database.yaml`

### Q: 如何处理动态导入？

**A**: 动态导入（`import()`）标记为 `imports` 边，但 `metadata.dynamic = true`

---

## 下一步

- [代码分析架构](analysis-architecture.md) — 理解分析流程
- [CLI 命令参考](../reference/cli-reference.md) — 使用 schema 的命令
- [JSON Schema 文件](schemas/) — 完整 JSON Schema
