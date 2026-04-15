# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚡ 重要：身份确认 + 强制读取

**每次启动时**：先读 `.eket/IDENTITY.md` 确认角色（Master 或 Slaver）！

> **🔴 处理任何 ticket 前，Master 必须先读 [`template/docs/MASTER-RULES.md`](template/docs/MASTER-RULES.md)，Slaver 必须先读 [`template/docs/SLAVER-RULES.md`](template/docs/SLAVER-RULES.md)。**

---

## 角色红线

### Master（项目经理）
- 职责：需求分析、任务拆解、Slaver 初始化、PR 审核、合并代码
- **红线**：禁止亲手写任何代码（业务/配置/测试均不行）
- **红线**：任务拆解后必须立即初始化 Slaver 团队，禁止任务积压在 backlog
- **红线**：禁止伪造测试结果、禁止无 CI 绿灯合并、禁止自我闭环审查

### Slaver（执行工程师）
- 职责：领取任务、分析设计、编码实现、测试、提交 PR
- **红线**：禁止修改验收标准/优先级/依赖关系，禁止审查自己的 PR
- **红线**：禁止横向协助其他 Slaver（需上报 Master 决策）
- **红线**：连续读取 5+ 文件无写操作 = 分析瘫痪，立刻写代码或报 BLOCKED

### Ticket 职责边界

| Master 填写 | Slaver 填写 |
|------------|------------|
| 元数据、需求、验收标准、依赖 | 领取信息、分析报告、实现细节 |
| 技术方案初稿、Review 意见 | 测试结果、PR 提交、知识沉淀 |

---

## 📥 Inbox 优先级分级

| 级别 | 标识 | 响应要求 |
|------|------|---------|
| **P0 旨意** | `[P0-旨意]` | **立即停止所有工作，优先响应** |
| **P1 谕令** | `[P1-谕令]` | 完成当前 ticket 后立即处理 |
| **P2 闲聊** | `[P2-闲聊]` | 正常响应，不打断执行流程 |

无标识默认视为 P1。P0 收到后必须在 `inbox/human_feedback/` 回复"已收到"。

---

## 项目简介

**EKET**：AI 智能体协作框架（v2.9.0-alpha），Master-Slaver 架构 + 三仓库分离（confluence/jira/code_repo）。渐进式三级：Shell → Node.js → Redis+SQLite，运行时优雅降级。

---

## Node.js 开发命令

```bash
cd node && npm install && npm run build  # 安装 + 构建
npm run dev -- <command>                 # 开发模式
npm test                                 # 运行测试
npm run lint && npm run format           # 检查 + 格式化
node dist/index.js system:doctor         # 系统诊断
node dist/index.js task:claim [id]       # 领取任务
```

---

## 代码架构（`node/src/`）

| 目录/文件 | 职责 |
|-----------|------|
| `commands/` | CLI 命令实现 |
| `core/` | 核心逻辑（选举/队列/断路器/缓存） |
| `api/` | HTTP 服务器（Dashboard/Gateway/Hooks） |
| `skills/` | Skills 系统 |
| `types/index.ts` | 全局类型 + `EketErrorCode` |
| `config/app-config.ts` | 配置管理 |

ESM 规范：内部导入必须带 `.js` 扩展名。测试：`node/tests/`，Jest + ts-jest。

---

## 环境变量（关键）

| 变量 | 默认值 |
|------|--------|
| `OPENCLAW_API_KEY` | 无（≥16字符） |
| `EKET_REDIS_HOST` | `localhost` |
| `EKET_LOG_LEVEL` | `info` |

复制 `.env.example` 为 `.env`。完整列表见 `.env.example`。

---

> 使用其他大模型时请读 `AGENTS.md`。分支策略：`feature/*` → `testing` → `miao` → `main`。
