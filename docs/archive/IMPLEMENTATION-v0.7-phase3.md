# EKET v0.7 Phase 3 实施文档

**版本**: 0.7.0
**日期**: 2026-03-25
**阶段**: Phase 3 - 高级功能实现

---

## 概述

Phase 3 完成了 EKET 框架的高级功能，包括：
1. PR 提交命令（支持 GitHub/GitLab/Gitee）
2. 三仓库自动克隆（从配置文件读取）
3. 文件队列持久化增强（去重、过期、归档）

---

## 新增模块

### 1. PR 提交命令 (`node/src/commands/submit-pr.ts`)

**功能**:
- 自动检测当前分支和目标分支
- 推送分支到远程仓库
- 创建 PR/MR（支持 GitHub/GitLab/Gitee）
- 添加 Reviewers（仅 GitHub）
- 启用自动合并（仅 GitHub）
- 发送 PR 通知到消息队列

**使用方式**:
```bash
# 基础用法
node node/dist/index.js submit-pr

# 指定 PR 标题和描述
node node/dist/index.js submit-pr -t "feat: 用户登录" -d "实现 OAuth 2.0 登录功能"

# 添加 Reviewers
node node/dist/index.js submit-pr -r "alice,bob"

# 创建 Draft PR
node node/dist/index.js submit-pr --draft

# 启用自动合并
node node/dist/index.js submit-pr --auto-merge
```

**配置**:
PR 配置从 `.eket/config/config.yml` 自动读取：
```yaml
repositories:
  code_repo:
    url: "https://github.com/org/project.git"
    token: "ghp_xxx"  # API Token
```

**平台检测**:
自动从仓库 URL 检测平台：
- `github.com` → GitHub
- `gitlab.com` → GitLab
- `gitee.com` → Gitee

**PR 描述模板**:
```markdown
## 变更说明

{commit message}

## 相关 Ticket

-{ticket-id}

## 测试

- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 手动测试完成

## 检查清单

- [ ] 代码符合项目规范
- [ ] 已添加必要的注释
- [ ] 已更新相关文档
```

---

### 2. 三仓库自动克隆 (`scripts/init-three-repos.sh`)

**增强功能**:
- 从 `.eket/config/config.yml` 读取配置
- 自动解析 YAML 配置
- 支持多平台（GitHub/GitLab/Gitee）
- 自动配置 Git submodule

**使用方式**:
```bash
# 在运行 init-wizard 后执行
./scripts/init-three-repos.sh
```

**配置文件格式**:
```yaml
project:
  name: "my-project"
  organization: "my-org"

repositories:
  confluence:
    url: "https://github.com/org/project-confluence.git"
    branch: "main"
  jira:
    url: "https://github.com/org/project-jira.git"
    branch: "main"
  code_repo:
    url: "https://github.com/org/project-code.git"
    branch: "main"
```

**脚本功能**:
1. 读取配置文件
2. 解析 Confluence/Jira/CodeRepo URL
3. 初始化三仓库目录结构
4. 配置 Git submodule
5. 配置远程仓库

---

### 3. 文件队列持久化 (`node/src/core/file-queue-manager.ts`)

**功能**:
- 消息去重（基于 `processed.json`）
- 过期消息清理（默认 24 小时）
- 自动归档（默认 1 小时后）
- 定期清理（默认每小时）
- 历史导出

**架构**:
```
┌─────────────────────────────────────────────────────────┐
│              FileQueueManager                            │
├─────────────────────────────────────────────────────────┤
│  processedIds: Set<string>                              │
│  - 去重检查                                              │
│  - 每 100 条保存一次                                      │
│                                                         │
│  cleanupExpired()                                       │
│  - 删除 > maxAge (24h)                                  │
│  - 归档 > archiveAfter (1h)                             │
│                                                         │
│  archiveMessage()                                       │
│  - 移动到 queue-archive/                                │
│  - 保留历史记录                                          │
└─────────────────────────────────────────────────────────┘
```

**使用方式**:
```typescript
import { createFileQueueManager } from './core/file-queue-manager.js';

// 创建队列管理器
const queue = createFileQueueManager({
  queueDir: './data/queue',
  archiveDir: './data/queue-archive',
  maxAge: 24 * 60 * 60 * 1000,      // 24 小时
  archiveAfter: 60 * 60 * 1000,     // 1 小时
});

// 启动定期清理
queue.startCleanup(60 * 60 * 1000);  // 每小时清理

// 处理队列
const count = await queue.processQueue(async (message) => {
  console.log('处理消息:', message);
});

// 导出历史
const history = queue.exportHistory({
  startDate: new Date('2026-01-01'),
  endDate: new Date(),
  channel: 'task_updates',
});
```

**去重机制**:
```typescript
// 去重检查
if (this.isProcessed(message.id)) {
  console.log(`[FileQueue] 跳过已处理消息：${message.id}`);
  return null;
}

// 标记已处理
markProcessed(messageId: string): void {
  this.processedIds.add(messageId);
  // 每 100 条保存一次
  if (this.processedIds.size % 100 === 0) {
    this.saveProcessedIds();
  }
}
```

**归档策略**:
```typescript
cleanupExpired(): number {
  const age = now - enqueueTime;

  if (age > this.config.maxAge) {
    // 删除过期消息
    fs.unlinkSync(filepath);
    cleanedCount++;
  } else if (age > this.config.archiveAfter) {
    // 归档消息
    this.archiveMessage(filepath);
  }
}
```

---

## Phase 3 完成清单

| 功能 | 状态 | 文件 |
|------|------|------|
| PR 提交命令 | ✅ | `node/src/commands/submit-pr.ts` |
| 三仓库克隆 | ✅ | `scripts/init-three-repos.sh` |
| 文件队列 | ✅ | `node/src/core/file-queue-manager.ts` |
| 消息去重 | ✅ | FileQueueManager.processedIds |
| 过期清理 | ✅ | FileQueueManager.cleanupExpired() |
| 自动归档 | ✅ | FileQueueManager.archiveMessage() |

---

## CLI 命令总览

### Phase 1 + 2 + 3 完整命令列表

| 命令 | 功能 | 阶段 |
|------|------|------|
| `init` | 项目初始化向导 | Phase 2 |
| `redis:check` | 检查 Redis 连接 | Phase 1 |
| `redis:list-slavers` | 列出活跃 Slaver | Phase 1 |
| `sqlite:check` | 检查 SQLite 数据库 | Phase 1 |
| `sqlite:list-retros` | 列出 Retrospective | Phase 1 |
| `sqlite:search <kw>` | 搜索 Retrospective | Phase 1 |
| `sqlite:report` | 生成统计报告 | Phase 1 |
| `heartbeat:start <id>` | 启动心跳 | Phase 2 |
| `heartbeat:status` | 查看心跳状态 | Phase 2 |
| `mq:test` | 测试消息队列 | Phase 2 |
| `claim [id]` | 领取任务 | Phase 2 |
| `submit-pr` | 提交 PR | Phase 3 |

---

## 目录结构（完整版）

```
eket/
├── node/
│   ├── src/
│   │   ├── index.ts                      # CLI 入口
│   │   ├── types/
│   │   │   └── index.ts                  # 类型定义
│   │   ├── core/
│   │   │   ├── redis-client.ts           # Redis 客户端
│   │   │   ├── sqlite-client.ts          # SQLite 客户端
│   │   │   ├── message-queue.ts          # 消息队列
│   │   │   ├── heartbeat-monitor.ts      # 心跳监控
│   │   │   └── file-queue-manager.ts     # 文件队列 (Phase 3)
│   │   ├── commands/
│   │   │   ├── claim.ts                  # 任务领取
│   │   │   ├── claim-helpers.ts          # claim 辅助
│   │   │   ├── init-wizard.ts            # 初始化向导
│   │   │   └── submit-pr.ts              # PR 提交 (Phase 3)
│   │   └── utils/
│   │       ├── execFileNoThrow.ts        # 安全执行
│   │       └── process-cleanup.ts        # 进程清理
│   ├── package.json
│   └── tsconfig.json
├── scripts/
│   ├── init-project.sh                   # 项目初始化
│   ├── init-three-repos.sh               # 三仓库初始化 (Phase 3 增强)
│   ├── enable-advanced.sh                # 启用高级功能
│   └── ...
├── lib/adapters/
│   └── hybrid-adapter.sh                 # 混合适配器
└── docs/
    ├── IMPLEMENTATION-v0.7-phase2.md     # Phase 2 文档
    ├── IMPLEMENTATION-v0.7-phase3.md     # Phase 3 文档 (本文件)
    └── v0.7-upgrade-guide.md             # 升级指南
```

---

## 配置示例

### 完整配置文件

```yaml
# .eket/config/config.yml
project:
  name: "search-engine"
  organization: "acme-corp"

repositories:
  confluence:
    url: "https://github.com/acme-corp/searcher-confluence.git"
    branch: "main"
    username: "chenchen"
    token: "ghp_xxx"
  jira:
    url: "https://github.com/acme-corp/searcher-jira.git"
    branch: "main"
    username: "chenchen"
    token: "ghp_xxx"
  code_repo:
    url: "https://github.com/acme-corp/searcher.git"
    branch: "main"
    username: "chenchen"
    token: "ghp_xxx"

redis:
  enabled: true
  host: "localhost"
  port: 6379
  password: "redis-password"
  db: 0

sqlite:
  enabled: true
  path: "./.eket/data/sqlite/eket.db"
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EKET_REDIS_HOST` | Redis 主机 | `localhost` |
| `EKET_REDIS_PORT` | Redis 端口 | `6379` |
| `EKET_REDIS_PASSWORD` | Redis 密码 | - |

---

## 降级策略

### 完整降级流程

```
Phase 3 完整降级:

1. 消息队列
   Redis 可用 → Redis Pub/Sub
       ↓ (不可用)
   文件队列 → .eket/data/queue/*.json
       ↓ (轮询处理)
   带去重/过期/归档的持久化队列

2. 心跳监控
   Redis 可用 → Redis Hash (slaver:{id}:heartbeat)
       ↓ (不可用)
   文件心跳 → .eket/state/heartbeats/*.json

3. PR 提交
   API Token 配置 → 自动创建 PR
       ↓ (未配置)
   本地文件通知 → .eket/data/queue/pr_*.json
```

---

## 测试建议

### 端到端测试场景

```bash
# 1. 测试初始化向导
node node/dist/index.js init

# 2. 测试三仓库克隆
./scripts/init-three-repos.sh

# 3. 测试心跳监控
node node/dist/index.js heartbeat:start slaver_test_001

# 4. 测试消息队列
node node/dist/index.js mq:test

# 5. 测试任务领取
node node/dist/index.js claim --auto

# 6. 测试 PR 提交（需配置 token）
node node/dist/index.js submit-pr --draft
```

---

## 下一步 (Phase 4 - 可选)

- [ ] 完整的 E2E 测试套件
- [ ] Docker Compose 一键部署
- [ ] Web UI 监控面板
- [ ] 更多消息类型支持
- [ ] 任务依赖分析
- [ ] 智能任务推荐

---

**维护者**: EKET Framework Team
**最后更新**: 2026-03-25
