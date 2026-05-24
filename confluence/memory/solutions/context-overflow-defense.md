# EKET Context Overflow 问题根因与解决方案（修订版）

**问题**: Master/Slaver 执行任务时上下文超限 → Claude CLI 返回 400 → 任务中断

**根因**: EKET 通过 `claude` CLI 调用 Claude Code，**不是直接调用 Anthropic API**，因此：
- Rust 侧 `ContextBudgetApplier` 未被使用（那是 workflow engine 内部机制）
- Node.js 侧无法控制 Claude Code 的 context 管理
- **问题出在 Claude Code CLI 本身的 session management**

---

## 一、架构澄清

### 1.1 调用链

```
EKET Master/Slaver
  ↓ (via claude-runner.ts)
claude CLI (Claude Code)
  ↓ (via Anthropic SDK)
Claude API
```

**关键点**:
- `node/src/core/claude-runner.ts` 调用 `claude` 命令
- 传参：`--model`, `--print`, prompt
- **无法直接控制 Claude Code 的 message history**

### 1.2 Context 累积路径

| 累积源 | Claude Code 行为 | 影响 |
|--------|-----------------|------|
| 长时间对话 | Session history 持续累积 | 无自动压缩 |
| 大文件 Read | 完整内容进入 context | Read 5 个 10k 文件 = 50k tokens |
| Tool outputs | 所有 tool result 保留 | Grep/Glob/LSP 输出累积 |
| 多轮分析 | 每轮对话叠加 | 20+ 轮 → 200k+ tokens |

**Claude Code 默认行为**: 
- ✅ Prompt caching（减少重复 tokens 成本）
- ❌ **无主动 context compaction**（依赖用户 `/compact` 或重启）

---

## 二、解决方案（EKET 层面）

### 策略 A: Session 生命周期管理（推荐）

**原理**: 控制单个 Claude Code session 的工作量，防止累积过多 context

#### 实现 1: Task-Scoped Sessions

**当前**: 1 个 Slaver = 1 个长期 Claude Code session  
**改为**: 1 个 TASK = 1 个短期 session，完成后关闭

**位置**: `node/src/commands/claim.ts` + `node/src/commands/complete.ts`

```typescript
// claim.ts
export async function claimTask(taskId: string): Promise<void> {
  // 启动新 Claude session（独立进程）
  const sessionId = await startClaudeSession({
    role: 'slaver',
    taskId: taskId,
    contextLimit: 150000, // 预留 50k buffer
  });

  await db.run(
    `UPDATE tasks SET status = 'in_progress', claude_session_id = ? WHERE id = ?`,
    [sessionId, taskId]
  );

  console.log(`✅ Task ${taskId} claimed, session ${sessionId} started`);
}

// complete.ts
export async function completeTask(taskId: string): Promise<void> {
  const task = await db.get(`SELECT claude_session_id FROM tasks WHERE id = ?`, [taskId]);

  if (task.claude_session_id) {
    await terminateClaudeSession(task.claude_session_id);
    console.log(`🛑 Session ${task.claude_session_id} terminated`);
  }

  await db.run(`UPDATE tasks SET status = 'done', claude_session_id = NULL WHERE id = ?`, [taskId]);
}
```

**核心函数**:
```typescript
// node/src/core/session-manager.ts（新增）
import { spawn, ChildProcess } from 'child_process';

interface ClaudeSession {
  id: string;
  process: ChildProcess;
  role: string;
  taskId: string;
  startTime: number;
}

const activeSessions = new Map<string, ClaudeSession>();

export async function startClaudeSession(opts: {
  role: string;
  taskId: string;
  contextLimit?: number;
}): Promise<string> {
  const sessionId = `${opts.role}-${opts.taskId}-${Date.now()}`;

  // 启动 claude CLI（持久模式）
  const proc = spawn('claude', [
    '--model', getModelForRole(opts.role),
    '--session', sessionId,
    '--print',
  ], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  activeSessions.set(sessionId, {
    id: sessionId,
    process: proc,
    role: opts.role,
    taskId: opts.taskId,
    startTime: Date.now(),
  });

  // 监控 session 健康度
  startSessionMonitor(sessionId, opts.contextLimit || 150000);

  return sessionId;
}

export async function terminateClaudeSession(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  session.process.kill('SIGTERM');
  activeSessions.delete(sessionId);
}

function startSessionMonitor(sessionId: string, maxTokens: number): void {
  const interval = setInterval(async () => {
    const session = activeSessions.get(sessionId);
    if (!session) {
      clearInterval(interval);
      return;
    }

    // 检查 session 运行时间（超过 2h 告警）
    const runtime = Date.now() - session.startTime;
    if (runtime > 2 * 60 * 60 * 1000) {
      console.warn(`⚠️  Session ${sessionId} running for ${runtime / 1000 / 60}min`);
    }

    // TODO: 检查 Claude Code session context 使用量
    // （需要 Claude Code 暴露 API 或通过 /status 命令）
  }, 60000); // 每分钟检查
}
```

**优点**:
- ✅ 每个 task 从干净 context 开始
- ✅ 完成后立即释放资源
- ✅ 避免跨 task 污染

**缺点**:
- ⚠️ 无法利用 prompt caching（每次新 session）
- ⚠️ 需要管理多个 Claude Code 进程

---

#### 实现 2: Periodic Context Reset

**原理**: 单个 session 运行过程中定期压缩 context

**触发条件**:
- 每完成 5 个 tool calls
- 估算 context > 150k tokens
- Session 运行超过 30 分钟

**实现**:
```typescript
// node/src/core/claude-runner.ts（修改）
let toolCallCounter = 0;

export async function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  toolCallCounter++;

  // 每 5 次 tool call 检查一次
  if (toolCallCounter % 5 === 0) {
    await checkAndCompactContext(options.projectRoot);
  }

  // 原有逻辑
  const result = await execFileNoThrow('claude', [...args]);
  return result;
}

async function checkAndCompactContext(projectRoot: string): Promise<void> {
  // 调用 Claude Code 的 /compact 命令
  await execFileNoThrow('claude', [
    '--project', projectRoot,
    '--command', '/compact',
  ]);

  console.log('🗜️  Context compacted (periodic reset)');
}
```

**优点**:
- ✅ 保持 prompt caching 收益
- ✅ 单个 session 可长期运行

**缺点**:
- ⚠️ 依赖 Claude Code 的 `/compact` 功能
- ⚠️ 压缩可能丢失中间分析结果

---

### 策略 B: Explicit Context Budgeting（补充）

**原理**: EKET 层面显式控制传给 Claude 的信息量

#### 实现 3: Smart File Reading

**问题**: Slaver 连续 Read 多个大文件 → 快速耗尽 context

**改进**: 分段 Read + 摘要生成

```typescript
// node/src/core/smart-reader.ts（新增）
export async function smartRead(filePath: string, sessionId: string): Promise<string> {
  const stats = await fs.promises.stat(filePath);
  const sizeKB = stats.size / 1024;

  // 小文件（<10KB）: 直接读
  if (sizeKB < 10) {
    return await fs.promises.readFile(filePath, 'utf-8');
  }

  // 中文件（10-50KB）: 读 + 生成摘要
  if (sizeKB < 50) {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const summary = await summarizeContent(content, sessionId);
    return `[File: ${filePath}]\n${summary}\n\n[Full content available via explicit request]`;
  }

  // 大文件（>50KB）: 仅读前 500 行 + 结构化摘要
  const lines = (await fs.promises.readFile(filePath, 'utf-8')).split('\n');
  const preview = lines.slice(0, 500).join('\n');
  const structure = analyzeFileStructure(lines); // 函数签名、类定义等

  return `[File: ${filePath}, ${lines.length} lines]
[Preview: first 500 lines]
${preview}

[Structure]
${structure}

[Use Read tool with line range to see more]`;
}

async function summarizeContent(content: string, sessionId: string): Promise<string> {
  // 调用 Claude API 生成摘要
  const result = await runClaude({
    prompt: `Summarize this code file in 200 words:\n\n${content.slice(0, 10000)}`,
    projectRoot: process.cwd(),
    role: 'summarizer',
  });

  return result.stdout || '[Summary generation failed]';
}
```

**使用**:
```typescript
// Slaver 分析代码时
const fileContent = await smartRead('node/src/large-file.ts', sessionId);
// 而非直接 fs.readFileSync()
```

---

#### 实现 4: Tool Output Filtering

**问题**: Grep/Glob 返回大量结果 → 占用 context

**改进**: 结果分页 + 优先级排序

```typescript
// node/src/utils/tool-output-filter.ts（新增）
export function filterToolOutput(tool: string, output: string, limit: number = 50): string {
  switch (tool) {
    case 'grep':
      return filterGrepOutput(output, limit);
    case 'glob':
      return filterGlobOutput(output, limit);
    case 'ls':
      return filterLsOutput(output, limit);
    default:
      return output.slice(0, 5000); // 通用截断
  }
}

function filterGrepOutput(output: string, limit: number): string {
  const lines = output.split('\n');
  
  if (lines.length <= limit) {
    return output;
  }

  // 优先级排序：精确匹配 > 前缀匹配 > 其他
  const sorted = lines.sort((a, b) => {
    const aScore = getMatchScore(a);
    const bScore = getMatchScore(b);
    return bScore - aScore;
  });

  const topResults = sorted.slice(0, limit).join('\n');
  return `${topResults}\n\n[... ${lines.length - limit} more results, use --limit to see more]`;
}
```

---

### 策略 C: Emergency Fallback（最后防线）

#### 实现 5: 400 Error Auto-Recovery

**位置**: `node/src/core/claude-runner.ts`（修改）

```typescript
export async function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  try {
    const result = await execFileNoThrow('claude', [...args]);
    
    // 检查 400 错误
    if (result.stderr?.includes('400') && result.stderr?.includes('context')) {
      console.error('❌ Context limit exceeded (400), initiating recovery...');
      return await recoverFromContextOverflow(options);
    }

    return result;
  } catch (error) {
    // ... 其他错误处理
  }
}

async function recoverFromContextOverflow(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  console.log('🔄 Recovery Step 1: Force compact current session');
  await execFileNoThrow('claude', ['--command', '/compact']);

  console.log('🔄 Recovery Step 2: Retry with minimal context');
  // 重试时仅发送核心 prompt
  const minimalPrompt = `[Context overflow recovery]\n${options.prompt}`;

  return await execFileNoThrow('claude', [
    '--model', getModelForRole(options.role),
    '--print',
    minimalPrompt,
  ]);
}
```

---

## 三、推荐实施方案

### Phase 1: 紧急修复（1 day）

**目标**: 防止 400 导致任务失败

- [ ] **实现 5**: 400 自动恢复 + 重试机制
- [ ] **实现 2**: Periodic context reset（每 5 次 tool call）
- [ ] 用户文档：告知 "遇到 400 会自动恢复"

### Phase 2: 架构改进（3 days）

**目标**: 从源头减少 context 膨胀

- [ ] **实现 1**: Task-scoped sessions（可选，先验证收益）
- [ ] **实现 3**: Smart file reading（分段 + 摘要）
- [ ] **实现 4**: Tool output filtering（结果分页）

### Phase 3: 监控与告警（2 days）

**目标**: 可观测性

- [ ] Session 运行时间监控
- [ ] Context 使用率估算（基于 tool call 次数 × 平均 output size）
- [ ] Dashboard 展示 session 健康度

---

## 四、Claude Code 侧改进建议

**提交 Feature Request 给 Claude Code 团队**:

1. **暴露 Session Context API**
   ```bash
   claude --session-info <session-id>
   # Output: { tokens: 156000, messages: 32, last_compact: "2026-05-08T10:30:00Z" }
   ```

2. **Auto-Compact Threshold**
   ```bash
   claude --auto-compact-at 150000  # 自动压缩阈值
   ```

3. **Context Budget Flag**
   ```bash
   claude --max-context 180000 --compact-on-exceed
   ```

---

## 五、配置示例

### 5.1 EKET 配置

```yaml
# .eket/config.yml
context_management:
  # 策略选择
  strategy: "periodic_reset"  # 可选: task_scoped | periodic_reset | manual

  # Periodic Reset 配置
  periodic:
    check_interval: 5  # 每 5 次 tool call 检查
    force_compact_at: 150000  # 超过 150k tokens 强制压缩

  # Task-Scoped Session 配置
  task_scoped:
    max_session_runtime: 7200  # 2 小时后强制重启
    terminate_on_complete: true

  # Smart Reading 配置
  smart_read:
    small_file_threshold: 10  # KB
    large_file_threshold: 50  # KB
    enable_summarization: true

  # Recovery 配置
  recovery:
    retry_on_400: true
    max_retries: 2
```

### 5.2 Master/Slaver 配置

```yaml
# .eket/master-config.yml
context:
  # Master 更宽松（需要保留完整分析历史）
  max_tokens: 180000
  compact_interval: 10  # 每 10 次 tool call

# .eket/slaver-config.yml
context:
  # Slaver 更激进（单 task 聚焦）
  max_tokens: 150000
  compact_interval: 5  # 每 5 次 tool call
  smart_read: true
  tool_output_limit: 50  # Grep/Glob 最多 50 结果
```

---

## 六、测试用例

### 6.1 模拟 Context Overflow

```bash
# 测试脚本
cat > /tmp/test-overflow.sh << 'EOF'
#!/bin/bash
# 模拟 Slaver 深度分析场景

eket task:claim TASK-TEST-OVERFLOW
eket task:analyze --deep  # 触发连续 Read 10 个大文件

# 预期：不触发 400，或触发后自动恢复
EOF

bash /tmp/test-overflow.sh
```

### 6.2 Session 生命周期测试

```typescript
// node/tests/core/session-manager.test.ts
describe('Session Manager', () => {
  it('should terminate session after task completion', async () => {
    const sessionId = await startClaudeSession({
      role: 'slaver',
      taskId: 'TASK-001',
    });

    expect(activeSessions.has(sessionId)).toBe(true);

    await completeTask('TASK-001');

    expect(activeSessions.has(sessionId)).toBe(false);
  });

  it('should compact context every 5 tool calls', async () => {
    const compactSpy = jest.spyOn(global, 'execFileNoThrow');

    for (let i = 0; i < 6; i++) {
      await runClaude({ prompt: 'test', projectRoot: '.', role: 'slaver' });
    }

    expect(compactSpy).toHaveBeenCalledWith('claude', expect.arrayContaining(['--command', '/compact']));
  });
});
```

---

## 七、关键指标

| 指标 | 目标 | 当前 | 差距 |
|------|------|------|------|
| 400 错误率 | 0% | ~10%? | **需修复** |
| Session 平均 context | <150k | ~180k? | **超限** |
| Task 完成率（无中断） | >95% | <80%? | **阻塞** |
| 自动恢复成功率 | >90% | 0% | **未实现** |

---

**优先级**: P0（紧急阻塞）  
**预估工时**: Phase 1 (1d) + Phase 2 (3d) = **4 days**  
**关键依赖**: Claude Code 的 `/compact` 命令可用性
