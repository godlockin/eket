---
agent_type: backend
estimate_hours: 006
assigned_to: Slaver-backend-002
claimed_at: 2026-05-09T14:30:00Z
status: review
---

# TASK-602: Context Tracker + 动态 Compact 触发

**EPIC**: EPIC-006 | **Milestone**: M0-Emergency | **优先级**: P0 | **工时**: 5h | **状态**: review | **依赖**: TASK-601

## 需求

实现 `ContextTracker` 类，在每次 tool call 后累加 estimated tokens，超过 150k 自动触发 `/compact`。

## 验收标准

- **AC-1**: Given 新建 `node/src/core/context-tracker.ts`, When 导出 `ContextTracker` 类, Then 包含方法：`trackToolOutput(sessionId, output)`, `shouldCompact(sessionId)`, `triggerCompact(sessionId)`
- **AC-2**: Given 每次 `runClaude` 返回 tool output, When 调用 `tracker.trackToolOutput()`, Then 累加 estimated tokens（公式：`output.length / 3.5`）
- **AC-3**: Given session tokens 累积超过 150k, When 下次 `runClaude` 调用前, Then 自动执行 `tracker.triggerCompact()` → 调用 `claude --command /compact`
- **AC-4**: Given `/compact` 执行成功, When 重置 session token 计数, Then 设为 20k（保守估计 compact 后剩余）
- **AC-5**: Given 50 轮对话（模拟）, When token 累积曲线, Then 触发 2-3 次 auto-compact，session 保持在 150k 以下

## 技术方案

### 新增文件
- `node/src/core/context-tracker.ts`

### 核心实现
```typescript
export class ContextTracker {
  private sessionTokens: Map<string, number> = new Map();
  private lastCompactTime: Map<string, number> = new Map();

  /**
   * 每次 tool call 后调用，累加 estimated tokens
   */
  trackToolOutput(sessionId: string, output: string): void {
    const estimated = Math.ceil(output.length / 3.5);
    const current = this.sessionTokens.get(sessionId) || 0;
    const newTotal = current + estimated;
    
    this.sessionTokens.set(sessionId, newTotal);

    console.log(`[Context Tracker] Session ${sessionId}: ${newTotal} tokens (+${estimated})`);

    // 日志记录（调试用）
    if (newTotal > 100000) {
      console.warn(`⚠️  Session ${sessionId} approaching limit: ${newTotal}/200000 tokens`);
    }
  }

  /**
   * 判断是否需要 compact
   */
  shouldCompact(sessionId: string): boolean {
    const tokens = this.sessionTokens.get(sessionId) || 0;
    const lastCompact = this.lastCompactTime.get(sessionId) || 0;
    const timeSinceCompact = Date.now() - lastCompact;

    // 超过 150k 且距上次 compact > 5 分钟
    return tokens > 150000 && timeSinceCompact > 5 * 60 * 1000;
  }

  /**
   * 执行 compact
   */
  async triggerCompact(sessionId: string): Promise<boolean> {
    console.log(`🗜️  Compacting session ${sessionId} (${this.sessionTokens.get(sessionId)} tokens)...`);

    try {
      const result = await execFileNoThrow('claude', ['--command', '/compact']);
      
      if (result.exitCode === 0) {
        // 重置计数器（保守估计 compact 后留 20k）
        this.sessionTokens.set(sessionId, 20000);
        this.lastCompactTime.set(sessionId, Date.now());
        console.log('✅ Compact successful, tokens reset to ~20k');
        return true;
      } else {
        console.error('❌ Compact failed:', result.stderr);
        return false;
      }
    } catch (error) {
      console.error('❌ Compact error:', error);
      return false;
    }
  }

  /**
   * 获取当前 session 的 token 估算
   */
  getSessionTokens(sessionId: string): number {
    return this.sessionTokens.get(sessionId) || 0;
  }

  /**
   * 清理 session 记录（session 结束时调用）
   */
  clearSession(sessionId: string): void {
    this.sessionTokens.delete(sessionId);
    this.lastCompactTime.delete(sessionId);
  }
}

// 全局单例
export const contextTracker = new ContextTracker();
```

### 集成到 claude-runner.ts
```typescript
import { contextTracker } from './context-tracker.js';

export async function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const sessionId = options.sessionId || 'default';

  // 检查是否需要 compact
  if (contextTracker.shouldCompact(sessionId)) {
    const compacted = await contextTracker.triggerCompact(sessionId);
    if (!compacted) {
      console.warn('⚠️  Auto-compact failed, proceeding anyway...');
    }
  }

  // 原有逻辑
  const result = await execFileNoThrow('claude', [...args]);

  // 追踪 output tokens
  if (result.stdout) {
    contextTracker.trackToolOutput(sessionId, result.stdout);
  }

  return result;
}
```

## 测试策略

- **unit**: `tests/core/context-tracker.test.ts`
  - 验证 token 累加逻辑
  - 验证 shouldCompact 触发条件
  - 验证 compact 后 reset 逻辑
  
- **integration**: 模拟 50 轮对话
  ```typescript
  for (let i = 0; i < 50; i++) {
    const result = await runClaude({
      prompt: `Analyze file ${i}`,
      projectRoot: '.',
      role: 'slaver',
      sessionId: 'test-session',
    });
    // 验证 tokens 增长曲线
  }
  // 验证触发了 2-3 次 compact
  expect(contextTracker.getSessionTokens('test-session')).toBeLessThan(150000);
  ```

## observability
- logs: ["context.tracker.token_added", "context.compact.triggered", "context.compact.success"]
- metrics: ["context.session_tokens", "context.compact_count"]

## rollback_plan
Revert PR。仅新增监控逻辑，无破坏性变更。

---

**类型**: feature  
**技能要求**: Node.js / TypeScript / Process Management  
**依赖**: TASK-601（需要 recovery 机制作为 fallback）  
**assigned_experts**: backend-engineer
