# 任务分析报告：TASK-601

**Slaver**: Slaver-backend-001  
**分析时间**: 2026-05-09 (current)  
**预计工时**: 4 小时

---

## 1. 需求理解

**核心目标**: 在 `claude-runner.ts` 实现 Claude Code 400 错误（context overflow）自动恢复机制。

**关键约束**:
- **精准识别**: 仅处理 `context_length_exceeded` 错误，其他 400 错误（invalid_request / validation）正常抛出
- **降级策略**: 2 层防御
  - Strategy 1: 执行 `/compact` + retry 原请求
  - Strategy 2: Nuclear Option（save context → kill session → restart with minimal prompt）
- **完整日志**: 所有 400 错误（含恢复过程）记录到 `.eket/logs/context-overflow.log`

**验收标准**: 7 个 AC（见 ticket），核心验收点：
1. AC-1: 精准错误分类（4 种 400 类型识别）
2. AC-2: 仅 `context_length_exceeded` 触发 recovery，其他类型抛出
3. AC-3: `/compact` 成功 → retry 成功 → 任务继续
4. AC-4: `/compact` 失败 → Nuclear Option → session 重启
5. AC-5: Nuclear Option 保存 task context 到 `.eket/recovery/`
6. AC-6: 所有 400 写日志（含 error_type / recovery_strategy / result）
7. AC-7: 实验验证 `/compact` 可用性（达 200k tokens 后测试）

---

## 2. 技术方案

### 2.1 架构分层

```
┌─────────────────────────────────────────────┐
│  claude-runner.ts (修改)                     │
│  - runClaude(): 原入口，添加 400 catch 逻辑   │
│  - handle400Error(): 新增，错误分类 + 路由    │
│  - recoverFromContextOverflow(): 新增，恢复策略│
├─────────────────────────────────────────────┤
│  error-identifier.ts (新增)                  │
│  - identifyErrorType(): 从 stderr 识别类型    │
├─────────────────────────────────────────────┤
│  recovery-logger.ts (新增)                   │
│  - logContextOverflow(): 写日志               │
│  - saveTaskContext(): Nuclear Option 用       │
├─────────────────────────────────────────────┤
│  .eket/logs/context-overflow.log (新增)       │
│  .eket/recovery/task-<id>-context.md (新增)   │
└─────────────────────────────────────────────┘
```

### 2.2 核心逻辑流程

```typescript
// claude-runner.ts
export async function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const args = [...]; // 原有逻辑

  const result = await execFileNoThrow('claude', args, {
    cwd: options.projectRoot,
  });

  // NEW: 检查 400 错误
  if (result.status !== 0 && result.stderr?.includes('400')) {
    return await handle400Error(result, options, args);
  }

  return {
    success: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    modelUsed: modelName,
  };
}

async function handle400Error(
  result: any,
  options: ClaudeRunOptions,
  originalArgs: string[]
): Promise<ClaudeRunResult> {
  const errorType = identifyErrorType(result.stderr);

  // 仅处理 context_length_exceeded
  if (errorType !== 'context_length_exceeded') {
    // 其他 400 错误正常抛出
    await logContextOverflow({
      errorType,
      recoveryStrategy: 'none',
      result: 'rejected',
      projectRoot: options.projectRoot,
    });
    
    throw new Error(`Claude API 400 (${errorType}): ${result.stderr}`);
  }

  // 触发恢复流程
  console.error('❌ 400: Context length exceeded, initiating recovery...');
  await logContextOverflow({
    errorType: 'context_length_exceeded',
    recoveryStrategy: 'detected',
    result: 'initiating',
    projectRoot: options.projectRoot,
  });

  return await recoverFromContextOverflow(options, originalArgs);
}
```

### 2.3 恢复策略实现

```typescript
async function recoverFromContextOverflow(
  options: ClaudeRunOptions,
  originalArgs: string[]
): Promise<ClaudeRunResult> {
  
  // Strategy 1: /compact + retry
  console.log('🔄 Recovery Strategy 1: Attempting /compact...');
  const compactResult = await execFileNoThrow('claude', ['--command', '/compact'], {
    cwd: options.projectRoot,
  });

  if (compactResult.status === 0) {
    console.log('✅ /compact successful, retrying original request...');
    const retryResult = await execFileNoThrow('claude', originalArgs, {
      cwd: options.projectRoot,
    });

    if (retryResult.status === 0 || !retryResult.stderr?.includes('400')) {
      await logContextOverflow({
        errorType: 'context_length_exceeded',
        recoveryStrategy: 'compact_retry',
        result: 'recovered',
        projectRoot: options.projectRoot,
      });

      return {
        success: true,
        stdout: retryResult.stdout,
        stderr: retryResult.stderr,
        modelUsed: options.model ? getModelDisplayName(options.model) : 'unknown',
      };
    }
  }

  // Strategy 2: Nuclear Option
  console.warn('⚠️  /compact insufficient, initiating Nuclear Option...');
  console.log('🔄 Recovery Strategy 2: Session restart...');

  // 1. 保存 task context
  await saveTaskContext({
    projectRoot: options.projectRoot,
    taskId: getTaskIdFromProfile(options.projectRoot),
    prompt: options.prompt,
  });

  // 2. Kill session（如果有 session ID）
  // TODO: Claude Code CLI 可能不支持显式 kill，暂时跳过

  // 3. 启动新 session，最小 prompt
  const minimalPrompt = `[Context Overflow Recovery - Session Restarted]

Task: ${getTaskIdFromProfile(options.projectRoot) || 'unknown'}
Instruction: ${options.prompt}

⚠️  Previous context exceeded limit and was cleared.
📁 Context saved to: .eket/recovery/task-xxx-context.md

Continue from last checkpoint.
`;

  const nuclearResult = await execFileNoThrow(
    'claude',
    ['--model', options.model ? getModelDisplayName(options.model) : 'sonnet', '--print', minimalPrompt],
    { cwd: options.projectRoot }
  );

  await logContextOverflow({
    errorType: 'context_length_exceeded',
    recoveryStrategy: 'nuclear_restart',
    result: nuclearResult.status === 0 ? 'recovered' : 'failed',
    projectRoot: options.projectRoot,
  });

  return {
    success: nuclearResult.status === 0,
    stdout: nuclearResult.stdout,
    stderr: nuclearResult.stderr,
    modelUsed: options.model ? getModelDisplayName(options.model) : 'sonnet',
  };
}
```

### 2.4 错误识别实现

```typescript
// node/src/core/error-identifier.ts (新增)
export type Error400Type = 
  | 'context_length_exceeded'
  | 'invalid_request_error'
  | 'validation_error'
  | 'unknown_400_error';

export function identifyErrorType(stderr: string): Error400Type {
  const lowerStderr = stderr.toLowerCase();

  // 检查 context 相关关键字
  if (
    lowerStderr.includes('context_length') ||
    lowerStderr.includes('maximum context') ||
    lowerStderr.includes('context limit') ||
    lowerStderr.includes('too many tokens')
  ) {
    return 'context_length_exceeded';
  }

  // 检查 invalid_request
  if (lowerStderr.includes('invalid_request')) {
    return 'invalid_request_error';
  }

  // 检查 validation
  if (lowerStderr.includes('validation')) {
    return 'validation_error';
  }

  return 'unknown_400_error';
}
```

### 2.5 日志 + Context 保存

```typescript
// node/src/core/recovery-logger.ts (新增)
import * as fs from 'fs/promises';
import * as path from 'path';

interface LogEntry {
  errorType: string;
  recoveryStrategy: 'detected' | 'compact_retry' | 'nuclear_restart' | 'none';
  result: 'initiating' | 'recovered' | 'failed' | 'rejected';
  projectRoot: string;
  sessionId?: string;
  taskId?: string;
}

export async function logContextOverflow(entry: LogEntry): Promise<void> {
  const logPath = path.join(entry.projectRoot, '.eket', 'logs', 'context-overflow.log');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  const timestamp = new Date().toISOString();
  const sessionId = entry.sessionId || 'unknown';
  const taskId = entry.taskId || readTaskIdFromProfile(entry.projectRoot);

  const logLine = `[${timestamp}] sessionId=${sessionId}, taskId=${taskId}, error_type=${entry.errorType}, recovery=${entry.recoveryStrategy}, result=${entry.result}\n`;

  await fs.appendFile(logPath, logLine);
}

export async function saveTaskContext(opts: {
  projectRoot: string;
  taskId: string;
  prompt: string;
}): Promise<void> {
  const recoveryPath = path.join(
    opts.projectRoot,
    '.eket/recovery',
    `task-${opts.taskId}-context.md`
  );

  await fs.mkdir(path.dirname(recoveryPath), { recursive: true });

  const content = `# Task Context Recovery

**Task ID**: ${opts.taskId}
**Timestamp**: ${new Date().toISOString()}
**Reason**: Context overflow (200k tokens exceeded)

## Last Prompt
\`\`\`
${opts.prompt}
\`\`\`

## Recovery Instructions
Session was restarted due to context overflow. Previous analysis is lost.

Refer to ticket file for original requirements:
- jira/tickets/EPIC-006/${opts.taskId}/
`;

  await fs.writeFile(recoveryPath, content);
  console.log(`💾 Task context saved: ${recoveryPath}`);
}

function readTaskIdFromProfile(projectRoot: string): string {
  try {
    const profilePath = path.join(projectRoot, '.eket', 'state', 'agent_profile.yml');
    const content = require('fs').readFileSync(profilePath, 'utf-8');
    const match = content.match(/^current_ticket:\s*(.+)$/m);
    return match ? match[1].trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}
```

---

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| `node/src/core/claude-runner.ts` | **高** | 修改核心函数 `runClaude()`，增加错误处理分支 |
| `node/src/core/error-identifier.ts` | 低 | 新增文件，独立模块 |
| `node/src/core/recovery-logger.ts` | 低 | 新增文件，独立模块 |
| `.eket/logs/` | 低 | 新增日志目录 |
| `.eket/recovery/` | 低 | 新增 recovery context 存储 |
| 现有 Master/Slaver 调用路径 | **中** | 所有调用 `runClaude()` 的地方自动受益 |

**风险评估**:
- ⚠️ `/compact` 命令在 Claude Code 中可能无效（需实验验证 AC-7）
- ⚠️ Nuclear Option 需要 session kill，Claude CLI 可能不支持显式 kill
- ✅ 错误分类逻辑基于关键字匹配，可能有误判（通过日志监控验证）

---

## 4. 任务拆解

| 子任务 | 预估工时 | 优先级 | 说明 |
|--------|----------|--------|------|
| 1. 实现 `error-identifier.ts` | 30min | P0 | 错误分类基础 |
| 2. 实现 `recovery-logger.ts` | 30min | P0 | 日志 + context 保存 |
| 3. 修改 `claude-runner.ts` | 1.5h | P0 | 核心恢复逻辑 |
| 4. 编写单元测试 | 1h | P0 | Mock 400 场景 |
| 5. 本地验证 AC-1～AC-6 | 30min | P0 | 手动触发验证 |
| 6. 实验验证 AC-7 | 30min | P1 | 实际触发 200k tokens |

**总计**: 4h

---

## 5. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| `/compact` 命令不可用或无效 | 中 | 高 | Nuclear Option 作为兜底；AC-7 实验验证 |
| 错误识别误判（关键字不全） | 中 | 中 | 日志记录所有原始 stderr，后续迭代补充规则 |
| Nuclear Option kill session 失败 | 低 | 中 | 降级为"建议重启"，不强制 kill |
| 恢复后任务状态丢失 | 低 | 高 | 保存 task context 到 `.eket/recovery/`，含 prompt 快照 |

---

## 6. 测试策略

### 6.1 Unit Tests

**位置**: `node/tests/core/claude-runner-recovery.test.ts`

**测试用例**:
1. **错误识别测试**
   - Given stderr 含 "context_length" → expect `context_length_exceeded`
   - Given stderr 含 "invalid_request" → expect `invalid_request_error`
   - Given stderr 含 "validation" → expect `validation_error`
   - Given stderr 无已知关键字 → expect `unknown_400_error`

2. **恢复策略测试**
   - Mock `execFileNoThrow` 返回 400 → 验证调用 `/compact`
   - Mock `/compact` 成功 → 验证 retry 原请求
   - Mock retry 成功 → 验证返回 `success: true`
   - Mock `/compact` 失败 → 验证触发 Nuclear Option

3. **日志测试**
   - 验证 `.eket/logs/context-overflow.log` 写入正确格式
   - 验证 log 包含 timestamp / taskId / error_type / recovery / result

4. **Context 保存测试**
   - 验证 `.eket/recovery/task-xxx-context.md` 创建
   - 验证文件包含 taskId / prompt / timestamp

### 6.2 Manual Validation

**AC-1～AC-6 验证流程**:
```bash
# 1. 模拟 context_length_exceeded
export MOCK_400_ERROR=context_length
eket task:claim TASK-TEST
# 预期：触发 recovery，任务继续

# 2. 模拟 invalid_request
export MOCK_400_ERROR=invalid_request
eket task:claim TASK-TEST
# 预期：抛出错误，不恢复

# 3. 验证日志
cat .eket/logs/context-overflow.log
# 预期：2 条记录，recovery=compact_retry + none

# 4. 验证 recovery context
ls .eket/recovery/
cat .eket/recovery/task-*-context.md
```

**AC-7 实验验证**:
```bash
# 构造长对话场景（50+ 轮 Read 大文件）
# 观察是否触发 400
# 观察 /compact 是否生效
```

---

## 7. 验收自检命令

根据 Nyquist Rule，每条 AC 必须附带自动化命令：

**AC-1**: 错误识别
```bash
npm test -- --testPathPattern=error-identifier.test.ts | grep "PASS"
```

**AC-2**: 仅 context_length 恢复
```bash
npm test -- --testPathPattern=claude-runner-recovery.test.ts -t "should only recover context_length" | grep "PASS"
```

**AC-3**: compact + retry 成功
```bash
npm test -- --testPathPattern=claude-runner-recovery.test.ts -t "compact success" | grep "PASS"
```

**AC-4**: Nuclear Option
```bash
npm test -- --testPathPattern=claude-runner-recovery.test.ts -t "nuclear option" | grep "PASS"
```

**AC-5**: Context 保存
```bash
npm test -- --testPathPattern=recovery-logger.test.ts -t "saveTaskContext" | grep "PASS"
```

**AC-6**: 日志完整性
```bash
npm test -- --testPathPattern=recovery-logger.test.ts -t "logContextOverflow" | grep "PASS"
```

**AC-7**: 手动实验（无自动化）
```bash
# 需人工验证，记录到 ticket 复盘中
echo "Manual experiment required - see ticket retrospective"
```

---

## 8. 依赖确认

- ✅ 无外部依赖变更
- ✅ 仅新增 2 个 `.ts` 文件（error-identifier / recovery-logger）
- ✅ `execFileNoThrow` 已存在（`node/src/utils/execFileNoThrow.ts`）
- ⚠️ 依赖 Claude Code CLI 的 `--command /compact` 能力（AC-7 验证）

---

**分析报告完成，等待 Master 审批后开始开发。**
