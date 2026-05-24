# Context Overflow 400 错误解决方案

**问题**: Master/Slaver 执行任务时上下文超限 → API 返回 400 → 任务中断

**影响**: 严重阻塞，无法继续执行，丢失工作进度

---

## 一、现状分析

### 1.1 已有机制（Rust 侧）

**ContextBudgetApplier** (`rust/crates/eket-engine/src/context_budget.rs`):
- **Phase 1**: `exclude_tool_outputs` — 移除 tool_output/tool_result
- **Phase 2**: `include_fields` — 白名单模式（仅保留指定字段）
- **Phase 3**: `keep_recent_n` — history 数组仅保留最近 N 条
- **Phase 4**: `max_tokens` — 超限时移除最大非元数据字段

**问题**:
- Rust 侧有完整 context budget 机制
- 但 **Node.js 侧未完全对接** → Master/Slaver 使用 Node API 时无保护
- **无主动预警** → 仅在 API 返回 400 时才知道超限

### 1.2 典型场景

| 场景 | 上下文膨胀原因 | 当前表现 |
|------|--------------|---------|
| Slaver 深度分析 | 连续 Read 5+ 大文件（每个 10k tokens） | 400 错误，任务中断 |
| Master PR 审核 | git diff 输出 + 多文件内容 + 历史对话 | 400 错误，review 失败 |
| 复杂需求拆解 | 大型 requirement-analysis + 多轮专家讨论 | 400 错误，EPIC 规划中断 |
| 长时间对话 | 累积 50+ 轮对话 + tool outputs | 逐渐变慢 → 最终 400 |

---

## 二、解决方案（分层防御）

### 2.1 Layer 1: 主动压缩（事前）

#### 实现 1: Node.js Context Budget Wrapper

**位置**: `node/src/core/context-compactor.ts`（新增）

```typescript
import { ContextBudget } from '../types/index.js';

interface CompactionConfig {
  maxTokens: number;           // 默认 180k（留 20k buffer for 200k limit）
  keepRecentMessages: number;  // 默认 20（最近 20 轮对话）
  excludeToolOutputs: boolean; // 默认 true
  criticalFields: string[];    // 必须保留字段
}

export class ContextCompactor {
  private config: CompactionConfig;

  constructor(config?: Partial<CompactionConfig>) {
    this.config = {
      maxTokens: 180000,
      keepRecentMessages: 20,
      excludeToolOutputs: true,
      criticalFields: ['task_id', 'epic_id', 'current_step'],
      ...config,
    };
  }

  /**
   * 在发送 API 请求前压缩 context
   */
  async compact(messages: any[]): Promise<any[]> {
    let compacted = [...messages];

    // Phase 1: 移除 tool outputs（保留最近 5 个）
    if (this.config.excludeToolOutputs) {
      compacted = this.trimToolOutputs(compacted);
    }

    // Phase 2: 仅保留最近 N 条消息
    if (compacted.length > this.config.keepRecentMessages) {
      const systemMsg = compacted.find(m => m.role === 'system');
      const recent = compacted.slice(-this.config.keepRecentMessages);
      compacted = systemMsg ? [systemMsg, ...recent] : recent;
    }

    // Phase 3: 超长消息截断
    compacted = this.truncateLongMessages(compacted);

    // Phase 4: 估算 tokens，超限则激进裁剪
    const estimatedTokens = this.estimateTokens(compacted);
    if (estimatedTokens > this.config.maxTokens) {
      compacted = this.aggressiveTrim(compacted, this.config.maxTokens);
    }

    return compacted;
  }

  private trimToolOutputs(messages: any[]): any[] {
    const toolOutputIndices: number[] = [];
    messages.forEach((msg, idx) => {
      if (msg.role === 'tool' || msg.content?.includes('tool_result')) {
        toolOutputIndices.push(idx);
      }
    });

    // 仅保留最近 5 个 tool outputs
    const toRemove = toolOutputIndices.slice(0, -5);
    return messages.filter((_, idx) => !toRemove.includes(idx));
  }

  private truncateLongMessages(messages: any[]): any[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string' && msg.content.length > 10000) {
        return {
          ...msg,
          content: msg.content.slice(0, 10000) + '\n\n[... truncated ...]',
        };
      }
      return msg;
    });
  }

  private estimateTokens(messages: any[]): number {
    // 粗估：1 token ≈ 4 chars（英文），中文更密集
    const totalChars = messages.reduce((sum, msg) => {
      return sum + JSON.stringify(msg).length;
    }, 0);
    return Math.ceil(totalChars / 3.5); // 保守估计
  }

  private aggressiveTrim(messages: any[], maxTokens: number): any[] {
    // 仅保留 system + 最近 10 条
    const systemMsg = messages.find(m => m.role === 'system');
    const recent = messages.slice(-10);
    return systemMsg ? [systemMsg, ...recent] : recent;
  }
}
```

**使用**:
```typescript
// node/src/api/openclaw-gateway.ts
import { ContextCompactor } from '../core/context-compactor.js';

const compactor = new ContextCompactor();

async function callClaudeAPI(messages: any[]) {
  const compacted = await compactor.compact(messages);
  return await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    messages: compacted,
    max_tokens: 8192,
  });
}
```

---

#### 实现 2: 自动 Checkpoint（每 20 轮对话）

**触发条件**: 
- 对话轮次 ≥ 20
- 估算 tokens > 150k

**操作**:
1. 生成当前对话摘要（Claude API summary）
2. 清空 message history
3. 仅保留：system prompt + summary + 最近 5 轮对话

**位置**: `node/src/core/history-tracker.ts`（新增 autoCheckpoint()）

```typescript
async autoCheckpoint(sessionId: string): Promise<void> {
  const history = await this.getHistory(sessionId);
  
  if (history.length < 20) return;

  const estimatedTokens = this.estimateTokens(history);
  if (estimatedTokens < 150000) return;

  console.log(`[Checkpoint] Session ${sessionId}: ${history.length} messages, ~${estimatedTokens} tokens`);

  // 生成摘要
  const summary = await this.summarizeHistory(history);

  // 清理并重置
  await this.db.run(
    `DELETE FROM message_history WHERE session_id = ? AND created_at < datetime('now', '-1 hour')`,
    [sessionId]
  );

  // 插入摘要消息
  await this.db.run(
    `INSERT INTO message_history (session_id, role, content, created_at) VALUES (?, 'system', ?, datetime('now'))`,
    [sessionId, `[Auto-Checkpoint Summary]\n${summary}`]
  );

  console.log(`[Checkpoint] Saved summary, cleared old messages`);
}
```

---

### 2.2 Layer 2: 预警系统（事中）

#### 实现 3: Token 使用监控

**位置**: `node/src/core/token-monitor.ts`（新增）

```typescript
export class TokenMonitor {
  private warnings: Map<string, number> = new Map();

  check(sessionId: string, messages: any[]): void {
    const estimated = this.estimateTokens(messages);
    const limit = 200000;
    const usage = (estimated / limit) * 100;

    if (usage > 90) {
      console.warn(`⚠️  [Token Monitor] Session ${sessionId}: ${usage.toFixed(1)}% (${estimated}/${limit} tokens)`);
      console.warn(`   Suggest: Run /compact or checkpoint now`);
      this.warnings.set(sessionId, Date.now());
    } else if (usage > 75) {
      console.warn(`⚠️  [Token Monitor] Session ${sessionId}: ${usage.toFixed(1)}% - approaching limit`);
    }
  }

  hasRecentWarning(sessionId: string): boolean {
    const lastWarn = this.warnings.get(sessionId);
    if (!lastWarn) return false;
    return Date.now() - lastWarn < 60000; // 1 分钟内
  }
}
```

**集成**:
```typescript
// node/src/api/openclaw-gateway.ts
const tokenMonitor = new TokenMonitor();

async function callClaudeAPI(sessionId: string, messages: any[]) {
  tokenMonitor.check(sessionId, messages);

  if (tokenMonitor.hasRecentWarning(sessionId)) {
    // 强制压缩
    messages = await compactor.compact(messages);
  }

  return await anthropic.messages.create({ ... });
}
```

---

### 2.3 Layer 3: 优雅降级（事后）

#### 实现 4: 400 错误自动恢复

**位置**: `node/src/api/openclaw-gateway.ts`（修改）

```typescript
async function callClaudeAPIWithRetry(sessionId: string, messages: any[]) {
  try {
    return await callClaudeAPI(sessionId, messages);
  } catch (error) {
    if (error.status === 400 && error.message?.includes('context_length')) {
      console.error('❌ Context limit exceeded (400), auto-recovering...');

      // 激进压缩：仅保留 system + 最近 5 条
      const systemMsg = messages.find(m => m.role === 'system');
      const recent = messages.slice(-5);
      const minimal = systemMsg ? [systemMsg, ...recent] : recent;

      console.log(`   Retry with ${minimal.length} messages (down from ${messages.length})`);

      // 重试
      return await callClaudeAPI(sessionId, minimal);
    }
    throw error; // 其他错误正常抛出
  }
}
```

---

### 2.4 Layer 4: 用户工具（手动）

#### 实现 5: `/compact` 命令

**位置**: `node/src/commands/compact.ts`（新增）

```typescript
export async function compactCommand(args: string[]): Promise<void> {
  const sessionId = getCurrentSessionId();
  const history = await historyTracker.getHistory(sessionId);

  console.log(`Current session: ${history.length} messages, ~${estimateTokens(history)} tokens`);

  // 生成摘要
  const summary = await summarizeHistory(history);

  // 清理旧消息（保留最近 10 条）
  await historyTracker.compact(sessionId, 10);

  console.log('✅ Session compacted');
  console.log(`Summary saved: ${summary.slice(0, 200)}...`);
}
```

**使用**:
```bash
eket compact             # 压缩当前 session
eket compact --messages 5  # 仅保留最近 5 条
```

---

## 三、实施计划

### Phase 1: 紧急修复（P0，1 day）

- [ ] **实现 4**: 400 错误自动恢复（`openclaw-gateway.ts`）
- [ ] **实现 5**: `/compact` 命令（手动工具）
- [ ] 测试：模拟超长对话 → 验证自动恢复

### Phase 2: 主动防御（P1，3 days）

- [ ] **实现 1**: `ContextCompactor` 类
- [ ] **实现 3**: `TokenMonitor` 预警
- [ ] 集成到 `openclaw-gateway.ts`
- [ ] 测试：长时间对话不触发 400

### Phase 3: 长期优化（P2，5 days）

- [ ] **实现 2**: 自动 Checkpoint 机制
- [ ] Rust ↔ Node 对齐（Node 侧调用 Rust context_budget）
- [ ] Dashboard 展示 token 使用率
- [ ] 文档：confluence/memory/context-management.md

---

## 四、配置建议

### 4.1 Master 配置

```json
// .eket/master-config.json
{
  "context": {
    "maxTokens": 180000,
    "autoCheckpoint": true,
    "checkpointInterval": 20,  // 每 20 轮对话
    "excludeToolOutputs": true
  }
}
```

### 4.2 Slaver 配置

```json
// .eket/slaver-config.json
{
  "context": {
    "maxTokens": 150000,       // Slaver 更激进
    "keepRecentMessages": 15,
    "autoCompact": true,       // 主动压缩
    "compactThreshold": 0.75   // 75% 时触发
  }
}
```

---

## 五、监控指标

### 5.1 Dashboard 展示

| 指标 | 阈值 | 告警 |
|------|------|------|
| Token 使用率 | <75% | 绿色 |
| Token 使用率 | 75-90% | 黄色（预警） |
| Token 使用率 | >90% | 红色（强制压缩） |
| 400 错误次数 | 0 | - |
| 400 错误次数 | >0 | 红色（失败） |
| Checkpoint 次数 | - | 信息展示 |

### 5.2 日志

```
[Token Monitor] Session abc123: 78.5% (157k/200k tokens) - approaching limit
[Checkpoint] Session abc123: 25 messages, ~165k tokens
[Checkpoint] Saved summary, cleared old messages
[Auto-Recover] Context limit exceeded, retrying with 5 messages (down from 32)
```

---

## 六、测试用例

### 6.1 单元测试

```typescript
// node/tests/core/context-compactor.test.ts
describe('ContextCompactor', () => {
  it('should trim tool outputs', () => {
    const messages = [
      { role: 'user', content: 'task' },
      { role: 'tool', content: 'output 1' },
      { role: 'tool', content: 'output 2' },
      { role: 'tool', content: 'output 3' },
      { role: 'tool', content: 'output 4' },
      { role: 'tool', content: 'output 5' },
      { role: 'tool', content: 'output 6' },
    ];

    const compactor = new ContextCompactor({ keepRecentMessages: 10 });
    const result = await compactor.compact(messages);

    // 仅保留最近 5 个 tool outputs
    const toolOutputs = result.filter(m => m.role === 'tool');
    expect(toolOutputs.length).toBe(5);
  });

  it('should keep system message', () => {
    const messages = [
      { role: 'system', content: 'you are...' },
      ...Array(30).fill({ role: 'user', content: 'test' }),
    ];

    const compactor = new ContextCompactor({ keepRecentMessages: 10 });
    const result = await compactor.compact(messages);

    expect(result[0].role).toBe('system');
    expect(result.length).toBe(11); // system + 10 recent
  });
});
```

### 6.2 集成测试

```bash
# 模拟超长对话
eket test:long-conversation --messages 50 --expect-no-400
```

---

## 七、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 压缩丢失关键上下文 | 任务执行错误 | critical_fields 白名单 + 摘要保留关键信息 |
| 自动 checkpoint 误删重要消息 | 无法回溯历史 | 仅删除 >1h 前的消息，保留最近 5 轮 |
| Token 估算不准 | 仍触发 400 | 保守估算（3.5 chars/token）+ 20k buffer |
| Rust ↔ Node 不一致 | 两侧行为不同 | Phase 3 对齐，Node 侧调用 Rust API |

---

**优先级**: P0（紧急）  
**估算工时**: Phase 1 (1d) + Phase 2 (3d) = 4 days  
**交付标准**: 连续执行 50 轮对话 + 深度分析 5 个大文件，无 400 错误
