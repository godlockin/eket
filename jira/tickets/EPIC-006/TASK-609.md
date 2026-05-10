---
id: TASK-609
agent_type: backend
estimate_hours: 006
---

# TASK-609: Context Config Optimization（配置文件精简）

**EPIC**: EPIC-006 | **Milestone**: M1-Optimization | **优先级**: P1 | **工时**: 6h | **状态**: done | **依赖**: 无

## 需求

精简 CLAUDE.md + SKILL.md 配置文件，减少 SessionStart context 注入开销。

**优化目标**:
1. 项目 CLAUDE.md: 124 行 → 50 行（移除重复红线/分支策略/命令清单）
2. SKILL.md: 4.3KB → 2.7KB（替换为 INDEX 版本）
3. 全局 CLAUDE.md: 130 行 → 100 行（精简示例/说明）
4. RTK.md: 合并到 CLAUDE.md（消除文件开销）

**预期节省**: -4.6k tokens (-51%)

## 验收标准

- [x] **AC-1**: 项目 CLAUDE.md 精简到 50 行，保留身份入口 + 关键路径
- [x] **AC-2**: SKILL.md 替换为 SKILL-INDEX.md（2.7KB）
- [x] **AC-3**: 全局 CLAUDE.md 精简到 100 行
- [x] **AC-4**: RTK.md 合并到 CLAUDE.md，原文件归档
- [x] **AC-5**: 所有修改备份到 .bak 文件
- [x] **AC-6**: 经验教训沉淀到 confluence/memory/
- [x] **AC-7**: SessionStart 开销降低 > 15%

## 实施结果

**执行时间**: 2026-05-09 23:30-23:40

**文件变更**:
- `CLAUDE.md`: 124 → 50 行 (-60%)
- `~/.claude/CLAUDE.md`: 130 → 100 行 (-23%)
- `~/.claude/skills/eket/SKILL.md`: 4.3KB → 2.7KB (-38%)
- `~/.claude/RTK.md`: 归档

**优化效果**:
- 配置文件: 9k → 4k tokens (-51%)
- SessionStart: 25k → 20k tokens (-20%)

**文档产出**:
- `TASK-609-optimization-log.md`
- `TASK-609-optimization-summary.md`
- `TASK-609-FINAL-REPORT.md`
- `confluence/memory/context-optimization-lessons-2026-05-10.md`

**Git commits**:
- `02df37016`: feat(context): P0 optimization -4.6k tokens
- `c1ecd7882`: docs(context): 同步 SKILL.md + 沉淀经验教训
- `2c16dd808`: docs(TASK-603): 最终报告输出

**状态**: ✅ done (2026-05-10)

---

## 相关文件

- `confluence/memory/context-optimization-lessons-2026-05-10.md` - 经验教训
- `TASK-609-FINAL-REPORT.md` - 执行报告

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
