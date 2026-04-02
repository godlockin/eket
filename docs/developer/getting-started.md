# EKET Framework 开发者快速开始

**版本**: 2.0.0
**最后更新**: 2026-04-02

---

## 5 分钟快速开始

### 前提条件

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git >= 2.30.0

### 步骤 1: 克隆项目

```bash
git clone <repository-url>
cd eket
```

### 步骤 2: 安装依赖

```bash
cd node
npm install
```

### 步骤 3: 编译 TypeScript

```bash
npm run build
```

### 步骤 4: 运行测试

```bash
npm test
```

### 步骤 5: 启动实例

```bash
# 启动 Agent 实例（自动检测 Master/Slaver 角色）
node dist/index.js start-instance

# 或使用 CLI 命令
./node/dist/index.js start-instance
```

---

## 开发环境设置

### 1. Node.js 环境

**推荐**: 使用 nvm 管理 Node.js 版本

```bash
# 安装 nvm (macOS/Linux)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 安装 Node.js 18
nvm install 18
nvm use 18

# 验证版本
node --version  # v18.x.x
npm --version   # 9.x.x
```

### 2. 环境变量配置

创建 `.env` 文件（可选）：

```bash
# Redis 配置（可选，有降级方案）
EKET_REMOTE_REDIS_HOST=localhost
EKET_REMOTE_REDIS_PORT=6380
EKET_REMOTE_REDIS_PASSWORD=

EKET_LOCAL_REDIS_HOST=localhost
EKET_LOCAL_REDIS_PORT=6379

# SQLite 配置（可选）
EKET_SQLITE_PATH=~/.eket/data/sqlite/eket.db

# 文件队列配置（可选）
EKET_FILE_QUEUE_DIR=./.eket/data/queue

# API Key（用于 Web Dashboard）
EKET_API_KEY=your-secure-api-key

# 驱动模式
EKET_DRIVER_MODE=js  # 或 shell
```

### 3. 可选：Docker 环境

```bash
# 启动 Redis（可选）
docker run -d --name eket-redis -p 6379:6379 redis:latest

# 停止 Redis
docker stop eket-redis
```

### 4. IDE 配置

**VS Code 推荐配置**:

```json
// .vscode/settings.json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "files.insertFinalNewline": true,
  "files.trimTrailingWhitespace": true
}
```

---

## 项目结构

```
eket/
├── node/                     # Node.js 项目
│   ├── src/                  # TypeScript 源码
│   │   ├── core/             # 核心模块
│   │   │   ├── connection-manager.ts    # 连接管理（四级降级）
│   │   │   ├── master-election.ts       # Master 选举
│   │   │   ├── circuit-breaker.ts       # 断路器
│   │   │   ├── cache-layer.ts           # 缓存层
│   │   │   ├── message-queue.ts         # 消息队列
│   │   │   ├── redis-client.ts          # Redis 客户端
│   │   │   └── sqlite-client.ts         # SQLite 客户端
│   │   ├── commands/         # CLI 命令
│   │   │   ├── start-instance.ts        # 启动实例
│   │   │   ├── claim.ts                 # 领取任务
│   │   │   ├── submit-pr.ts             # 提交 PR
│   │   │   └── alerts.ts                # 告警管理
│   │   ├── api/              # API 层
│   │   │   ├── web-server.ts            # Web 服务器
│   │   │   └── routes/                  # API 路由
│   │   ├── types/            # 类型定义
│   │   │   └── index.ts                 # 统一导出
│   │   └── index.ts          # 入口文件
│   ├── tests/                # 测试文件
│   ├── package.json
│   └── tsconfig.json
├── docs/                     # 文档
│   ├── api/                  # API 文档
│   ├── adr/                  # 架构决策记录
│   ├── developer/            # 开发者指南
│   ├── ops/                  # 运维手册
│   └── troubleshooting/      # 故障排查
└── scripts/                  # 工具脚本
```

---

## 常见任务

### 1. 添加新的 CLI 命令

**步骤 1**: 创建命令文件

```typescript
// src/commands/my-command.ts
import type { CLICommand } from '../types/index.js';

export const myCommand: CLICommand = {
  name: 'my:command',
  description: '我的命令描述',
  options: [
    {
      flags: '--option <value>',
      description: '选项描述',
      required: false,
    },
  ],
  handler: async (args) => {
    console.log('执行命令...', args);
  },
};
```

**步骤 2**: 注册命令

```typescript
// src/index.ts
import { myCommand } from './commands/my-command.js';

const commands = [
  // ... 其他命令
  myCommand,
];
```

### 2. 添加新的核心模块

**步骤 1**: 创建模块文件

```typescript
// src/core/my-module.ts
import type { Result } from '../types/index.js';
import { EketError } from '../types/index.js';

export interface MyModuleConfig {
  // 配置选项
}

export class MyModule {
  private config: MyModuleConfig;

  constructor(config: Partial<MyModuleConfig> = {}) {
    this.config = {
      // 默认配置
      ...config,
    };
  }

  async doSomething(): Promise<Result<void>> {
    try {
      // 实现逻辑
      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        error: new EketError('MY_ERROR', '错误信息'),
      };
    }
  }
}

export function createMyModule(config?: Partial<MyModuleConfig>): MyModule {
  return new MyModule(config);
}
```

**步骤 2**: 导出类型（如果需要）

```typescript
// src/types/index.ts
export type { MyModuleConfig } from '../core/my-module.js';
```

### 3. 添加新的错误码

```typescript
// src/types/index.ts
export enum EketErrorCode {
  // ... 现有错误码

  // 新错误码
  MY_NEW_ERROR = 'MY_NEW_ERROR',
}
```

### 4. 添加新的 API 端点

**步骤 1**: 创建路由处理器

```typescript
// src/api/routes/my-route.ts
import type { http } from 'http';

export async function handleMyRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  res.setHeader('Content-Type', 'application/json');

  const responseData = {
    success: true,
    data: { message: 'Hello, World!' },
    timestamp: Date.now(),
  };

  res.writeHead(200);
  res.end(JSON.stringify(responseData));
}
```

**步骤 2**: 注册路由

```typescript
// src/api/web-server.ts
import { handleMyRoute } from './routes/my-route.js';

// 在 handleApiRequest 中添加
switch (url) {
  case '/api/my-endpoint':
    await handleMyRoute(req, res);
    break;
}
```

### 5. 编写测试

**步骤 1**: 创建测试文件

```typescript
// tests/my-module.test.ts
import { describe, it, expect } from 'vitest';
import { createMyModule } from '../src/core/my-module.js';

describe('MyModule', () => {
  it('should do something', async () => {
    const module = createMyModule();
    const result = await module.doSomething();

    expect(result.success).toBe(true);
  });
});
```

**步骤 2**: 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- my-module.test.ts

# 运行测试并生成覆盖率
npm run test:coverage
```

### 6. 调试代码

**VS Code 调试配置**:

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "调试 EKET",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/node/dist/index.js",
      "args": ["start-instance"],
      "cwd": "${workspaceFolder}/node",
      "env": {
        "EKET_LOCAL_REDIS_HOST": "localhost",
        "EKET_LOCAL_REDIS_PORT": "6379"
      }
    }
  ]
}
```

---

## 代码风格指南

### 命名约定

```typescript
// 类名：PascalCase
export class CircuitBreaker { }

// 函数/方法：camelCase
function createCache() { }

// 常量：UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// 类型/接口：PascalCase
interface UserConfig { }

// 文件名：kebab-case
// circuit-breaker.ts
```

### 错误处理

```typescript
// ✓ 好的做法
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : 'Unknown error';
  return {
    success: false,
    error: new EketError('OPERATION_FAILED', errorMessage),
  };
}

// ✗ 避免的做法
} catch (e: any) {
  console.error(e);
  throw e;
}
```

### 类型安全

```typescript
// ✓ 使用 unknown + 类型守卫
} catch (e: unknown) {
  const error = e as { message?: string; code?: string };
  logger.error({ message: error.message, code: error.code });
}

// ✗ 避免 any
} catch (e: any) {
  // 类型系统失效
}
```

### 不可变性

```typescript
// ✓ 使用 const
const config = { ...defaultConfig, ...userConfig };

// ✗ 避免直接修改参数
function updateConfig(config: Config) {
  config.option = 'new value';  // 不要这样做
}
```

---

## 开发工作流

### 1. 创建功能分支

```bash
git checkout -b feature/my-new-feature
```

### 2. 开发和测试

```bash
# 编译代码
npm run build

# 运行测试
npm test

# 本地测试命令
node dist/index.js --help
```

### 3. 提交代码

```bash
git add .
git commit -m "feat: 添加新功能

功能描述...

Closes #123"
```

### 4. 推送和 PR

```bash
git push origin feature/my-new-feature
# 然后创建 Pull Request
```

---

## 故障排查

### 常见问题

| 问题 | 解决方案 |
|------|----------|
| TypeScript 编译错误 | 运行 `npm install` 确保依赖完整 |
| 测试失败 | 检查测试环境配置，确保 SQLite 文件路径可写 |
| Redis 连接失败 | 检查 Redis 是否运行，或降级到 SQLite/文件模式 |
| 权限错误 | 确保有写权限，或使用 `chmod` 修改目录权限 |

### 获取帮助

```bash
# 查看帮助
node dist/index.js --help

# 查看特定命令帮助
node dist/index.js start-instance --help
```

---

## 相关文档

- [API 参考](../api/README.md)
- [架构决策](../adr/)
- [运维手册](../ops/runbook.md)
- [故障排查](../troubleshooting/common-issues.md)

---

**文档维护**: EKET Framework Team
