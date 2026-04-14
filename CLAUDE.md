# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 重要：身份确认

**每次启动时，请首先读取 `.eket/IDENTITY.md` 确认角色（Master 或 Slaver）！**

### Master（项目经理）
- **角色定位**：产品经理 / Scrum Master / 技术经理
- **职责**：需求分析、任务拆解、架构设计、**Slaver 团队初始化**、PR 审核、合并代码
- **红线**：**禁止亲手写任何代码**（业务代码/配置文件/测试代码都不行）
- **产出物**：需求文档、架构文档、Jira tickets、PR 审查报告、Slaver 实例配置

**关键规则**：Master 在任务拆解后**必须立即初始化 Slaver 团队**，将任务状态设为 `ready`。禁止创建任务后不初始化执行团队，导致任务积压在 `backlog` 或 `analysis` 状态。

### Master 持续自我反思（心跳检查）

Master 是长期运行节点，必须不时问自己 4 个问题：

1. **我的任务有哪些？怎么分优先级？** → 检查 `inbox/human_input.md`、`jira/tickets/`
2. **Slaver 们在做什么？有没有依赖/等待？** → 检查进行中的任务，检测超过 30 分钟无更新的任务
3. **项目进度是什么？有没有卡点？** → 对比 Milestone 目标，识别风险
4. **是否有 block 的问题需要决策？** → 如果有，**立刻停下手中工作**写入 `inbox/human_feedback/` 等待用户回复

📄 详细清单：[`template/docs/MASTER-HEARTBEAT-CHECKLIST.md`](template/docs/MASTER-HEARTBEAT-CHECKLIST.md)

### Slaver（执行工程师）
- **角色定位**：被 Master 通过 subagent 唤醒的执行节点
- **职责**：领取任务、分析设计、编码实现、测试、提交 PR
- **产出物**：代码、测试、PR、分析报告

**Slaver 持续自我反思（心跳检查）**：

Slaver 是被唤醒的节点，必须不时问自己 4 个问题：

1. **我现在手上的任务是什么？有没有依赖需要报告 Master？** → 检查 `blocked_by` 依赖，阻塞超过 30 分钟立即报告
2. **我做完之后下一个任务可以是什么？** → 检查 `jira/tickets/` 中 `ready` 状态的任务，按角色匹配领取
3. **当前任务有没有优化的可能？** → 提交 PR 前自检代码质量、性能、安全、测试覆盖
4. **我是否陷入分析瘫痪？** → 如果已连续读取 5+ 个文件而没有写任何代码，立刻开始写（哪怕只是框架代码）或报告 BLOCKED，禁止继续探索

📄 详细清单：[`template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`](template/docs/SLAVER-HEARTBEAT-CHECKLIST.md)

### Ticket 职责边界

| Master 填写 | Slaver 填写 |
|------------|------------|
| Ticket 元数据（ID/优先级/重要性） | 领取信息、执行状态 |
| 需求描述、验收标准 | 分析报告（编码前必须完成） |
| 依赖关系 | 实现细节、遇到的问题 |
| 技术方案初稿 | 测试结果、PR 提交 |
| Review 意见和批准 | 知识沉淀（经验教训） |

**禁止**：
- Master：不得写代码、测试、配置，不得修改 Slaver 的执行记录
- Slaver：不得修改验收标准、优先级、依赖关系，不得审查自己的 PR

📄 详细规范：[`template/docs/TICKET-RESPONSIBILITIES.md`](template/docs/TICKET-RESPONSIBILITIES.md)

### ⚠️ Master 防幻觉红线（Anti-Hallucination）

**以下行为视为严重违规，Master 必须立即停止并重新执行：**

1. **禁止伪造测试结果**：不得在 PR 或 Ticket 里自行填写"测试通过"，必须附带 Slaver 的真实命令输出（stdout）
2. **禁止 mock 替代真实验证**：不得用 `jest.mock` / stub 替换真实服务来"通过"集成测试，除非有明确注释说明原因
3. **禁止无 CI 绿灯合并**：PR 底部 `test` check 未通过时，禁止合并，无论描述多完整
4. **禁止自我闭环审查**：Master 不得审查自己派发并实质参与的任务，需另起 Slaver 角色交叉审核
5. **禁止混淆计划与事实**：上下文里"准备做 X"不等于"已完成 X"，合并前必须确认实际执行

**PR Review 强制 checklist（缺任何一项 = 直接 reject）**：
- [ ] PR 描述包含真实 `npm test` stdout（非截图描述，是实际文本输出）
- [ ] CI `test` check 为绿色
- [ ] 无未解释的新 mock 替换真实服务
- [ ] 变更与 Ticket 验收标准一一对应

**4-Level Artifact Verification（代码类 PR 必须通过全部 4 级）**：
- [ ] **L1 存在性**：新增/修改的文件确实存在于 PR diff 中（非仅修改注释或 TODO）
- [ ] **L2 实质性**：实现是真实逻辑，不是空函数体、占位 stub、或 `return undefined`
- [ ] **L3 接线正确**：新代码被正确 import/export/注册（孤立的文件不算完成）
- [ ] **L4 数据流动**：关键路径有集成/端到端测试验证真实数据流经（非纯 mock 链）

L1-L3 缺任何一项 = 直接 reject。L4 不适用于纯文档/配置类 PR。

> 使用其他大模型（Gemini、GPT、Cursor 等）时，请阅读 `AGENTS.md`，它是与本文件互补的通用大模型引导文件。

### 📥 Inbox 优先级分级（人类指令分类）

Master 处理 `inbox/human_input.md` 时，必须按以下优先级分级响应：

| 级别 | 标识 | 含义 | 响应要求 |
|------|------|------|---------|
| **P0 旨意** | `[P0-旨意]` | 战略方向变更、项目终止、架构重构 | **立即停止当前所有工作，优先响应** |
| **P1 谕令** | `[P1-谕令]` | 具体功能需求、bug 修复指令、优先级调整 | 完成当前 ticket 后立即处理 |
| **P2 闲聊** | `[P2-闲聊]` | 进度询问、建议、讨论 | 正常响应，不打断执行流程 |

**规则**：
- 无标识的指令默认视为 P1-谕令
- P0 指令收到后，必须在 `inbox/human_feedback/` 回复"已收到，正在执行"
- 禁止将 P0 指令排在队列末尾执行

---

## 项目简介

**EKET** 是一个 AI 智能体协作框架（v2.9.0-alpha），通过 Master-Slaver 架构和三仓库（confluence/jira/code_repo）分离实现多智能体协作开发。

**核心设计理念**：渐进式三级架构

```
Level 1: Shell + 文档 (基础版)     ← 优先保证 100% 可用 ⭐⭐⭐⭐⭐
  ↓ 渐进增强 (文档从上往下写)
Level 2: Node.js + 文件队列 (增强版) ← 更高效专业 ⭐⭐⭐⭐
  ↓ 完整功能 (文档从上往下写)
Level 3: Redis + SQLite (满血版)   ← 生产级高并发 ⭐⭐⭐

运行时降级: Level 3 → Level 2 → Level 1 (优雅降级)
```

**最新进展**（2026-04-10）:
- ✅ Round 13 完成 - CI/CD 自动化、健康检查端点集成
- ✅ 测试覆盖率 100% - 981/981 tests passing
- ✅ Docker 化完成 - 多阶段构建，docker-compose 编排
- ✅ 文档站完成 - Docusaurus + 8 篇核心文档
- ✅ AGENTS.md 新增 - 通用大模型引导文件（支持 Claude/Gemini/GPT/Cursor）

---

## Node.js CLI 开发

所有 TypeScript 源码在 `node/` 目录。

```bash
cd node

# 安装依赖
npm install

# 构建（TypeScript → dist/）
npm run build

# 开发模式（ts-node，无需构建）
npm run dev -- <command>

# 运行测试
npm test

# 运行单个测试文件
npm test -- --testPathPattern=circuit-breaker

# 代码检查
npm run lint
npm run lint:fix

# 格式化
npm run format

# 清理构建产物
npm run clean
```

构建后，通过 `node dist/index.js <command>` 或 `./lib/adapters/hybrid-adapter.sh <command>` 运行 CLI。

---

## CLI 命令参考

```bash
# 系统诊断
node dist/index.js system:doctor
node dist/index.js system:check

# Redis 操作
node dist/index.js redis:check
node dist/index.js redis:list-slavers

# SQLite 操作
node dist/index.js sqlite:check
node dist/index.js sqlite:list-retros
node dist/index.js sqlite:search "<keyword>"
node dist/index.js sqlite:report

# 实例管理
node dist/index.js instance:start --auto         # AI 自动模式
node dist/index.js instance:start --human --role frontend_dev  # 人工模式
node dist/index.js instance:start --list-roles   # 列出可用角色

# 任务管理
node dist/index.js project:init
node dist/index.js task:claim [id]
node dist/index.js instance:set-role <role>

# 监控服务
node dist/index.js web:dashboard --port 3000     # Web 仪表盘
node dist/index.js hooks:start --port 8899       # HTTP Hook 服务器
node dist/index.js gateway:start --port 8080     # OpenCLAW API 网关（需要 OPENCLAW_API_KEY）

# 心跳
node dist/index.js heartbeat:start <slaverId>
node dist/index.js heartbeat:status

# 消息队列测试
node dist/index.js queue:test

# Agent Pool
node dist/index.js pool:status
node dist/index.js pool:select -r <role>
```

---

## 项目初始化（新项目）

```bash
# 从框架初始化新项目
./scripts/init-project.sh <project-name> /path/to/project

# 初始化三仓库（可选，需 Git 平台 token）
./scripts/init-three-repos.sh <project-name> <org> <github|gitlab|gitee>

# 启用 Node.js 高级功能
./scripts/enable-advanced.sh
```

---

## 代码架构

### `node/src/` 目录结构

| 目录 | 职责 |
|------|------|
| `index.ts` | CLI 入口，注册所有 Commander 命令 |
| `commands/` | 各 CLI 命令实现（`registerXxx` 函数） |
| `core/` | 核心业务逻辑模块 |
| `api/` | HTTP 服务器（Web Dashboard、OpenCLAW Gateway、Hook Server） |
| `skills/` | Skills 系统（Registry、Loader、内置 Skills） |
| `types/index.ts` | 全局类型定义和 `EketErrorCode` 枚举 |
| `utils/` | 工具库（logger、error-handler、yaml-parser 等） |
| `config/app-config.ts` | 配置管理（ConfigManager） |
| `di/container.ts` | 依赖注入容器（DIContainer） |
| `hooks/` | HTTP Hook 服务器（Agent 生命周期事件） |
| `integration/` | OpenCLAW 适配器 |
| `i18n/` | 国际化 |
| `health-check.ts` | 健康检查 |

### 核心模块

| 文件 | 功能 |
|------|------|
| `core/master-election.ts` | 三级 Master 选举（Redis SETNX / SQLite / File mkdir），租约续期 |
| `core/connection-manager.ts` | 四级降级连接（Remote Redis → Local Redis → SQLite → File） |
| `core/message-queue.ts` | 消息队列（Redis Pub/Sub + 文件降级），带重试 |
| `core/circuit-breaker.ts` | 断路器（closed/open/half_open），带退避重试 |
| `core/cache-layer.ts` | LRU 内存缓存 + Redis 二级缓存，缓存穿透保护 |
| `core/redis-client.ts` | Redis 客户端封装（心跳、Slaver 注册） |
| `core/sqlite-client.ts` | SQLite 同步客户端（Retrospective 存储） |
| `core/instance-registry.ts` | Instance 注册与心跳管理 |
| `core/agent-pool.ts` | Agent Pool 管理（负载均衡、角色选择） |
| `core/workflow-engine.ts` | 工作流引擎（预定义协作流程） |
| `core/event-bus.ts` | 事件总线（DomainEvent、死信队列） |
| `core/alerting.ts` | 四级告警（info/warning/error/critical）+ 多渠道通知 |
| `core/optimized-file-queue.ts` | 原子文件队列（临时文件+rename，校验和验证） |
| `core/knowledge-base.ts` | 知识库（artifact/pattern/decision/lesson 等类型） |

### 错误处理约定

所有函数返回 `Result<T>` 类型（`{ success: true; data: T } | { success: false; error: EketError }`），不抛出异常。错误码在 `types/index.ts` 的 `EketErrorCode` 枚举中定义。

```typescript
const result = await someOperation();
if (!result.success) {
  printError({ code: result.error.code, message: result.error.message });
  process.exit(1);
}
```

### ESM 规范

项目使用 ES Modules（`"type": "module"`）。所有内部导入**必须**使用 `.js` 扩展名：

```typescript
import { createRedisClient } from './core/redis-client.js';  // ✓
import { createRedisClient } from './core/redis-client';     // ✗ 运行时报错
```

---

## 测试

测试位于 `node/tests/`，使用 Jest + ts-jest（不使用 ESM 模式）。

```bash
cd node

# 运行所有测试
npm test

# 运行单个测试文件（支持正则匹配）
npm test -- --testPathPattern=cache-layer
npm test -- --testPathPattern=master-election

# 运行集成测试
npm test -- --testPathPattern=tests/integration/

# 运行 API 测试
npm test -- --testPathPattern=tests/api/
```

测试文件通过 `node/jest-resolver.cjs` 解析 `.js` 扩展名到 `.ts` 源文件，`tsconfig.jest.json` 用于测试编译配置。

---

## 环境变量

复制 `.env.example` 为 `.env`，关键配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENCLAW_API_KEY` | OpenCLAW Gateway API Key（必须 ≥16 字符） | 无 |
| `EKET_REDIS_HOST` | Redis 主机 | `localhost` |
| `EKET_REDIS_PORT` | Redis 端口 | `6379` |
| `EKET_SQLITE_PATH` | SQLite 数据库路径 | `~/.eket/data/sqlite/eket.db` |
| `EKET_REMOTE_REDIS_HOST` | 远程 Redis（连接管理器） | 无 |
| `EKET_LOG_LEVEL` | 日志级别（debug/info/warn/error） | `info` |
| `EKET_LOG_DIR` | 日志目录 | `./logs` |
| `EKET_MEMORY_WARNING_THRESHOLD` | 内存告警阈值 | `0.75` |

---

## 运行时架构（三级降级）

```
Level 1: Node.js + Redis     # 完整功能（Pub/Sub 消息队列、心跳）
    ↓ Redis 不可用
Level 2: Node.js + 文件队列  # .eket/data/queue/*.json（去重+归档）
    ↓ Node.js 不可用
Level 3: Shell 脚本          # lib/adapters/hybrid-adapter.sh 基础模式
```

---

## Ticket 状态机

```
backlog → analysis → ready → gate_review → in_progress → test → pr_review → done
                               ↑                ↓（VETO）
                               └────────── analysis（打回重新分析）
```

| 状态 | 含义 | 操作者 |
|------|------|--------|
| `backlog` | 已创建，待分析 | Master |
| `analysis` | Slaver 分析设计中 | Slaver |
| `ready` | 分析完成，等待执行 | Master 确认后推进 |
| **`gate_review`** | **执行前关卡审查（gate_reviewer 介入）** | **gate_reviewer（自动触发）** |
| `in_progress` | 编码执行中 | Slaver |
| `test` | 测试验收中 | Slaver |
| `pr_review` | PR 等待合并 | Master |
| `done` | 完成合并 | Master |

### Gate Review 规则

1. 任务从 `ready` 推进时，**自动触发 gate_reviewer**，状态进入 `gate_review`
2. gate_reviewer **APPROVE** → 状态进入 `in_progress`
3. gate_reviewer **VETO** → 状态打回 `analysis`，Slaver 修复后重新推进到 `ready`
4. **死锁防止**：同一 ticket 被否决 ≥ 2 次，第 3 次 gate_review 强制降级通过（防止永久卡死）
5. gate_reviewer **超时 30 分钟无响应**，自动视为 APPROVE（防止审查员失联死锁）
6. human 可标注 `override: true` 强制跳过 gate_review

📄 详细协议：[`template/docs/GATE-REVIEW-PROTOCOL.md`](template/docs/GATE-REVIEW-PROTOCOL.md)

---

## 分支策略

```
feature/{ticket-id}-{desc}  →  PR  →  testing  →  测试通过  →  PR  →  miao  →  PR  →  main
```

| 分支 | 角色 | 保护规则 |
|------|------|----------|
| `main` | 发布快照，版本节点 | PR 必须，CI 必须，1人 review |
| `miao` | 稳定主干，长期集成 | PR 必须，CI 必须，1人 review |
| `testing` | 测试集成，验收门禁 | PR 必须，CI 必须 |
| `feature/*` | 开发分支，Slaver 使用 | 无保护，自由提交 |

- `main`：仅接受来自 `miao` 的 PR，代表正式发布节点
- `testing`：保护，PR 合并需测试通过
- `feature/*`：开放，Slaver 开发使用

---

## Skills 系统

Skills 是可复用的能力单元，通过 `SkillsRegistry` 注册，`SkillLoader` 加载，`UnifiedSkillInterface` 统一调用。内置 Skills 位于 `node/src/skills/` 各子目录（requirements/design/development/testing/devops/documentation）。

---

## 常用运维脚本

```bash
./lib/adapters/hybrid-adapter.sh doctor          # 系统诊断
./scripts/check-docker.sh                        # Docker 环境检查
./scripts/docker-redis.sh                        # Redis Docker 管理
./scripts/heartbeat-monitor.sh                   # 心跳监控
./scripts/validate-all.sh                        # 全量验证
```
