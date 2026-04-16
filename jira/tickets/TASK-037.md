# TASK-037: Layer 1 — CLAUDE.md 角色分离拆分

**Ticket ID**: TASK-037
**Epic**: RULE-RETENTION
**标题**: 将 CLAUDE.md 拆分为角色摘要 + MASTER-RULES.md + SLAVER-RULES.md
**类型**: task
**优先级**: P1
**重要性**: high

**状态**: ready
**创建时间**: 2026-04-15
**创建者**: Master
**负责人**: 待领取

**依赖关系**:
- blocks: [TASK-038, TASK-039]
- blocked_by: []

**标签**: `docs`, `claude-md`, `layer1`

---

## 1. 需求概述

### 1.1 功能描述

作为 EKET 框架维护者，我需要将主 CLAUDE.md（当前约 400+ 行）拆分为精简摘要 + 角色专属规则文件，以便减少每次 agent session 加载的上下文体积，延缓规则遗忘。

### 1.2 验收标准

- [ ] `CLAUDE.md` 行数 ≤ 100（含项目开发命令等必要内容，纯规则部分 ≤ 40 行）
- [ ] 新建 `template/docs/MASTER-RULES.md`，包含 Master 完整行为规范
- [ ] 新建 `template/docs/SLAVER-RULES.md`，包含 Slaver 完整行为规范
- [ ] `CLAUDE.md` 中有明确的 `@引用` 到 MASTER-RULES.md 和 SLAVER-RULES.md
- [ ] **CLAUDE.md 中注明：处理任何 ticket 前必须先读对应 RULES.md**（而非"按需加载"）
- [ ] 断链检测通过（无引用到不存在的文件）
- [ ] 验收命令：
  ```bash
  wc -l CLAUDE.md  # 期望 ≤ 100
  test -f template/docs/MASTER-RULES.md && test -f template/docs/SLAVER-RULES.md && echo "OK"
  grep -c 'MASTER-RULES\|SLAVER-RULES' CLAUDE.md  # 期望 ≥ 2
  grep -l '禁止伪造测试结果' template/docs/MASTER-RULES.md
  grep -l '分析瘫痪' template/docs/SLAVER-RULES.md
  ```

---

## 2. 技术设计

### 2.1 影响文件

- `CLAUDE.md` — 大幅精简，保留摘要 + 红线 + 引用链
- `template/docs/MASTER-RULES.md` — 新建
- `template/docs/SLAVER-RULES.md` — 新建

### 2.2 CLAUDE.md 保留内容（不可删）

1. 身份确认入口（读 `.eket/IDENTITY.md`）
2. Master/Slaver 一句话定义 + 角色红线（≤10条，每条≤1行）
3. **强制读取声明**：「处理任何 ticket 前必须先读 `template/docs/MASTER-RULES.md`（Master）或 `template/docs/SLAVER-RULES.md`（Slaver）」
4. Inbox P0/P1/P2 分级表
5. 项目简介（3行）
6. Node.js 开发命令（精简版）
7. 代码架构目录表
8. 测试/环境变量（精简版）

### 2.3 下沉到 MASTER-RULES.md

- 心跳检查 4 问（详细版）
- 防幻觉红线（Anti-Hallucination）完整版
- PR Review 强制 checklist
- 4-Level Artifact Verification
- Master Hard Rules（7条）
- Merge 前必完成事项

### 2.4 下沉到 SLAVER-RULES.md

- 心跳检查 4 问（详细版）
- 分析瘫痪检测规则
- Deviation Rules
- Nyquist Rule 详细说明
- Slaver Hard Rules（3条）

### 2.5 断链检测命令

```bash
# 验证所有 @引用路径存在
grep -oE 'template/docs/[A-Z-]+\.md' CLAUDE.md | xargs -I{} test -f {} && echo "no broken links"
```

---

## 4. 执行记录

### 4.1 领取信息
- **领取者**: 待填写
- **领取时间**: 待填写
- **预计工时**: 4h

### 4.2 状态流转

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| 2026-04-15 | backlog → ready | Master | 初始创建，可与 TASK-035 并行 |
