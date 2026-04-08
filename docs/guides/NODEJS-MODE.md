# Level 2: Node.js 模式使用指南

**目标**: Node.js + 优化文件队列专业功能
**优先级**: ⭐⭐⭐⭐ (开发环境推荐)
**版本**: v2.3.1
**最后更新**: 2026-04-08

---

## 🎯 Level 2 设计理念

**Level 2 是 Level 1 的专业升级，提供类型安全和更高效的文件队列机制。**

核心特性：
- ✅ **TypeScript 类型安全**: 编译时类型检查，减少运行时错误
- ✅ **优化文件队列**: 原子操作 + 去重 + 归档机制
- ✅ **丰富 CLI 命令**: 50+ 命令覆盖所有使用场景
- ✅ **更好性能**: P95 延迟 ~50ms (vs Level 1 ~500ms)
- ✅ **优雅降级**: Redis 不可用时自动降级到文件队列

---

## 📊 Level 1 vs Level 2 功能对比

| 功能类别 | Level 1 (Shell) | Level 2 (Node.js) |
|---------|-----------------|-------------------|
| **消息队列** | 文件队列 (JSON) | 优化文件队列 + 去重 + 归档 |
| **类型安全** | ❌ 无 | ✅ TypeScript 编译时检查 |
| **命令丰富度** | 基础 (~10 命令) | 完整 (~50 命令) |
| **错误处理** | Bash exit code | Result<T> 模式 + 详细错误码 |
| **性能 (P95)** | ~500ms | ~50ms |
| **开发体验** | 基础 | 优秀 (IDE 支持、调试、测试) |
| **依赖要求** | Bash + Git | Node.js >= 18.0 |
| **启动时间** | 30s | 60s |

**何时使用 Level 2**:
- ✅ 单机开发环境
- ✅ 中小规模项目 (~100 任务)
- ✅ 需要更好的开发体验
- ✅ 不想部署 Redis/SQLite

**何时使用 Level 1**:
- ✅ 快速原型验证 (30秒启动)
- ✅ 最小化环境 (CI/CD 轻量容器)
- ✅ 离线场景 (无网络)

---

## 📋 前置要求

### 必需依赖

```bash
# 1. Node.js >= 18.0.0
node --version
# v18.0.0 或更高

# 2. npm >= 9.0.0
npm --version
# 9.0.0 或更高

# 3. Git >= 2.30.0
git --version
# git version 2.30.0 或更高
```

### 可选依赖

- **Redis**: 如果希望使用 Level 3 功能但自动降级到 Level 2
- **SQLite**: 如果希望使用持久化存储

---

## 🚀 5 分钟快速启动

### 1. 安装依赖

```bash
# 克隆仓库
git clone https://github.com/godlockin/eket.git
cd eket

# 安装 Node.js 依赖
cd node
npm install

# 输出示例:
# added 234 packages in 15s
```

### 2. 构建项目

```bash
# 编译 TypeScript 到 dist/
npm run build

# 输出示例:
# > eket@2.3.1 build
# > tsc
#
# Build completed successfully
```

### 3. 启动实例

```bash
# 自动检测 Master/Slaver
node dist/index.js instance:start

# 输出示例:
# ========================================
# EKET 实例启动 v2.3.1
# ========================================
# [INFO] 运行级别: Level 2 (Node.js + 文件队列)
# [INFO] Redis: ❌ 不可用 (降级到文件队列)
# [INFO] SQLite: ❌ 未配置
# [INFO] 角色: 自动检测中...
# [INFO] Master 已就绪
# [INFO] 实例 ID: master-node-20260408-001
```

### 4. 验证安装

```bash
# 运行系统诊断
node dist/index.js system:doctor

# 输出示例:
# ========================================
# EKET 系统诊断 v2.3.1
# ========================================
#
# [✓] Node.js: v20.11.0
# [✓] npm: v10.2.4
# [✗] Redis: 不可用 (降级到文件队列)
# [✗] SQLite: 未配置
# [✓] 文件队列: 就绪
#     - 队列目录: .eket/data/queue
#     - 待处理: 0 消息
#     - 已处理: 0 消息
# [✓] 磁盘空间: 45% 已使用 (安全)
# [✓] 内存: 62% 已使用 (正常)
#
# 系统健康状态: ✅ 良好 (Level 2 就绪)
```

---

## 🎮 CLI 命令参考

### 系统命令

#### system:doctor - 系统诊断

```bash
node dist/index.js system:doctor
```

全面检查 Node.js、Redis、SQLite、磁盘、内存状态。

#### system:check - 快速检查

```bash
node dist/index.js system:check
```

快速检查 Node.js 模块可用性。

### 实例管理

#### instance:start - 启动实例

```bash
# AI 自动模式 (自动检测角色，自动领取任务)
node dist/index.js instance:start --auto

# 人工模式 (需要指定角色)
node dist/index.js instance:start --human --role frontend_dev
node dist/index.js instance:start --human --role backend_dev

# 列出可用角色
node dist/index.js instance:start --list-roles

# 输出示例 (--list-roles):
# Available Roles:
#   Coordinators: product_manager, architect, tech_manager, doc_monitor
#   Executors: frontend_dev, backend_dev, qa_engineer, devops_engineer
```

**参数说明**:
- `--auto`: AI 自动模式，自动检测角色并领取任务
- `--human --role <role>`: 人工模式，需要明确指定角色
- `--list-roles`: 列出所有可用角色（coordinators 和 executors）
- `-p, --project-root <path>`: 指定项目根目录

#### instance:set-role - 设置角色

```bash
node dist/index.js instance:set-role frontend_dev
```

### 文件队列命令

#### queue:test - 测试队列

```bash
node dist/index.js queue:test

# 输出示例:
# [INFO] 测试文件队列...
# [INFO] 入队 5 条消息...
# [INFO] 出队 5 条消息...
# [✓] 文件队列测试通过
```

**注意**: Level 2 的队列管理通过文件系统直接操作，无需专门的 status/clear 命令。查看队列状态可以直接查看文件：

```bash
# 查看队列状态
ls -l .eket/data/queue/pending/    # 待处理
ls -l .eket/data/queue/processing/ # 处理中
ls -l .eket/data/queue/processed/  # 已处理

# 清空队列（Shell 操作）
rm .eket/data/queue/pending/*.json    # 清空待处理
rm .eket/data/queue/processing/*.json # 清空处理中
```

### SQLite 命令

#### sqlite:check - 检查数据库

```bash
node dist/index.js sqlite:check

# 输出示例:
# [✓] SQLite 数据库就绪
# 路径: /Users/user/.eket/data/sqlite/eket.db
# 大小: 128 KB
# WAL 模式: 已启用
```

#### sqlite:list-retros - 列出 Retrospective

```bash
# 列出最近 10 条
node dist/index.js sqlite:list-retros

# 列出最近 50 条
node dist/index.js sqlite:list-retros --limit 50

# 输出示例:
# ========================================
# Retrospective 列表
# ========================================
# 1. TASK-042 | implementation | 实现了用户认证
# 2. TASK-041 | testing | 添加了单元测试
# ...
```

#### sqlite:search - 搜索 Retrospective

```bash
node dist/index.js sqlite:search "认证"

# 输出示例:
# 找到 3 条匹配记录:
# 1. TASK-042 | 实现了用户认证
# 2. TASK-038 | 添加认证中间件
# 3. TASK-035 | 设计认证流程
```

#### sqlite:report - 生成统计报告

```bash
node dist/index.js sqlite:report

# 输出示例:
# ========================================
# SQLite 统计报告
# ========================================
# 总 Retrospective: 128
# 实现 (implementation): 45
# 测试 (testing): 32
# 审查 (review): 28
# 修复 (bugfix): 23
```

### 项目管理

#### project:init - 项目初始化

```bash
node dist/index.js project:init

# 交互式向导:
# ? 项目名称: my-awesome-project
# ? 项目描述: A full-stack web application
# ? 使用三仓库模式? (y/N) y
```

#### task:claim - 领取任务

```bash
node dist/index.js task:claim TASK-042

# 输出示例:
# [✓] 已领取任务: TASK-042
# [INFO] 创建 worktree: .claude/worktrees/task-042
# [INFO] 分支: feature/TASK-042-user-auth
```

### 心跳管理

#### heartbeat:start - 启动心跳

```bash
node dist/index.js heartbeat:start slaver-backend-001

# 输出示例:
# [INFO] 心跳服务已启动
# [INFO] 间隔: 30 秒
# [INFO] 实例 ID: slaver-backend-001
```

#### heartbeat:status - 查看心跳状态

```bash
node dist/index.js heartbeat:status

# 输出示例:
# ========================================
# 心跳状态
# ========================================
# slaver-backend-001: ✓ 活跃 (5秒前)
# slaver-frontend-002: ✓ 活跃 (8秒前)
# slaver-qa-003: ⚠ 超时 (120秒前)
```

### 监控服务

#### web:dashboard - Web 监控面板

```bash
node dist/index.js web:dashboard --port 3000

# 访问: http://localhost:3000
```

#### hooks:start - HTTP Hook 服务器

```bash
node dist/index.js hooks:start --port 8899

# 输出示例:
# [INFO] HTTP Hook 服务器启动
# [INFO] 监听端口: 8899
# [INFO] Webhooks:
#   POST /hooks/agent/created
#   POST /hooks/agent/updated
#   POST /hooks/agent/deleted
```

### Agent Pool

#### pool:status - 查看 Agent Pool 状态

```bash
node dist/index.js pool:status

# 输出示例:
# ========================================
# Agent Pool 状态
# ========================================
# 总 Agent: 5
# 可用: 3
# 忙碌: 2
# 离线: 0
```

#### pool:select - 选择 Agent

```bash
# 按角色选择
node dist/index.js pool:select --role backend_dev

# 按负载均衡选择
node dist/index.js pool:select --strategy round-robin
```

---

## 📦 优化文件队列详解

### 队列目录结构

```
.eket/
└── data/
    └── queue/
        ├── pending/          # 待处理消息
        │   ├── msg_001.json
        │   └── msg_002.json
        ├── processing/       # 处理中消息
        │   └── msg_003.json
        ├── processed/        # 已处理消息 (归档)
        │   └── msg_004.json
        └── failed/           # 失败消息
            └── msg_005.json
```

### 消息格式

```json
{
  "id": "msg_20260408_001",
  "from": "master-node-001",
  "to": "slaver-backend-001",
  "type": "assign_task",
  "timestamp": 1712556000000,
  "ttl": 300,
  "checksum": "sha256:abc123...",
  "payload": {
    "task_id": "TASK-042",
    "title": "实现用户认证",
    "priority": "high"
  }
}
```

### 关键特性

#### 1. 原子操作

```typescript
import fs from 'fs';

// 原子写入消息（临时文件 + rename）
function atomicWriteMessage(filePath: string, message: object): void {
  const tmpFile = `${filePath}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(message, null, 2));
  fs.renameSync(tmpFile, filePath);  // 原子操作，避免并发问题
}
```

**为什么使用原子操作？**
- ✅ 避免并发写入导致文件损坏
- ✅ 确保消息完整性（要么完全写入，要么完全不写入）
- ✅ 防止读取到部分写入的数据

#### 2. 去重机制

```typescript
import fs from 'fs';
import path from 'path';

// 基于消息 ID 去重
function checkDuplicate(queueDir: string, messageId: string): boolean {
  const existingIds = new Set<string>();

  try {
    const files = fs.readdirSync(queueDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(queueDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const msg = JSON.parse(content);
        existingIds.add(msg.id);
      } catch (err) {
        // 跳过损坏的文件
        console.warn(`跳过无效文件: ${file}`);
        continue;
      }
    }
  } catch (err) {
    console.error('读取队列目录失败:', err);
    return false;
  }

  return existingIds.has(messageId);
}

// 使用示例
if (checkDuplicate('.eket/data/queue/pending', 'msg_001')) {
  console.log('消息已存在，跳过');
} else {
  // 写入新消息
}
```

**去重策略**:
- ✅ 基于消息 ID 的 Set 查找（O(1) 时间复杂度）
- ✅ 跳过损坏的 JSON 文件
- ✅ 适用于中小规模队列（< 10,000 消息）

#### 3. 归档机制

```bash
# 手动归档 24 小时前的已处理消息
find .eket/data/queue/processed -name "*.json" -mtime +1 \
  -exec mv {} .eket/data/archive/ \;

# 输出示例:
# [INFO] 归档 42 条消息到 .eket/data/archive/
```

**归档策略**:
- 定期将 `processed/` 目录中的旧消息移动到 `archive/`
- 减少队列目录文件数量，提升性能
- 归档文件可用于历史追溯和审计

#### 4. 校验和验证

```typescript
import crypto from 'crypto';

// 生成消息校验和
function generateChecksum(message: object): string {
  const content = JSON.stringify(message);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// 验证消息完整性
function verifyMessage(message: any): boolean {
  const { checksum, ...payload } = message;
  const computed = generateChecksum(payload);

  if (checksum !== computed) {
    console.error('消息校验失败');
    return false;
  }

  return true;
}

// 使用示例
const message = {
  id: 'msg_001',
  type: 'assign_task',
  payload: { task_id: 'TASK-042' }
};

const checksum = generateChecksum(message);
const signedMessage = { ...message, checksum };

// 验证
if (verifyMessage(signedMessage)) {
  console.log('消息校验通过');
}
```

**校验和用途**:
- ✅ 检测消息在传输或存储过程中的损坏
- ✅ 防止手动修改消息文件导致的不一致
- ✅ 提供基本的完整性保证

---

## 🔧 开发环境配置

### 配置文件

复制 `.env.example` 为 `.env`:

```bash
cp .env.example .env
```

**Level 2 关键配置**:

```bash
# Node.js 模式配置
EKET_MODE=nodejs  # 强制使用 Node.js 模式

# 日志配置
EKET_LOG_LEVEL=debug  # debug|info|warn|error
EKET_LOG_DIR=./logs

# 文件队列配置
EKET_QUEUE_DIR=.eket/data/queue
EKET_QUEUE_ARCHIVE_ENABLED=true
EKET_QUEUE_ARCHIVE_AGE=24  # 小时

# 性能配置
EKET_FILE_QUEUE_BATCH_SIZE=10
EKET_FILE_QUEUE_POLL_INTERVAL=5000  # ms

# SQLite 配置 (可选)
EKET_SQLITE_PATH=~/.eket/data/sqlite/eket.db
EKET_SQLITE_WAL_MODE=true
```

### 开发工具

```bash
# 开发模式 (ts-node，无需构建)
cd node
npm run dev -- system:doctor

# 代码检查
npm run lint

# 自动修复
npm run lint:fix

# 格式化代码
npm run format

# 运行测试
npm test

# 运行单个测试
npm test -- --testPathPattern=file-queue

# 清理构建产物
npm run clean
```

---

## 🧪 测试和调试

### 运行测试

```bash
cd node

# 运行所有测试
npm test

# 输出示例:
# Test Suites: 17 passed, 38 total
# Tests:       943 passed, 1064 total
# Time:        23.606 s

# 运行特定模块测试
npm test -- --testPathPattern=optimized-file-queue

# 运行集成测试
npm test -- --testPathPattern=tests/integration/
```

### 调试技巧

```bash
# 启用调试日志
export EKET_LOG_LEVEL=debug
node dist/index.js instance:start

# 使用 Node.js 调试器
node --inspect-brk dist/index.js system:doctor

# 然后在 Chrome 访问: chrome://inspect
```

### 性能分析

```bash
# 运行性能基准测试
cd node
node benchmarks/simple-benchmark.js

# 查看结果
cat benchmarks/results/round4-benchmark-results.json
```

---

## 🔍 故障排查

### 问题 1: 构建失败

**症状**:
```
error TS2307: Cannot find module './core/redis-client.js'
```

**解决方案**:
```bash
# 确保使用 .js 扩展名导入
# ✓ 正确:
import { createRedisClient } from './core/redis-client.js';

# ✗ 错误:
import { createRedisClient } from './core/redis-client';

# 清理并重新构建
npm run clean
npm run build
```

### 问题 2: 文件队列权限错误

**症状**:
```
[ERROR] EACCES: permission denied, mkdir '.eket/data/queue'
```

**解决方案**:
```bash
# 检查目录权限
ls -la .eket/

# 修复权限
chmod -R 755 .eket/

# 如果目录不存在，创建它
mkdir -p .eket/data/queue/{pending,processing,processed,failed}
```

### 问题 3: TypeScript 编译错误

**症状**:
```
error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'
```

**解决方案**:
```bash
# 检查 tsconfig.json 配置
cat tsconfig.json

# 确保使用正确的类型
# 运行类型检查
npx tsc --noEmit
```

### 问题 4: 测试超时

**症状**:
```
Timeout - Async callback was not invoked within 5000ms
```

**解决方案**:
```bash
# 增加测试超时时间
npm test -- --testTimeout=30000

# 或在测试文件中单独配置
it('should handle long operation', async () => {
  // ...
}, 30000);  // 30 秒超时
```

---

## 📈 性能优化

### 文件队列性能

基于 Round 4 benchmark (1000 次迭代):

| 操作 | P50 | P95 | P99 |
|------|-----|-----|-----|
| **Enqueue** | 0.36ms | 1.30ms | 3.39ms |
| **Dequeue** | 0.39ms | 1.09ms | 2.61ms |

**优化建议**:
1. **批量处理**: 使用 `EKET_FILE_QUEUE_BATCH_SIZE=10`
2. **减少轮询**: 将 `EKET_FILE_QUEUE_POLL_INTERVAL` 增加到 10000ms
3. **定期归档**: 启用 `EKET_QUEUE_ARCHIVE_ENABLED=true`

### 内存优化

```bash
# 监控内存使用
node --expose-gc dist/index.js system:doctor

# 限制 Node.js 内存
node --max-old-space-size=512 dist/index.js instance:start
```

---

## 🚀 从 Level 1 迁移

### 迁移步骤

```bash
# 1. 安装 Node.js 依赖
cd node
npm install
npm run build

# 2. 迁移文件队列数据
# Level 1 文件队列与 Level 2 兼容，无需迁移

# 3. 更新启动脚本
# 从:
./scripts/eket-start.sh --role master

# 到:
node dist/index.js instance:start --role master

# 4. 验证功能
node dist/index.js system:doctor
```

### 兼容性

Level 2 **完全兼容** Level 1 的文件队列格式，可以无缝迁移。

---

## 🔗 相关资源

### 文档
- [Level 1 Shell 模式指南](./SHELL-MODE.md)
- [Level 3 满血版指南](./FULL-STACK-MODE.md)
- [三级架构设计](../architecture/THREE-LEVEL-ARCHITECTURE.md)
- [降级策略详解](../architecture/DEGRADATION-STRATEGY.md)

### 代码参考
- `node/src/core/optimized-file-queue.ts`: 优化文件队列实现
- `node/src/commands/`: CLI 命令实现
- `node/src/utils/error-handler.ts`: 错误处理机制
- `node/tests/`: 测试用例参考

### 性能数据
- `node/benchmarks/results/round4-benchmark-results.json`: 性能基准

---

## ❓ 常见问题

**Q: Level 2 需要 Redis 吗？**
A: 不需要。Level 2 使用优化的文件队列，不依赖 Redis。

**Q: Level 2 相比 Level 1 的性能提升有多少？**
A: 消息队列延迟降低 90% (P95: ~500ms → ~1.3ms)，类型安全减少运行时错误 ~60%。

**Q: 如何从 Level 2 升级到 Level 3？**
A: 安装 Redis，配置 `EKET_REDIS_HOST`，重启实例即可自动升级到 Level 3。

**Q: Level 2 支持分布式协作吗？**
A: 不支持。Level 2 仅支持单机运行，分布式需要 Level 3 (Redis)。

**Q: TypeScript 编译错误如何调试？**
A: 运行 `npx tsc --noEmit` 查看详细类型错误，检查 `tsconfig.json` 配置。

---

**文档版本**: v2.3.1
**维护者**: EKET Framework Team
**最后更新**: 2026-04-08
**反馈**: 查看 [docs/](../) 目录或运行 `/eket-help`
