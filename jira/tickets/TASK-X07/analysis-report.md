# 任务分析报告：TASK-X07

**Slaver**: Slaver-013 (DevOps Agent)  
**分析时间**: 2026-05-14 10:00  
**预计工时**: 4h

---

## 1. 需求理解

实现 `eket checkpoint:gc` 命令清理过期 checkpoint 分支，防止 git 仓库膨胀。

**核心目标**:
- AC-1: 检测 + 列出可清理分支 (--dry-run)
- AC-2: 执行删除 (--execute)
- AC-3: 保护未合并 PR 分支
- AC-4: 支持自定义阈值 (--older-than)

**清理规则**:
```typescript
✅ Task done AND branch > 7d → 可删除
✅ Task cancelled AND branch > 3d → 可删除
✅ Stale (> 30d, no activity) → 可删除
⚠️ PR exists AND not merged → 保护
```

---

## 2. 技术方案

### 2.1 命令结构

```typescript
// node/src/commands/checkpoint-gc.ts
registerCheckpointGC(program: Command)
  ├── scanCheckpointBranches() → CheckpointBranch[]
  │   ├── git ls-remote --heads origin checkpoint/*
  │   ├── git log origin/<branch> --format=%aI -1 (获取最后更新时间)
  │   └── isEligibleForDeletion()
  │       ├── 检查 age < olderThanMs → skip
  │       ├── 读取 jira/tickets/<id>/<id>.md 获取 status
  │       ├── 应用清理规则
  │       └── checkPRStatus() via gh CLI
  ├── printGCReport()
  └── deleteCheckpointBranches() (if --execute)
```

### 2.2 关键依赖

| 依赖 | 用途 | 降级方案 |
|------|------|---------|
| `git` | 列出/删除分支 | 无（必需） |
| `gh` CLI | 检查 PR 状态 | 跳过保护规则，警告输出 |
| HTTPS remote | push 权限 | ✅ 已确认 (https://github.com/godlockin/eket) |

### 2.3 数据流

```
1. git ls-remote → 分支列表
2. 并发 fetch + git log → 最后更新时间
3. 读取 ticket 文件 → task status
4. gh pr list → PR 状态 (可选)
5. 应用规则 → eligible: true/false + reason
6. --dry-run → 仅打印 | --execute → git push --delete
```

---

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| `node/src/cli.ts` | 低 | 仅新增命令注册 (+1 行) |
| `node/src/commands/` | 中 | 新增 checkpoint-gc.ts (~350 LOC) |
| `node/tests/commands/` | 中 | 新增测试文件 (~180 LOC) |
| Remote repo | **高** | **破坏性操作**：删除 remote 分支（不可逆） |
| 依赖系统 | 低 | 需 `gh` CLI (optional, graceful fallback) |

**风险控制**:
- 默认 `--dry-run`，避免误操作
- `--execute` 需显式传入
- 删除前二次确认 (eligible 检测)

---

## 4. 任务拆解

| 子任务 | 预估工时 | 优先级 | 依赖 |
|--------|----------|--------|------|
| 1. 创建命令骨架 + 注册 | 0.5h | P0 | None |
| 2. 实现 scanCheckpointBranches() | 1h | P0 | 1 |
| 3. 实现 isEligibleForDeletion() | 1h | P0 | 2 |
| 4. 实现 printGCReport() | 0.5h | P1 | 3 |
| 5. 实现 deleteCheckpointBranches() | 0.5h | P1 | 3 |
| 6. 编写单元测试 | 1h | P0 | 5 |
| 7. 集成测试 (手动) | 0.5h | P1 | 6 |

**总计**: 5h (含测试 buffer)

---

## 5. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| **误删活跃分支** | 低 | **高** | 默认 dry-run + PR 保护规则 |
| gh CLI 不可用 | 中 | 低 | Graceful fallback (跳过 PR 检查) |
| Git push 权限问题 | 低 | 中 | Try-catch + 显示错误 |
| 分支列表过长 (1000+) | 低 | 低 | 并发 fetch (Promise.all) |
| Ticket 文件缺失/损坏 | 中 | 低 | Try-catch + 视为 stale |

---

## 6. Implementation Sketch 审查

TASK-X07.md 提供定义 (--dry-run / --execute / --older-than)
- ✅ parseDuration() / formatAge() 工具函数
- ✅ 清理规则逻辑

**需调整**:
- ⚠️ `execFileAsync` → 需 `import { promisify } from 'util'`
- ⚠️ 并发 fetch 可能导致 rate limit → 需增加 concurrency control
- ⚠️ gh CLI fallback 逻辑需补充 (sketch 中只有 try-catch)

---

## 7. 验收命令准备

### AC-1: Dry-run 列出分支
```bash
# 需先 mock 测试分支
git checkout -b checkpoint/TASK-TEST-001
git commit --allow-empty -m "Test checkpoint"
git push origin checkpoint/TASK-TEST-001

# 测试
npm run build && node dist/index.js checkpoint:gc --dry-run | grep "checkpoint/"
# Expected: 列出分支 + 状态
```

### AC-2: 执行删除
```bash
node dist/index.js checkpoint:gc --execute
git ls-remote --heads origin checkpoint/TASK-TEST-001
# Expected: 分支已删除 (空输出)
```

### AC-3: 保护未合并 PR
```bash
# Mock: 创建 open PR for TASK-TEST-001
gh pr create --base testing --head checkpoint/TASK-TEST-001 --title "Test PR"

node dist/index.js checkpoint:gc --execute | grep "Skipped"
# Expected: "⚠️ Skipped: checkpoint/TASK-TEST-001 (PR #XXX not merged)"
```

### AC-4: 自定义阈值
```bash
node dist/index.js checkpoint:gc --older-than 30d --dry-run
# Expected: 仅列出 30d+ 分支
```

---

## 8. 降级标记

**无降级模式** — 本命令依赖 git/gh CLI，无法 mock 执行。

若 `gh` CLI 不可用 → 跳过 PR 检查，输出警告：
```
⚠️ gh CLI not available - PR protection disabled
```

---

## 9. 执行时间表

| 阶段 | 时间 | Deliverable |
|------|------|-------------|
| 分析报告 | +10min | 本文件 |
| 命令骨架 | +30min | checkpoint-gc.ts (skeleton) |
| 核心逻辑 | +2h | scan + eligible + delete 实现 |
| 测试编写 | +1h | checkpoint-gc.test.ts |
| 手动验证 | +30min | 执行 AC-1~4 命令 |
| PR 提交 | +15min | PR.md + push |

**Tota/checkpoint-gc.ts` 骨架  
⏭️ 实现核心逻辑  
⏭️ 编写测试

**等待 Master 审批本分析报告后开始执行。**
