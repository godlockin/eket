---
id: TASK-604
agent_type: backend
estimate_hours: 008
assigned_to: slaver-backend-003
claimed_at: 2026-05-10T00:12:00Z
status: approved
---

# TASK-604: ContextTracker 增强 - 双向统计 + 降低阈值

**EPIC**: EPIC-006 | **Milestone**: M1-Enhancement | **优先级**: P1 | **工时**: 8h | **状态**: ready | **依赖**: TASK-602

## 状态

**当前状态**: in_progress  
**分配给**: slaver-backend-003  
**分析报告**: [TASK-604/analysis-report.md](./TASK-604/analysis-report.md)

## 需求

增强 TASK-602 ContextTracker，解决未触发 auto-compact 导致 400 overflow 的问题。

**问题根因**:
1. 仅统计 Claude 输出（stdout），未统计用户输入 + SessionStart context
2. Token 估算公式对中文低估 ~50%（chars/3.5 适用英文）
3. 阈值 150k 过高，留给 API 的 buffer 不足（API 限制 168k）
4. 仅覆盖 eket 命令，Master 手动操作未跟踪

**影响**: 2026-05-10 Master 会话超 200k tokens → 400 overflow

---

## 验收标准

### AC-1: 双向 Token 统计
- Given claude-runner 调用 Claude Code
- When 执行前后
- Then 统计 input tokens (prompt + args) + output tokens (stdout)
- And 两者都累加到 sessionTokens

### AC-2: 改进 Token 估算公式
- Given 中英文混合文本
- When 估算 tokens
- Then 中文按 chars/1.5，英文按 chars/4 分别计算
- And 总估算误差 < 20%（相比 tiktoken）

### AC-3: 降低 compact 阈值
- Given 当前阈值 150k
- When 调整为 120k
- Then 距 API 限制 168k 留 48k buffer（~30%）
- And 5 分钟 cooldown 保持不变

### AC-4: 提供 context status 命令
- Given `eket context:status` 命令
- When 执行
- Then 返回当前 sessionId + tokens + 剩余 + 上次 compact 时间 + 建议

### AC-5: 日志与监控
- Given ContextTracker 运行
- When token 累积或触发 compact
- Then 输出清晰日志（累加/警告/触发/结果）

---

## 技术方案（核心要点）

### 1. 双向统计
```typescript
// claude-runner.ts
contextTracker.trackInput(sessionId, inputText);   // Before
contextTracker.trackOutput(sessionId, result.stdout); // After
```

### 2. 改进估算
```typescript
// context-tracker.ts
private estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const chineseTokens = Math.ceil(chineseChars / 1.5);
  const englishTokens = Math.ceil((text.length - chineseChars) / 4);
  return chineseTokens + englishTokens;
}
```

### 3. 降低阈值
```typescript
shouldCompact(): boolean {
  return tokens > 120000 && timeSinceCompact > 5 * 60 * 1000;
}
```

### 4. context:status 命令
```typescript
// commands/context-status.ts
export function contextStatus(sessionId: string) {
  console.log(`Current: ${tokens}/120000 (${usage}%)`);
  console.log(`Recommendation: ${shouldCompact ? 'Compact NOW' : 'OK'}`);
}
```

---

## 影响文件

**修改**:
- `node/src/core/context-tracker.ts` (+100 lines)
- `node/src/core/claude-runner.ts` (+10 lines)

**新增**:
- `node/src/commands/context-status.ts` (40 lines)
- `node/tests/core/context-tracker-enhanced.test.ts` (80 lines)

---

## 测试计划

**单元测试**:
- estimateTokens 中英文混合
- trackInput + trackOutput 累加
- shouldCompact 阈值 120k
- cooldown 5min 生效

**集成测试**:
- 启动 eket 观察日志
- 执行多轮对话验证累加
- 触发 120k 验证 auto-compact
- `eket context:status` 显示统计

---

## 成功指标

- [ ] 估算误差 < 20%
- [ ] 120k 阈值触发 auto-compact
- [ ] `eket context:status` 实时统计
- [ ] 长会话（>100 轮）无 400 overflow

---

**建立时间**: 2026-05-10  
**建立原因**: 2026-05-10 Master 会话 200k overflow 根因分析  
**相关**: TASK-601 (400 recovery), TASK-602 (ContextTracker v1), TASK-603 (config optimization)
