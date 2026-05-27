---
name: context-tracker-not-triggered
type: pitfall
created: 2026-05-10
source: TASK-604
tags: [context-management, auto-compact, token-estimation]
confidence: high
---

# ContextTracker 未触发 Auto-Compact 根因分析

**发生时间**: 2026-05-10 00:10  
**问题**: Master 会话超 200k tokens → 400 overflow  
**现状**: TASK-602 已实现 ContextTracker，但未触发

---

## 一、问题现象

**API 错误**:
```
400 {"error":{"message":"prompt token count of 200695 exceeds the limit of 168000"}}
```

**会话特征**:
- 40+ 轮对话
- 大量文件读取（经验教训 266 行 + 报告）
- Git 历史查询
- 中英文混合（中文占 ~40%）

---

## 二、根因分析

### 2.1 仅统计输出，未统计输入

**代码位置**: `claude-runner.ts:198-200`

```typescript
// ❌ 只跟踪 stdout
if (result.stdout) {
  contextTracker.trackToolOutput(sessionId, result.stdout);
}
```

**缺失**:
- 用户 prompt（每轮 50-500 tokens）
- SessionStart context（~20k tokens）
- 工具调用参数
- 对话历史累积

**影响**: 实际 tokens 是统计值的 2-3 倍

---

### 2.2 仅覆盖 eket 命令

**集成位置**: `claude-runner.ts:186`（只在 `runClaude()` 中检查）

**未覆盖**:
- Master 手动操作（本次会话主要场景）
- 用户直接使用 Claude Code
- Slaver 未使用 eket 命令

**影响**: Master 长会话完全未跟踪

---

### 2.3 Token 估算公式低估中文

**代码**: `context-tracker.ts:20`

```typescript
const estimated = Math.ceil(output.length / 3.5);
```

**问题**:
- 公式适用英文（3-4 chars/token）
- 中文实际 ~1.5 chars/token
- 中文占比高时，低估 ~50%

**本次会话**:
- 中文占 ~40%
- 估算可能只有 ~100k
- 实际 200k（2倍误差）

---

### 2.4 阈值设置过高

**当前阈值**: 150k tokens

**API 限制**: 168k tokens

**Buffer**: 仅 18k (10%)

**问题**:
- 估算误差 + buffer 不足
- 150k 估算可能实际 180k（已超限）
- Compact 触发太晚

---

## 三、验证方式

**假设**: 如果 ContextTracker 正常工作

**应有日志**:
```
[Context Tracker] Session xxx: 50000 tokens (+2000)
[Context Tracker] Session xxx: 100000 tokens (+3000)
⚠️ Session xxx approaching limit: 100000/200000 tokens
[Context Tracker] Session xxx: 150500 tokens (+1500)
🗜️ Compacting session xxx (150500 tokens)...
✅ Compact successful, tokens reset to ~20k
```

**实际**: 无任何日志（未集成或未统计）

---

## 四、可复用经验

### 4.1 Context 管理原则

**双向统计**:
- Input: user prompt + tool args
- Output: assistant response
- SessionStart: 初始 context 估算

**保守阈值**:
- API 限制: 168k
- 触发阈值: 120k（留 30% buffer）
- 警告阈值: 100k

**改进估算**:
- 中文: chars / 1.5
- 英文: chars / 4
- 混合: 分别计算后相加

### 4.2 集成覆盖范围

**必须覆盖**:
- ✅ eket 命令（已集成）
- ❌ Master 手动操作（本次漏洞）
- ❌ Slaver 直接使用 Claude Code

**长期方案**:
- Hook SessionStart/Stop 全局跟踪
- 提供 `/context status` 查看
- 独立于 eket 命令运行

### 4.3 监控与告警

**日志级别**:
- Info: 每次 token 累加
- Warn: 超 100k（83%）
- Error: 超 150k（125%，已触发 compact）

**用户可见**:
- 提供 `eket context:status` 实时查看
- Compact 执行时明确提示
- 400 错误时提示"会话过长，已 compact"

---

## 五、修复方案（TASK-604）

### P0 - 立即修复

1. **双向统计** - trackInput + trackOutput
2. **降低阈值** - 150k → 120k
3. **改进估算** - 中英文分别计算

### P1 - 后续增强

4. **全局 Hook** - SessionStart 初始化
5. **context:status** - 实时查看统计
6. **真实 tokenizer** - 集成 tiktoken（长期）

---

## 六、统计数据

**本次会话**:
- 实际 tokens: 200,695
- API 限制: 168,000
- 超出: +32,695 (+19%)
- 轮数: ~45 轮

**触发条件未满足**:
- ContextTracker 估算: 未知（可能未统计）
- 应触发阈值: 150k
- 实际触发: 无

**预期修复后**:
- 120k 估算 → 实际 ~150k
- 触发 compact → 重置 20k
- 继续 100 轮 → 实际 ~130k
- 再次 compact → 循环

---

## 七、陷阱与注意事项

### 陷阱 1: 仅统计输出

**错误假设**: 输出是主要 token 消耗

**实际**: 
- SessionStart: ~20k
- 用户输入: ~30% tokens
- 对话历史: 累积占大头

**教训**: 必须双向统计

### 陷阱 2: 估算公式一刀切

**错误**: chars / 3.5 适用所有语言

**实际**:
- 中文: ~1.5 chars/token
- 英文: ~4 chars/token
- 代码: ~3 chars/token

**教训**: 分语言估算，或使用真实 tokenizer

### 陷阱 3: 阈值设置过高

**错误**: 接近 API 限制设阈值（150k vs 168k）

**实际**:
- 估算有误差（±20%）
- 需留 buffer 应对突发（大文件读取）

**教训**: 保守阈值（API 限制的 70-80%）

### 陷阱 4: 集成覆盖不全

**错误**: 只在部分路径检查

**实际**: Master 手动操作占主要时间

**教训**: Hook 全局覆盖，或提供独立监控

---

## 八、验证清单

TASK-604 完成后检查：

- [ ] 中英文混合估算误差 < 20%
- [ ] SessionStart 初始化 ~20k tokens
- [ ] 120k 阈值触发 auto-compact
- [ ] `eket context:status` 显示实时统计
- [ ] 长会话（>100 轮）无 400 overflow
- [ ] Master 手动操作也被跟踪

---

## 九、相关文件

| 文件 | 用途 |
|------|------|
| `jira/tickets/EPIC-006/TASK-604.md` | 修复 ticket |
| `node/src/core/context-tracker.ts` | ContextTracker 实现 |
| `node/src/core/claude-runner.ts` | 集成位置 |
| `/tmp/context-check.md` | 本次分析过程 |

---

**建立时间**: 2026-05-10  
**维护状态**: ✅ 已归档  
**适用范围**: EKET Master-Slaver 长会话管理  
**优先级**: P0（影响所有长会话）
