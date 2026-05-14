# TASK-AUTO-01: Auto-Compact on 120K Context Threshold

**Epic**: EPIC-007  
**Priority**: P0 🔴 (Critical - 防止 400 错误)  
**Status**: 📋 Ready  
**Estimate**: 2h  
**Agent Type**: backend  
**Category**: 🔧 Critical Fix

---

## Problem Statement

**当前问题**: Slaver 执行到 120K tokens 时仅警告，不自动 compact
- **风险**: 继续执行 → 150K → 170K → 💥 **400 Error** (任务中断，工作丢失)
- **证据**: EPIC-007 设计有 5 层防护，但 **Layer 1 (Auto-Compact) 未实现**

**用户诉求**: "进行到一半的时候直接 400 怎么办？"

---

## Goal

在 Node.js context-monitor 达到 120K 阈值时**自动触发 `/compact`**，防止继续膨胀导致 400。

---

## Acceptance Criteria

**AC-1**: 120K 阈值自动 compact  
- Given: `context-monitor.js` 返回 `{"tokens": 125000, "threshold": "danger"}`
- When: Hook 执行或 Slaver 检测
- Then: **自动执行** `/compact` (不仅警告)

**AC-2**: Compact 失败告警  
- Given: `/compact` 执行失败 (API 错误)
- When: 捕获异常
- Then: 创建 `.eket/inbox/compact-failure-<timestamp>.md` 告警 Master

**AC-3**: Compact 成功后重置计数器  
- Given: `/compact` 成功
- When: Hook 下次执行
- Then: `.eket/state/context-turn-count` 重置为 0

**AC-4**: 防重复 compact (5min 冷却)  
- Given: 刚 compact 完 3min
- When: 再次达到 120K
- Then: 跳过 compact (避免频繁触发)

---

## Implementation Sketch

### 1. 修改 UserPromptSubmit Hook

```bash
# .claude/hooks/UserPromptSubmit.sh (line 60 后添加)

# AC-1: Auto-compact at 120K
COMPACT_THRESHOLD=120000
COOLDOWN_FILE="${STATE_DIR}/last-compact-time"

if [ $TOTAL_TOKENS -ge $COMPACT_THRESHOLD ]; then
  # AC-4: Check cooldown (5min = 300s)
  NOW=$(date +%s)
  LAST_COMPACT=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
  ELAPSED=$((NOW - LAST_COMPACT))
  
  if [ $ELAPSED -gt 300 ]; then
    echo "🔄 Auto-compacting at ${TOTAL_TOKENS} tokens..." >&2
    
    # AC-1: Execute /compact (via Claude Code API or file trigger)
    # 方案 A: 写文件触发 (Claude Code 监听)
    echo "AUTO_COMPACT_REQUEST" > .eket/triggers/compact.trigger
    
    # 方案 B: 直接调用 (如果可行)
    # curl -X POST http://localhost:xxxx/compact
    
    # AC-2: Log attempt
    echo $NOW > "$COOLDOWN_FILE"
    echo "📝 Compact triggered at turn $NEW_COUNT" >&2
  else
    echo "⏳ Compact on cooldown (${ELAPSED}s ago)" >&2
  fi
fi
```

### 2. Claude Code Compact 触发机制

**方案 A: File Watcher** (推荐)
```typescript
// 新建: node/src/watchers/compact-trigger-watcher.ts
import { watch } from 'fs/promises';

export async function watchCompactTrigger() {
  const triggerFile = '.eket/triggers/compact.trigger';
  
  for await (const event of watch(triggerFile)) {
    if (event.eventType === 'change') {
      const content = await fs.readFile(triggerFile, 'utf-8');
      if (content.includes('AUTO_COMPACT_REQUEST')) {
        await executeCompact();
        await fs.writeFile(triggerFile, '');  // 清空
      }
    }
  }
}

async function executeCompact(): Promise<void> {
  try {
    // 调用 Claude Code /compact API (需研究)
    // 或: 写入 .claude/commands/trigger-compact.sh
    
    // AC-3: Reset counter on success
    await fs.writeFile('.eket/state/context-turn-count', '0');
    console.log('✅ Auto-compact successful');
  } catch (err) {
    // AC-2: Create failure alert
    const alert = `.eket/inbox/compact-failure-${Date.now()}.md`;
    await fs.writeFile(alert, `# Auto-Compact Failed\n\nError: ${err.message}`);
  }
}
```

**方案 B: Exit Code Signal** (备选)
```bash
# Hook 返回特殊 exit code
if [ $TOTAL_TOKENS -ge $COMPACT_THRESHOLD ]; then
  exit 99  # Claude Code 检测到 99 → 自动 /compact
fi
```

---

## Technical Challenges

**问题**: Hook 无法直接触发 `/compact` (Bash 不能调用 Claude API)

**候选方案**:
1. ✅ **File trigger** - Hook 写文件 → Node watcher → 触发 compact
2. ✅ **HTTP API** - Hook curl localhost:PORT/compact (需 eket server 运行)
3. ⚠️ **Exit code signal** - 需 Claude Code 支持特殊 exit code
4. ❌ **直接调用** - Hook 无权限访问 Claude API

**推荐**: 方案 1 (file trigger) + 方案 2 (HTTP fallback)

---

## Observability

**Logs**:
```bash
# Hook 日志
.eket/logs/auto-compact.log
# 2026-05-14 18:00 - Triggered at 125K tokens (turn 15)
# 2026-05-14 18:01 - Compact successful, reset to turn 0

# 失败告警
.eket/inbox/compact-failure-1778750000.md
```

**Metrics**:
- Compact 触发次数
- 成功/失败率
- 平均 compact 后 token 减少量

---

## Rollback Plan

禁用 auto-compact:
```bash
export ENABLE_AUTO_COMPACT=false
```

---

## Test Strategy

**Unit**: Mock file watcher + compa
2. 触发 Hook
3. 验证 compact 执行 + counter 重置

**边界 case**:
- Compact API 不可用 → 降级为仅告警
- 连续 2 次失败 → 停止自动触发，人工介入

---

**Blocked By**: 需研究 Claude Code `/compact` 触发机制  
**Blocks**: None (Critical, 应优先)  
**Created**: 2026-05-14
