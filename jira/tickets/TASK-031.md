# TASK-031: settings.json 权限强制 — Master 禁止写代码的物理级约束

**Ticket ID**: TASK-031
**标题**: 将 CLAUDE.md 中的"禁止"软规则迁移到 settings.json 权限系统强制执行
**类型**: improvement
**优先级**: P1

**状态**: pr_review
**创建时间**: 2026-04-15
**最后更新**: 2026-04-15
**started_at**: 2026-04-15T00:00:00+08:00
**completed_at**: 2026-04-15T01:00:00+08:00

**负责人**: slaver-devops
**Slaver**: slaver-devops

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master | 2026-04-15 | backlog → ready |
| 领取 | slaver-devops | 2026-04-15 | ready → in_progress |
| 完成 | slaver-devops | 2026-04-15 | in_progress → pr_review |

---

## 1. 任务描述

### 背景

来自 claude-code-best-practice 的关键洞见（Boris Cherny，Claude Code 创始人）：

> **用 `settings.json` 强制执行确定性行为，而不是在 CLAUDE.md 中写"NEVER do X"。CLAUDE.md 是建议，settings.json 是执行。**

当前 EKET 的 CLAUDE.md 中有大量"禁止 Master 写代码"等规则，但这些是软约束，Claude 可能在上下文压力下忽略它们。

### 问题对比

```markdown
# ❌ CLAUDE.md 软约束（不可靠）
**红线**：**禁止亲手写任何代码**

# ✅ settings.json 硬约束（物理级强制）
{
  "permissions": {
    "deny": ["Edit(node/**)", "Write(node/**)"]
  }
}
```

### 改动范围

**Part A — `template/.claude/settings.master.json`（新建）**

Master 实例专用的 settings.json 权限配置：

```json
{
  "permissions": {
    "allow": [
      "Read(*)",
      "Edit(jira/**)",
      "Edit(confluence/**)",
      "Write(jira/**)",
      "Write(confluence/**)",
      "Edit(inbox/**)",
      "Write(inbox/**)",
      "Bash(git log*)",
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git fetch*)",
      "Bash(gh pr*)",
      "Bash(gh issue*)",
      "Bash(node dist/index.js gate:review*)",
      "Bash(node dist/index.js task:*)",
      "Bash(node dist/index.js system:*)"
    ],
    "ask": [
      "Bash(git merge*)",
      "Bash(git push*)",
      "Edit(template/**)",
      "Edit(scripts/**)"
    ],
    "deny": [
      "Edit(node/src/**)",
      "Edit(node/tests/**)",
      "Write(node/src/**)",
      "Write(node/tests/**)",
      "Edit(node/package.json)",
      "Bash(npm install*)",
      "Bash(npm run build*)"
    ]
  }
}
```

**Part B — `template/.claude/settings.slaver.json`（新建）**

Slaver 实例专用的 settings.json 权限配置：

```json
{
  "permissions": {
    "allow": [
      "Read(*)",
      "Edit(*)",
      "Write(*)",
      "Bash(git add*)",
      "Bash(git commit*)",
      "Bash(git checkout*)",
      "Bash(git push origin feature/*)",
      "Bash(npm*)",
      "Bash(node*)"
    ],
    "ask": [
      "Bash(git push origin main*)",
      "Bash(git push origin miao*)",
      "Bash(git push origin testing*)",
      "Bash(git reset --hard*)",
      "Bash(rm -rf*)"
    ],
    "deny": [
      "Bash(git push --force origin main*)",
      "Bash(git push --force origin miao*)",
      "Edit(jira/tickets/**)"
    ]
  }
}
```

**Part C — `template/docs/SETTINGS-PERMISSIONS.md`（新建）**

说明 settings.json 权限系统：
- allow/ask/deny 三级语义
- Master vs Slaver 权限边界设计原则
- 常见权限模式参考

**Part D — `scripts/init-project.sh` 更新**

在初始化流程中，根据角色自动安装对应 settings：
```bash
# 初始化 Master 时
cp template/.claude/settings.master.json .claude/settings.json
# 初始化 Slaver 时  
cp template/.claude/settings.slaver.json .claude/settings.json
```

---

## 2. 验收标准

- [x] `template/.claude/settings.master.json` 存在，包含 `deny` 节且覆盖 `node/src/**`；验证：`jq '.permissions.deny' template/.claude/settings.master.json | grep -c "node/src"`
- [x] `template/.claude/settings.slaver.json` 存在，包含 `deny` 节且覆盖 `git push --force origin main`；验证：`jq '.permissions.deny' template/.claude/settings.slaver.json | grep -c "force"`
- [x] `template/docs/SETTINGS-PERMISSIONS.md` 存在，包含 allow/ask/deny 三级说明；验证：`grep -c "allow\|ask\|deny" template/docs/SETTINGS-PERMISSIONS.md`（应 ≥ 3）
- [x] `scripts/init-project.sh` 包含 settings 安装逻辑；验证：`grep -c "settings.master\|settings.slaver" scripts/init-project.sh`（应 ≥ 1）
- [x] `npm test` 全量通过；验证：`cd node && npm test 2>&1 | tail -3`

---

## 3. 技术方案

纯配置/文档/Shell 改动，无 TypeScript 变更。

1. 参考 claude-code-best-practice 的权限模式，设计 Master/Slaver 两份 settings
2. 新建两个 JSON 文件
3. 新建 SETTINGS-PERMISSIONS.md 文档
4. 更新 init-project.sh，在角色初始化时安装对应 settings

---

## 4. 影响范围

- `template/.claude/settings.master.json` — 新建
- `template/.claude/settings.slaver.json` — 新建
- `template/docs/SETTINGS-PERMISSIONS.md` — 新建
- `scripts/init-project.sh` — 新增 settings 安装逻辑

---

## 5. blocked_by

无依赖，可立即执行。与 TASK-030/033/034 完全并行。
