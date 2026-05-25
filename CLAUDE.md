# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚡ 身份确认

**每次启动时**：先读 `.eket/IDENTITY.md` 确认角色（Master 或 Slaver）

- **Master**: 读 `template/docs/MASTER-RULES.md`
- **Slaver**: 读 `template/docs/SLAVER-RULES.md`
- **新需求/架构变更**: 读 `template/docs/EXPERT-PANEL-PLAYBOOK.md` 召唤专家组

## 关键路径

**Master 工作流**:
- 新需求 → EXPERT-PANEL-PLAYBOOK → 专家组评审 → 拆 ticket → 初始化 Slaver
- PR 审核 → 合并 → 三分支同步（feature → testing → main → miao）
- EPIC 完成 → Post-Process（回归 + 经验沉淀 + 技术债登记）

**Slaver 工作流**:
- 领取 ticket → 分析设计 → 实现 + 测试 → 提交 PR
- Review 修改 → 复盘（ticket + memory 沉淀）

**分支红线**: 所有改动必须在 `feature/*` 分支，禁止直接向主分支提交

## 项目简介

**EKET v2.9.0-alpha**: Master-Slaver 协作框架，三仓库分离（confluence/jira/code_repo），渐进式三级技术栈（Shell → Node.js → Redis+SQLite）

**核心目录**:
- `node/src/` - ESM 模块
- `jira/tickets/` - 任务卡片
- `confluence/memory/` - 知识库

**开发命令**:
```bash
# 根目录（workspaces 聚合）
npm install                              # 安装所有依赖
npm test                                 # 运行所有测试
npm run lint                             # 运行所有 lint
npm run build                            # 构建所有包

# node 子包（传统方式）
cd node && npm install && npm run build  # 构建
eket task:claim [id]                     # 领取任务
eket knowledge:search "<关键词>"          # 检索经验
```

**环境变量**: 复制 `.env.example` 为 `.env`，设置 `OPENCLAW_API_KEY`（≥16 字符）

## Git 操作

**分支同步**: 使用 `bash scripts/sync-branches.sh`，或手动按顺序：checkpoint → testing → main → miao

**SSH 失败降级**: 自动切换 HTTPS：`git push https://github.com/godlockin/eket.git <branch>`

## 测试

**Rust 测试**: 必须从 `rust/` 目录执行：`cd rust && cargo test`

**新测试验证**: 先单独运行新测试 `npm test -- --testPathPattern=<pattern>`，通过后再跑全量

---

> 详细规则见对应 RULES.md，分支策略见 `confluence/memory/branch-strategy-guide.md`  
> 使用其他大模型时读 `AGENTS.md`
