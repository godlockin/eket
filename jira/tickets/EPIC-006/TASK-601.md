---
agent_type: backend
estimate_hours: 006
---

# TASK-601: 400 Auto-Recovery 机制

**EPIC**: EPIC-006 | **Milestone**: M0-Emergency | **优先级**: P0 | **工时**: 4h | **状态**: ready | **依赖**: 无

## 需求

在 `claude-runner.ts` 实现 400 错误自动恢复机制：catch 400 → 执行 `/compact` → retry 原请求。

## 验收标准

- **AC-1**: Given `claude-runner.ts` 调用 Claude Code, When API 返回 400 错误, Then 识别错误类型（context_length_exceeded / invalid_request / validation / unknown）
- **AC-2**: Given 错误类型为 `context_length_exceeded`, When 触发 recovery, Then 执行 `claude --command /compact` 命令；**其他 400 类型正常抛出**（不自动恢复）
- **AC-3**: Given `/compact` 执行成功, When retry 原请求, Then 任务继续执行（返回正常 result）
- **AC-4**: Given `/compact` 失败（exit code ≠ 0）或仍返回 400, When Nuclear Option 触发, Then 保存 task context → kill session → 重启新 session → 仅带最小 prompt
- **AC-5**: Given Nuclear Option 执行, When task context 保存, Then `.eket/recovery/task-<id>-context.md` 包含：taskId, prompt, last_5_messages_summary
- **AC-6**: Given 任意 400 错误（含恢复成功/失败）, When 写入日志, Then `.eket/logs/context-overflow.log` 包含：timestamp, sessionId, taskId, error_type, recovery_strategy (compact_retry | nuclear_restart | none), result (recovered | failed)
- **AC-7**: Given 实验验证, When session 达到 200k tokens 后执行 `/compact`, Then 记录是否成功（验证 Claude Code 对 /compact 的特殊处理）

## 技术方案

### 修改位置
- `node/src/core/claude-runner.ts`（修改 `runClaude` 函数）
- `.eket/logs/context-overflow.log`（新增）

### 核心逻辑
```typescript
export async function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  try {
    const result = await execFileNoThrow('claude', [...args]);
    
    // 检查 400 错误
    if (result.stderr?.includes('400')) {
      return await handle400Error(result, options);
    }
    
    return result;
  } catch (error) {
    throw error;
  }
}

async function handle400Error(result: any, options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const errorType = identifyErrorType(result.stderr);
  
  switch (errorType) {
    case 'context_length_exceeded':
      console.error('❌ 400: Context length exceeded');
      await logContextOverflow(options.sessionId, options.taskId, errorType, 'detected');
      return await recoverFromContextOverflow(options);
      
    case 'invalid_request_error':
    case 'validation_error':
    case 'unknown_400_error':
      // 其他 400 错误不自动恢复，直接抛出
      throw new Error(`Claude API 400 (${errorType}): ${result.stderr}`);
  }
}

function identifyErrorType(stderr: string): string {
  if (stderr.includes('context_length') || stderr.includes('maximum context')) {
    return 'context_length_exceeded';
  }
  if (stderr.includes('invalid_request')) {
    return 'invalid_request_error';
  }
  if (stderr.includes('validation')) {
    return 'validation_error';
  }
  return 'unknown_400_error';
}

async function recoverFromContextOverflow(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  // Strategy 1: 尝试 /compact
  console.log('🔄 Recovery Strategy 1: Attempting /compact...');
  const compactResult = await execFileNoThrow('claude', ['--command', '/compact']);
  
  if (compactResult.exitCode === 0) {
    console.log('✅ /compact successful, retrying original request...');
    const retryResult = await execFileNoThrow('claude', [...args]);
    
    if (!retryResult.stderr?.includes('400')) {
      await logContextOverflow(options.sessionId, options.taskId, 'context_length', 'compact_retry_success');
      return retryResult;
    }
  }
  
  // Strategy 2: Nuclear Option（/compact 失败或 retry 仍 400）
  console.warn('⚠️  /compact insufficient, initiating Nuclear Option...');
  console.log('🔄 Recovery Strategy 2: Session restart...');
  
  // 1. 保存 task context
  await saveTaskContext(options);
  
  // 2. Kill session（如果有 sessionId）
  if (options.sessionId) {
    await killSession(options.sessionId);
  }
  
  // 3. 启动新 session，最小 prompt
  const minimalPrompt = `[Context Overflow Recovery - Session Restarted]

Task: ${options.taskId || 'unknown'}
Instruction: ${options.prompt}

⚠️  Previous context exceeded limit and was cleared.
📁 Context saved to: .eket/recovery/task-${options.taskId}-context.md

Continue from last checkpoint.
`;

  const nuclearResult = await execFileNoThrow('claude', [
    '--model', getModelForRole(options.role),
    '--print',
    minimalPrompt,
  ]);
  
  await logContextOverflow(options.sessionId, options.taskId, 'context_length', 'nuclear_restart');
  return nuclearResult;
}

async function saveTaskContext(options: ClaudeRunOptions): Promise<void> {
  const recoveryPath = path.join(
    options.projectRoot,
    '.eket/recovery',
    `task-${options.taskId}-context.md`
  );
  
  await fs.mkdir(path.dirname(recoveryPath), { recursive: true });
  
  const content = `# Task Context Recovery

**Task ID**: ${options.taskId}
**Timestamp**: ${new Date().toISOString()}
**Reason**: Context overflow (200k tokens exceeded)

## Last Prompt
\`\`\`
${options.prompt}
\`\`\`

## Recovery Instructions
Session was restarted due to context overflow. Previous analysis is lost.

Refer to ticket file for original requirements:
- jira/tickets/${options.taskId}/
`;

  await fs.writeFile(recoveryPath, content);
  console.log(`💾 Task context saved: ${recoveryPath}`);
}

async function killSession(sessionId: string): Promise<void> {
  // TODO: 实现 session kill 逻辑（如果 Claude Code 支持）
  console.log(`🛑 Killing session ${sessionId}...`);
}

async function logContextOverflow(
  sessionId: string | undefined,
  taskId: string | undefined,
  errorType: string,
  result: string
): Promise<void> {
  const logPath = path.join(process.cwd(), '.eket', 'logs', 'context-overflow.log');
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  
  const entry = `[${new Date().toISOString()}] sessionId=${sessionId || 'unknown'}, taskId=${taskId || 'unknown'}, error_type=${errorType}, recovery=${result}\n`;
  await fs.appendFile(logPath, entry);
}
```

## 测试策略

- **unit**: `tests/core/claude-runner-recovery.test.ts`
  - Mock `execFileNoThrow` 返回 400 错误
  - 验证调用 `/compact` 命令
  - 验证 retry 逻辑
  - 验证日志写入
  
- **integration**: 实际触发 400 错误场景
  - 模拟长对话（50+ 轮）
  - 验证 auto-recovery 成功率
  
- **manual**: 
  ```bash
  # 模拟 400 错误
  export MOCK_400_ERROR=true
  eket task:claim TASK-TEST
  # 观察 recovery 流程
  cat .eket/logs/context-overflow.log
  ```

## observability
- logs: ["context.overflow.detected", "context.recovery.success", "context.recovery.failed"]
- metrics: ["context.overflow.count", "context.recovery.success_rate"]

## rollback_plan
Revert PR。无数据变更，无状态依赖，可安全回滚。

---

**类型**: bugfix  
**技能要求**: Node.js / TypeScript / Error Handling  
**依赖**: 无  
**assigned_experts**: backend-engineer
