---
agent_type: backend
estimate_hours: 006
status: ready
priority: P0
created_at: 2026-05-09T10:00:00+08:00
---

# TASK-603: Error Logging + Session Snapshot

**EPIC**: EPIC-006 | **Milestone**: M0-Emergency | **优先级**: P0 | **工时**: 3h | **状态**: ready | **依赖**: TASK-601

## 需求

400 错误发生时，自动写入错误日志（`.eket/logs/context-overflow.log`）+ 保存 session 状态快照（`.eket/debug/session-<id>-overflow.json`）。

## 验收标准

- **AC-1**: Given 400 错误触发, When `logContextOverflow()` 调用, Then `.eket/logs/context-overflow.log` 新增一行：`[timestamp] sessionId=X, taskId=Y, estimated_tokens=Z, result=recovered|failed`
- **AC-2**: Given 400 错误触发, When `saveSessionSnapshot()` 调用, Then `.eket/debug/session-<id>-overflow.json` 包含：sessionId, timestamp, estimated_tokens, last_20_messages（metadata only，不含完整 content）, tool_call_sequence
- **AC-3**: Given `.eket/logs/` 或 `.eket/debug/` 目录不存在, When 首次写入, Then 自动创建目录（`mkdir -p`）
- **AC-4**: Given 读取 context-overflow.log, When 执行 `eket logs:context-overflow`, Then 解析并展示：总错误次数、恢复成功率、最近 10 条记录
- **AC-5**: Given session snapshot 文件, When 文件大小 > 10MB, Then 仅保存 metadata（不含完整 message content）

## 技术方案

### 新增文件
- `node/src/core/context-logger.ts`
- `node/src/commands/logs.ts`（新增 `logs:context-overflow` 子命令）

### 核心实现
```typescript
// node/src/core/context-logger.ts
import * as fs from 'fs/promises';
import * as path from 'path';

interface ContextOverflowLog {
  timestamp: string;
  sessionId: string;
  taskId?: string;
  estimatedTokens: number;
  result: 'recovered' | 'compact_failed' | 'retry_failed';
}

interface SessionSnapshot {
  sessionId: string;
  timestamp: string;
  estimatedTokens: number;
  lastMessages: Array<{
    role: string;
    contentLength: number;
    timestamp?: string;
  }>;
  toolCallSequence: string[];
}

export async function logContextOverflow(
  sessionId: string,
  taskId: string | undefined,
  estimatedTokens: number,
  result: 'recovered' | 'compact_failed' | 'retry_failed'
): Promise<void> {
  const logPath = path.join(process.cwd(), '.eket', 'logs', 'context-overflow.log');
  
  // 确保目录存在
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  
  const entry = `[${new Date().toISOString()}] sessionId=${sessionId}, taskId=${taskId || 'unknown'}, estimated_tokens=${estimatedTokens}, result=${result}\n`;
  
  await fs.appendFile(logPath, entry);
}

export async function saveSessionSnapshot(
  sessionId: string,
  estimatedTokens: number,
  messages: any[]
): Promise<void> {
  const debugPath = path.join(process.cwd(), '.eket', 'debug', `session-${sessionId}-overflow.json`);
  
  await fs.mkdir(path.dirname(debugPath), { recursive: true });
  
  // 仅保存 metadata，不含完整 content
  const snapshot: SessionSnapshot = {
    sessionId,
    timestamp: new Date().toISOString(),
    estimatedTokens,
    lastMessages: messages.slice(-20).map(m => ({
      role: m.role,
      contentLength: JSON.stringify(m.content || '').length,
      timestamp: m.timestamp,
    })),
    toolCallSequence: messages
      .filter(m => m.role === 'tool')
      .map(m => m.tool_name || 'unknown'),
  };
  
  await fs.writeFile(debugPath, JSON.stringify(snapshot, null, 2));
  console.log(`💾 Session snapshot saved: ${debugPath}`);
}
```

### 命令实现
```typescript
// node/src/commands/logs.ts
export async function logsContextOverflow(): Promise<void> {
  const logPath = path.join(process.cwd(), '.eket', 'logs', 'context-overflow.log');
  
  if (!fs.existsSync(logPath)) {
    console.log('ℹ️  No context overflow logs found');
    return;
  }
  
  const content = await fs.promises.readFile(logPath, 'utf-8');
  const lines = content.trim().split('\n');
  
  const stats = {
    total: lines.length,
    recovered: lines.filter(l => l.includes('result=recovered')).length,
    failed: lines.filter(l => l.includes('failed')).length,
  };
  
  console.log(`\n📊 Context Overflow Statistics\n`);
  console.log(`Total errors: ${stats.total}`);
  console.log(`Recovered: ${stats.recovered} (${((stats.recovered / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`\n📝 Recent 10 entries:\n`);
  console.log(lines.slice(-10).join('\n'));
}
```

## 测试策略

- **unit**: `tests/core/context-logger.test.ts`
  - 验证 log 写入格式
  - 验证目录自动创建
  - 验证 snapshot size limit
  
- **integration**: 
  - 触发 400 → 验证 log 文件存在
  - 验证 snapshot JSON 可解析
  - 执行 `eket logs:context-overflow` → 验证统计正确

## observability
- logs: ["context.log.written", "context.snapshot.saved"]
- files: [".eket/logs/context-overflow.log", ".eket/debug/session-*.json"]

## rollback_plan
Revert PR。仅新增日志，无业务逻辑变更。

---

**类型**: feature  
**技能要求**: Node.js / TypeScript / File I/O  
**依赖**: TASK-601  
**assigned_experts**: backend-engineer
