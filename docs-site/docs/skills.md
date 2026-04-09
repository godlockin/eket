---
sidebar_position: 3
---

# Skills 系统

EKET 的 Skills 系统是一套可复用的能力单元，为 AI 智能体提供标准化的专业技能。

## 核心理念

Skills 系统将专业领域知识封装为可插拔的模块，每个 Skill 包含：

- **输入/输出规范** - 类型安全的接口定义
- **执行逻辑** - 领域特定的处理能力
- **拦截器** - 日志、验证、缓存等横切关注点

## 三级架构

```
┌─────────────────────────────────────────────────────────┐
│                   Unified Skill Interface                │
├─────────────────────────────────────────────────────────┤
│                    Interceptors Layer                    │
│  Logging → Validation → Caching → Error Handling        │
├─────────────────────────────────────────────────────────┤
│                      Skills Registry                     │
│          Register, Discover, and Resolve Skills          │
├─────────────────────────────────────────────────────────┤
│                       Skill Loader                       │
│        Load Skills from Files or Remote Sources          │
├─────────────────────────────────────────────────────────┤
│                   Base Skills Library                    │
│  Requirements | Design | Development | Testing | DevOps │
└─────────────────────────────────────────────────────────┘
```

## 内置 Skills

### Requirements（需求分析）

| Skill | 描述 |
|-------|------|
| `RequirementDecompositionSkill` | 需求拆解，将模糊需求分解为可执行任务 |

### Design（系统设计）

| Skill | 描述 |
|-------|------|
| `APIDesignSkill` | API 设计，生成 RESTful API 规范和 Schema |

### Development（开发实现）

| Skill | 描述 |
|-------|------|
| `FrontendDevelopmentSkill` | 前端开发，生成组件代码和样式 |

### Testing（测试）

| Skill | 描述 |
|-------|------|
| `UnitTestSkill` | 单元测试生成，包含测试用例和 Mock 配置 |

### DevOps（运维）

| Skill | 描述 |
|-------|------|
| `DockerBuildSkill` | Docker 构建，生成 Dockerfile 和镜像 |

### Documentation（文档）

| Skill | 描述 |
|-------|------|
| `APIDocumentationSkill` | API 文档生成，输出 OpenAPI 规范 |

## 使用示例

### 基础用法

```typescript
import { SkillsRegistry, SkillLoader } from 'eket';

// 创建注册表
const registry = createSkillsRegistry();

// 从目录加载 Skills
const loader = createSkillLoader(registry);
await loader.loadFromDirectory('./skills');

// 获取并使用 Skill
const apiDesign = registry.get('api-design');
const result = await apiDesign.execute({
  description: '用户管理 API',
  requirements: ['CRUD 操作', '权限验证']
});
```

### 统一接口

```typescript
import { UnifiedSkillInterface } from 'eket';

// 创建统一接口（带拦截器）
const skillInterface = createUnifiedSkillInterface(registry);

// 添加拦截器
skillInterface.addInterceptor(new LoggingInterceptor());
skillInterface.addInterceptor(new ValidationInterceptor());

// 执行 Skill
const result = await skillInterface.execute('api-design', input);
```

## 自定义 Skills

创建自定义 Skill 需要实现 `Skill` 接口：

```typescript
import type { Skill } from 'eket';

const myCustomSkill: Skill = {
  name: 'my-custom-skill',
  category: 'development',
  description: '我的自定义技能',

  execute: async (input) => {
    // 实现业务逻辑
    return { output: 'result' };
  }
};
```

## 配置选项

### SkillsRegistry 配置

```typescript
const registry = createSkillsRegistry({
  autoRegister: true,      // 自动注册加载的 Skills
  strictMode: false,       // 严格模式：重复注册时报错
  lazyLoad: true           // 懒加载：仅在首次使用时加载
});
```

### SkillLoader 配置

```typescript
const loader = createSkillLoader(registry, {
  searchPaths: ['./skills', './custom-skills'],
  filePattern: /\.skill\.(ts|js)$/,
  watchMode: false         // 监听文件变化
});
```

## 扩展点

Skills 系统提供以下扩展点：

1. **拦截器** - 在 Skill 执行前后添加自定义逻辑
2. **事件监听器** - 监听 Skill 生命周期事件
3. **自定义加载器** - 从非文件系统源加载 Skills
4. **技能组合** - 将多个 Skills 组合为工作流

## 相关文档

- [CLI 参考](cli-reference.md) - 使用 Skills 的 CLI 命令
- [配置指南](configuration.md) - Skills 系统配置
- [架构设计](architecture.md) - Skills 系统在整体架构中的位置
