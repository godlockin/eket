# TASK-631: Shell Hook - 轻量级 Context 计数器

**Epic**: EPIC-007  
**Priority**: P0  
**Status**: 🔄 Re-Review Requested  
**Assignee**: slaver-001  
**Claimed**: 2026-05-13 01:17  
**Approved**: 2026-05-14 01:30  
**Implemented**: 2026-05-14 02:00  
**Reviewed**: 2026-05-14 02:10  
**Fixed**: 2026-05-14 03:00  
**Estimate**: 2h  
**Actual**: 2h  
**Agent Type**: devops  
**Category**: 🔧 Infrastructure  

---

## Goal

在 UserPromptSubmit Hook 实现轻量级轮次计数 + 文件大小粗估，超阈值打印警告。

---

## Acceptance Criteria

**AC-1**: Hook 每次触发时累加计数器  
- Given: UserPromptSubmit hook 被调用
- When: 执行 `.claude/hooks/UserPromptSubmit.sh`
- Then: `.eket/state/context-turn-count` 数值 +1

**AC-2**: 粗估 tokens 基于文件大小  
- Given: 工作区有 100KB Markdown 文件
- When: 执行粗估算法（wc -c × 0.3）
- Then: 返回 ~30K tokens

**AC-3**: 10轮或50K触发警告  
- Given: 计数器 = 10 OR 粗估 ≥ 50K
- When: Hook 执行
- Then: stderr 打印 "⚠️ Context 接近阈值 (X轮, ~YK tokens)"

**AC-4**: 80K触发异步Node调用  
- Given: 粗估 ≥ 80K
- When: Hook 执行
- Then: 后台启动 `node node/dist/context-monitor.js --check`

---

## Implementation Sketch

```bash
#!/bin/bash
# .claude/hooks/UserPromptSubmit.sh

COUNT_FILE=".eket/state/context-turn-count"
count=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
count=$((count + 1))
echo $count > "$COUNT_FILE"

# 粗估算
total_size=$(find . -name "*.md" -o -name "*.ts" 2>/dev/null | \
  xargs wc -c 2>/dev/null | tail -1 | awk '{print $1}')
approx_tokens=$((total_size * 3 / 10))

# 阈值判断
if [ $count -ge 10 ] || [ $approx_tokens -ge 50000 ]; then
  echo "⚠️ Context 接近阈值 ($count轮, ~${approx_tokens}K tokens)" >&2
fi

if [ $approx_tokens -ge 80000 ]; then
  nohup node node/dist/context-monitor.js --check &>/dev/null &
fi
```

---

## Implementation Details

**Branch**: `feature/TASK-631-shell-hook`  
**Commit**: `6e5590a` - feat(hooks): implement UserPromptSubmit hook (TASK-631)  
**PR**: `jira/tickets/EPIC-007/TASK-631/PR.md`

**Files Modified**:
- `.claude/hooks/UserPromptSubmit.sh` (created)

**AC Status**:
- ✅ AC-1: Turn counter (.eket/state/context-turn-count)
- ✅ AC-2: Token estimation (0.3 tokens/char from analysis)
- ✅ AC-3: Warning at turn ≥10 OR 50K tokens (boolean OR)
- ⏳ AC-4: Deferred to TASK-632 (TODO comment added)

**Review Iteration 2 - Changes Applied**:
- 🔴 CRITICAL: Threshold 8→10 turns (line 13)
- 🟡 MEDIUM: Token coefficient 0.4→0.3 (line 49)
- 🟢 MINOR: 50K token threshold check added (line 54-56)

**New Commit**: `cb26aec` - fix(hooks): address review comments (TASK-631)

**Master Approval Changes Applied**:
- High Priority: .gitignore exclusions (node_modules, .git, dist)
- High Priority: Error tolerance (set +e, exit 0)
- Medium Priority: Large JSON exclusion pattern ready

**Test Results**:
- Counter: ✅ 10 increments verified
- Warning: ✅ Triggers at turn 11 (threshold=10)
- Token threshold: ✅ OR clause with 50K check
- Shellcheck: ✅ No issues

---

## Observability

**Logs**: Hook 执行日志（stderr）  
**Metrics**: 计数器文件（`.eket/state/context-turn-count`）  

---

## Rollback Plan

删除 Hook 脚本或注释逻辑，恢复为空 Hook。

---

## Test Strategy

**Unit**: 测试计数器累加逻辑（mock 文件读取）  
**Integration**: 模拟 10 轮触发，验证警告输出  
**Regression**: CI 双平台（Mac + Linux）测试  

---

**Blocked By**: None  
**Blocks**: TASK-632  
**Created**: 2026-05-14
