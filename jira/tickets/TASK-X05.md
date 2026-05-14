# TASK-X05: Master 读取 Checkpoint 分支状态

**ID**: TASK-X05  
**Epic**: EPIC-008  
**优先级**: P0  
**预估**: 4h  
**依赖**: TASK-X04 (需 checkpoint 分支存在)  
**Agent Type**: backend  
**状态**: ready

---

## Goal

Master 能通过 `eket task:status <task-id>` 读取 remote checkpoint 分支，显示 Slaver 最新进度（无需读 transcript），支持跨 session 监控。

---

## Context

**M1 现状**: `task:status` 仅显示 ticket 元数据（title, priority），无运行时进度  
**X04 输出**: Checkpoint 分支已推送到 remote，包含 progress.md + commit metadata  
**M2 目标**: Master 读 remote checkpoint → 显示进度 → 决定重派 vs 继续

**使用场景**:
1. Master 检查 5 个进行中 task 的完成度
2. Slaver 超时后，Master 查看最后完成的 AC
3. 新 Slaver 接手前，Master 确认 checkpoint 状态

---

## Acceptance Criteria

### AC-1: 检测 checkpoint 分支存在性
**Given**: TASK-640 的 checkpoint 分支存在于 remote  
**When**: Master 运行 `eket task:status TASK-640`  
**Then**:
- 检测 `origin/checkpoint/TASK-640` 分支存在
- 显示分支状态：`✅ Checkpoint available` 或 `⚠️ No checkpoint (new task)`

**验证**:
```bash
# Setup: 创建 checkpoint 分支
git checkout -b checkpoint/TASK-640
git push origin checkpoint/TASK-640

# Test
eket task:status TASK-640
# 输出包含: "✅ Checkpoint: origin/checkpoint/TASK-640 (last updated: 2h ago)"
```

---

### AC-2: 显示最后 commit 时间与 message
**Given**: Checkpoint 分支有 3 个 commit  
**When**: Master 运行 `eket task:status TASK-640`  
**Then**:
- 显示最后 commit 的：
  - 时间（相对时间，如 "2h ago"）
  - Phase（从 commit message 提取）
  - Slaver ID
  - Commit SHA (short)

**输出格式**:
```
TASK-640: Implement authentication API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: in_progress
Assignee: slaver-005

✅ Checkpoint: origin/checkpoint/TASK-640
   Last Update: 2h 15m ago (2026-05-14 13:30)
   Phase: ac_1_done
   Slaver: slaver-005
   Commit: e3b0c44

Recent Progress:
   - [x] analysis_done (4h ago)
   - [x] ac_1_done (2h ago)
   - [ ] ac_2 (current)
```

**验证**:
```bash
eket task:status TASK-640 | grep "Phase:"
# 输出: "Phase: ac_1_done"
```

---

### AC-3: 对比 local vs remote checkpoint
**Given**: Local Slaver 有 progress.md，但未 push  
**When**: Master 运行 `eket task:status TASK-640`  
**Then**:
- 对比 local `progress.md` last update time vs remote commit time
- 显示状态：
  - `✅ Synced` — local = remote
  - `⚠️ Local ahead` — local 更新，但未 push（可能 Slaver 仍在执行）
  - `❌ Diverged` — local 与 remote 不一致（异常，需人工检查）

**验证**:
```bash
# Setup: Local progress.md 更新但未 commit
echo "New checkpoint" >> jira/tickets/TASK-640/progress.md

# Test
eket task:status TASK-640
# 输出包含: "⚠️ Local ahead of remote (uncommitted changes)"
```

---

### AC-4: 彩色输出增强可读性
**Given**: Terminal 支持 ANSI 色彩  
**When**: Master 运行 `eket task:status TASK-640`  
**Then**:
- 使用色彩区分状态：
  - ✅ 绿色（synced）
  - ⚠️ 黄色（local ahead）
  - ❌ 红色（diverged / no checkpoint）
  - Phase 灰色（次要信息）

**验证**:
```bash
eket task:status TASK-640 --no-color  # 禁用色彩模式（CI 环境）
# 验证无 ANSI escape codes
```

---

## Implementation Sketch

### 1. 扩展 task:status 命令

```typescript
// node/src/commands/task-status.ts

import { execFile } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

export async function registerTaskStatus(program: Command): Promise<void> {
  program
    .command('task:status <task-id>')
    .description('Show task progress (includes checkpoint status)')
    .option('--no-color', 'Disable color output')
    .action(async (taskId: string, options: { color?: boolean }) => {
      const status = await getTaskStatus(taskId);
      printTaskStatus(status, options.color ?? true);
    });
}

interface TaskStatus {
  taskId: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  assignee: string | null;
  checkpoint: CheckpointStatus | null;
  localProgress: LocalProgressStatus | null;
}

interface CheckpointStatus {
  exists: boolean;
  branch: string;
  lastCommit: {
    sha: string;
    message: string;
    timestamp: Date;
    phase: string;
    slaverId: string;
  } | null;
}

interface LocalProgressStatus {
  exists: boolean;
  lastUpdate: Date | null;
  currentPhase: string | null;
}

async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  // 1. Read ticket metadata
  const ticketPath = path.join(process.cwd(), `jira/tickets/${taskId}/${taskId}.md`);
  const ticketMeta = await parseTicketMetadata(ticketPath);

  // 2. Check checkpoint branch
  const checkpointStatus = await getCheckpointStatus(taskId);

  // 3. Check local progress.md
  const localProgress = await getLocalProgress(taskId);

  return {
    taskId,
    title: ticketMeta.title,
    status: ticketMeta.status,
    assignee: ticketMeta.assignee,
    checkpoint: checkpointStatus,
    localProgress,
  };
}

async function getCheckpointStatus(taskId: string): Promise<CheckpointStatus> {
  const branch = `checkpoint/${taskId}`;

  try {
    // 1. Fetch latest checkpoint branch
    await execFileAsync('git', ['fetch', 'origin', branch], {
      cwd: process.cwd(),
      timeout: 5000,
    });

    // 2. Get last commit info
    const { stdout: logOutput } = await execFileAsync(
      'git',
      ['log', `origin/${branch}`, '--format=%H|%s|%aI', '-1'],
      { cwd: process.cwd() }
    );

    const [sha, message, timestamp] = logOutput.trim().split('|');

    // 3. Parse commit message (extract phase and slaver ID)
    const phaseMatch = message.match(/- (\w+)/);
    const slaverMatch = message.match(/\[(\S+)\]/);

    return {
      exists: true,
      branch: `origin/${branch}`,
      lastCommit: {
        sha: sha.substring(0, 7),
        message,
        timestamp: new Date(timestamp),
        phase: phaseMatch?.[1] || 'unknown',
        slaverId: slaverMatch?.[1] || 'unknown',
      },
    };
  } catch (error) {
    // Branch doesn't exist or fetch failed
    return {
      exists: false,
      branch: `origin/${branch}`,
      lastCommit: null,
    };
  }
}

async function getLocalProgress(taskId: string): Promise<LocalProgressStatus> {
  const progressPath = path.join(process.cwd(), `jira/tickets/${taskId}/progress.md`);

  try {
    const content = await fs.readFile(progressPath, 'utf-8');
    const parseResult = parseProgressMarkdown(content, taskId);

    if (!parseResult.success || !parseResult.data) {
      return { exists: false, lastUpdate: null, currentPhase: null };
    }

    return {
      exists: true,
      lastUpdate: new Date(parseResult.data.lastUpdate),
      currentPhase: parseResult.data.currentPhase,
    };
  } catch {
    return { exists: false, lastUpdate: null, currentPhase: null };
  }
}

function printTaskStatus(status: TaskStatus, useColor: boolean): void {
  const c = useColor ? chalk : noColor; // Fallback for --no-color

  console.log('');
  console.log(c.bold(`${status.taskId}: ${status.title}`));
  console.log('━'.repeat(60));
  console.log(`Status: ${c.cyan(status.status)}`);
  console.log(`Assignee: ${status.assignee || c.gray('(unassigned)')}`);
  console.log('');

  // Checkpoint status
  if (status.checkpoint?.exists && status.checkpoint.lastCommit) {
    const commit = status.checkpoint.lastCommit;
    const timeAgo = formatTimeAgo(commit.timestamp);

    console.log(c.green('✅ Checkpoint:'), c.gray(status.checkpoint.branch));
    console.log(`   Last Update: ${c.yellow(timeAgo)} (${commit.timestamp.toLocaleString()})`);
    console.log(`   Phase: ${c.cyan(commit.phase)}`);
    console.log(`   Slaver: ${c.gray(commit.slaverId)}`);
    console.log(`   Commit: ${c.gray(commit.sha)}`);
    console.log('');

    // Compare with local
    if (status.localProgress?.exists && status.localProgress.lastUpdate) {
      const diff = status.localProgress.lastUpdate.getTime() - commit.timestamp.getTime();

      if (Math.abs(diff) < 60000) {
        // < 1min difference
        console.log(c.green('   ✅ Synced with local progress'));
      } else if (diff > 0) {
        console.log(c.yellow('   ⚠️ Local ahead of remote (uncommitted changes)'));
      } else {
        console.log(c.red('   ❌ Local behind remote (possible conflict)'));
      }
    }
  } else {
    console.log(c.yellow('⚠️ No checkpoint (new task or checkpoint disabled)'));
  }

  console.log('');
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// No-color fallback
const noColor = {
  bold: (s: string) => s,
  cyan: (s: string) => s,
  green: (s: string) => s,
  yellow: (s: string) => s,
  red: (s: string) => s,
  gray: (s: string) => s,
};
```

---

### 2. 复用 progress-parser.ts

```typescript
// node/src/utils/progress-parser.ts (已存在于 M1)

/**
 * Parse progress.md Markdown into ProgressSnapshot
 */
export function parseProgressMarkdown(
  content: string,
  taskId: string
): { success: boolean; data?: ProgressSnapshot; error?: Error } {
  // ... 现有实现（M1 已有）
}
```

---

## Test Strategy

### 单元测试

```typescript
// node/tests/task-status.test.ts

describe('task:status - Checkpoint Status', () => {
  it('should detect checkpoint branch existence (AC-1)', async () => {
    // Setup: Create checkpoint branch
    await execFileAsync('git', ['checkout', '-b', 'checkpoint/TASK-TEST-001']);
    await execFileAsync('git', ['push', 'origin', 'checkpoint/TASK-TEST-001']);

    const status = await getTaskStatus('TASK-TEST-001');

    expect(status.checkpoint?.exists).toBe(true);
    expect(status.checkpoint?.branch).toBe('origin/checkpoint/TASK-TEST-001');
  });

  it('should extract last commit metadata (AC-2)', async () => {
    // Setup: Commit with structured message
    const commitMsg = 'Checkpoint: TASK-TEST-001 - ac_1_done [slaver-005]';
    await execFileAsync('git', ['commit', '--allow-empty', '-m', commitMsg]);
    await execFileAsync('git', ['push', 'origin', 'checkpoint/TASK-TEST-001']);

    const status = await getTaskStatus('TASK-TEST-001');

    expect(status.checkpoint?.lastCommit?.phase).toBe('ac_1_done');
    expect(status.checkpoint?.lastCommit?.slaverId).toBe('slaver-005');
  });

  it('should compare local vs remote (AC-3)', async () => {
    // Setup: Local progress.md updated
    const progressPath = 'jira/tickets/TASK-TEST-001/progress.md';
    await fs.writeFile(
      progressPath,
      `**Last Update**: ${new Date(Date.now() + 3600000).toISOString()}\n`,
      'utf-8'
    );

    const status = await getTaskStatus('TASK-TEST-001');

    expect(status.localProgress?.lastUpdate).toBeTruthy();
    // Verify "local ahead" logic in print function
  });

  it('should handle missing checkpoint gracefully', async () => {
    const status = await getTaskStatus('TASK-NONEXISTENT');

    expect(status.checkpoint?.exists).toBe(false);
    expect(status.checkpoint?.lastCommit).toBeNull();
  });
});
```

---

### 集成测试

```bash
# E2E test script
#!/bin/bash

# 1. Create test task with checkpoint
eket task:claim TASK-INT-001
sleep 5  # Wait for checkpoint push

# 2. Check status
eket task:status TASK-INT-001 > output.txt

# 3. Verify output
grep "✅ Checkpoint:" output.txt
grep "Phase:" output.txt
grep "Slaver:" output.txt

echo "✅ AC-1/AC-2 verified"
```

---

### 边界 Case 测试

| Case | Setup | Expected |
|------|-------|----------|
| **No git remote** | 本地仓库无 origin | 显示 "⚠️ No remote configured" |
| **Fetch timeout** | Mock git fetch 超时 | 显示 "❌ Checkpoint fetch failed" |
| **Malformed commit msg** | Commit message 无结构 | Fallback 显示原始 message |
| **Local progress corrupt** | progress.md 解析失败 | 仅显示 remote checkpoint |

---

## Definition of Done

- [ ] AC-1~4 所有测试通过
- [ ] `eket task:status` 显示 checkpoint 状态（存在性 + 元数据）
- [ ] 彩色输出实现（✅⚠️❌）
- [ ] `--no-color` flag 支持
- [ ] 运行 E2E 测试验证
- [ ] Code review 通过

---

## Notes

**依赖**:
- TASK-X04 必须先完成（需 checkpoint 分支）
- 需 `chalk` 库（彩色输出）

**后续任务**:
- TASK-X06: 使用 checkpoint 状态实现 resume 逻辑
