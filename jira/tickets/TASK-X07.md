# TASK-X07: Checkpoint 分支自动清理（GC）

**ID**: TASK-X07  
**Epic**: EPIC-008  
**优先级**: P1  
**预估**: 4h  
**依赖**: None (独立功能，可并行 X05/X06)  
**Agent Type**: devops  
**状态**: review

---

## Goal

自动清理已合并/超时的 checkpoint 分支，防止 git 仓库膨胀，保持 < 20 个活跃 checkpoint 分支。

---

## Context

**问题**: 每个 task 创建独立 checkpoint 分支，长期积累会导致：
- Remote 分支列表过长（影响 `git branch -r` 性能）
- Clone 时 fetch 时间增长
- 磁盘空间浪费（过期分支占用）

**M2 目标**: 自动 GC 机制，删除不再需要的 checkpoint 分支

**清理规则**:
1. Task 已完成（PR merged）且分支 > 7 天 → 删除
2. Task 状态 = cancelled 且分支 > 3 天 → 删除
3. **保护规则**: Main PR 未合并的任务 → 不删除（可能需要 resume）

---

## Acceptance Criteria

### AC-1: 检测并列出可清理分支
**Given**: Remote 存在 10 个 checkpoint 分支，其中 3 个满足删除条件  
**When**: Master 运行 `eket checkpoint:gc --dry-run`  
**Then**:
- 扫描所有 `checkpoint/*` 分支
- 对每个分支检查：
  - 关联 task 状态（从 jira/tickets/ 读取）
  - 分支最后更新时间（git log）
  - 是否有未合并 PR（GitHub API）
- 输出列表：
  ```
  Checkpoint branches eligible for cleanup:

  ✅ checkpoint/TASK-635 (merged 10d ago)
  ✅ checkpoint/TASK-636 (cancelled 5d ago)
  ✅ checkpoint/TASK-637 (stale 30d, no activity)

  ⚠️ Skipped:
  - checkpoint/TASK-640 (PR #123 not merged)
  - checkpoint/TASK-641 (active, updated 2h ago)

  Total: 3 branches to delete (use --execute to delete)
  ```

**验证**:
```bash
# Setup: 创建测试分支
git checkout -b checkpoint/TASK-TEST-001
git commit --allow-empty -m "Test checkpoint"
git push origin checkpoint/TASK-TEST-001

# Simulate old branch (modify commit date)
GIT_COMMITTER_DATE="2026-04-01T12:00:00" git commit --amend --no-edit --date="2026-04-01T12:00:00"
git push -f origin checkpoint/TASK-TEST-001

# Test
eket checkpoint:gc --dry-run | grep "TASK-TEST-001"
# 输出: "✅ checkpoint/TASK-TEST-001 (stale 44d)"
```

---

### AC-2: 执行删除操作
**Given**: Dry-run 列出 3 个可删除分支  
**When**: Master 运行 `eket checkpoint:gc --execute`  
**Then**:
- 删除 remote 分支（`git push origin --delete checkpoint/<task-id>`）
- 显示删除结果：
  ```
  Deleting checkpoint branches...

  ✅ checkpoint/TASK-635 deleted
  ✅ checkpoint/TASK-636 deleted
  ✅ checkpoint/TASK-637 deleted

  Total: 3 branches deleted
  ```
- 失败的分支显示错误（如权限问题）

**验证**:
```bash
# Setup: 确认分支存在
git ls-remote --heads origin checkpoint/TASK-TEST-001

# Test
eket checkpoint:gc --execute

# Verify deletion
git ls-remote --heads origin checkpoint/TASK-TEST-001
# 输出: 空（分支已删除）
```

---

### AC-3: 保护未合并 PR 的分支
**Given**: TASK-640 有 PR #123（状态 = open）  
**When**: Master 运行 `eket checkpoint:gc --execute`  
**Then**:
- 检测 PR 状态（通过 GitHub API）
- 跳过删除，显示：
  ```
  ⚠️ Skipped:
  - checkpoint/TASK-640 (PR #123 not merged, protection enabled)
  ```

**验证**:
```bash
# Setup: Mock PR (integration test 用)
# Create PR for checkpoint/TASK-TEST-001

# Test
eket checkpoint:gc --execute

# Verify not deleted
git ls-remote --heads origin checkpoint/TASK-TEST-001
# 输出: 分支仍存在
```

---

### AC-4: 自定义清理规则（--older-than）
**Given**: 运行 GC 时指定 `--older-than 14d`  
**When**: Master 运行 `eket checkpoint:gc --older-than 14d --execute`  
**Then**:
- 仅删除最后更新时间 > 14 天的分支
- 默认 `--older-than 7d`（可覆盖）

**验证**:
```bash
# Test with custom threshold
eket checkpoint:gc --older-than 30d --dry-run

# Verify only 30d+ branches listed
# (TASK-TEST-001 created 44d ago should appear)
```

---

## Implementation Sketch

### 1. 新命令 checkpoint:gc

```typescript
// node/src/commands/checkpoint-gc.ts

import { Command } from 'commander';
import { execFile } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

interface GCOptions {
  dryRun?: boolean;
  execute?: boolean;
  olderThan?: string; // e.g., "7d", "14d"
}

interface CheckpointBranch {
  name: string;
  taskId: string;
  lastUpdate: Date;
  eligible: boolean;
  reason: string;
}

export function registerCheckpointGC(program: Command): void {
  program
    .command('checkpoint:gc')
    .description('Garbage collect old checkpoint branches')
    .option('--dry-run', 'List branches without deleting (default)')
    .option('--execute', 'Execute deletion')
    .option('--older-than <duration>', 'Only delete branches older than this (e.g., "7d", "14d")', '7d')
    .addHelpText(
      'after',
      `
Examples:
  $ eket checkpoint:gc --dry-run              # List eligible branches
  $ eket checkpoint:gc --execute              # Delete branches (7d+ old)
  $ eket checkpoint:gc --older-than 14d --execute  # Delete 14d+ old branches

Cleanup Rules:
  ✅ Task status = done AND branch > 7d
  ✅ Task status = cancelled AND branch > 3d
  ✅ No recent activity (> 30d) regardless of status
  ⚠️ Skip if PR not merged (protection)
`
    )
    .action(async (options: GCOptions) => {
      const isDryRun = !options.execute;
      const olderThanMs = parseDuration(options.olderThan || '7d');

      const branches = await scanCheckpointBranches(olderThanMs);

      printGCReport(branches, isDryRun);

      if (options.execute) {
        await deleteCheckpointBranches(branches);
      }
    });
}

async function scanCheckpointBranches(olderThanMs: number): Promise<CheckpointBranch[]> {
  const branches: CheckpointBranch[] = [];

  // 1. List all checkpoint branches
  const { stdout } = await execFileAsync('git', ['ls-remote', '--heads', 'origin', 'checkpoint/*'], {
    cwd: process.cwd(),
  });

  const branchNames = stdout
    .trim()
    .split('\n')
    .filter((line) => line)
    .map((line) => line.split('\t')[1].replace('refs/heads/', ''));

  // 2. Check each branch
  for (const branchName of branchNames) {
    const taskId = branchName.replace('checkpoint/', '');

    // Fetch branch to get last commit date
    await execFileAsync('git', ['fetch', 'origin', branchName], { cwd: process.cwd() });

    const { stdout: logOutput } = await execFileAsync(
      'git',
      ['log', `origin/${branchName}`, '--format=%aI', '-1'],
      { cwd: process.cwd() }
    );

    const lastUpdate = new Date(logOutput.trim());
    const age = Date.now() - lastUpdate.getTime();

    // Check eligibility
    const { eligible, reason } = await isEligibleForDeletion(taskId, age, olderThanMs);

    branches.push({
      name: branchName,
      taskId,
      lastUpdate,
      eligible,
      reason,
    });
  }

  return branches;
}

async function isEligibleForDeletion(
  taskId: string,
  ageMs: number,
  olderThanMs: number
): Promise<{ eligible: boolean; reason: string }> {
  // Rule 1: Too young
  if (ageMs < olderThanMs) {
    return { eligible: false, reason: `active (updated ${formatAge(ageMs)} ago)` };
  }

  // Rule 2: Check task status
  const ticketPath = path.join(process.cwd(), `jira/tickets/${taskId}/${taskId}.md`);

  let taskStatus: string | null = null;
  try {
    const content = await fs.readFile(ticketPath, 'utf-8');
    const statusMatch = content.match(/\*\*状态\*\*:\s*`(\w+)`/);
    taskStatus = statusMatch?.[1] || null;
  } catch {
    // Ticket not found (deleted?)
    taskStatus = null;
  }

  // Rule 3: Task done and old enough
  if (taskStatus === 'done' && ageMs > 7 * 24 * 3600 * 1000) {
    return { eligible: true, reason: `merged ${formatAge(ageMs)} ago` };
  }

  // Rule 4: Task cancelled and > 3d
  if (taskStatus === 'cancelled' && ageMs > 3 * 24 * 3600 * 1000) {
    return { eligible: true, reason: `cancelled ${formatAge(ageMs)} ago` };
  }

  // Rule 5: Stale (> 30d, no activity)
  if (ageMs > 30 * 24 * 3600 * 1000) {
    return { eligible: true, reason: `stale ${formatAge(ageMs)}, no activity` };
  }

  // Rule 6: Check PR status (protection)
  const hasPR = await checkPRStatus(taskId);
  if (hasPR && hasPR !== 'merged') {
    return { eligible: false, reason: `PR #${hasPR} not merged (protection)` };
  }

  return { eligible: false, reason: 'does not meet deletion criteria' };
}

async function checkPRStatus(taskId: string): Promise<string | false> {
  try {
    // Use gh CLI to check PR status
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'list', '--search', `head:checkpoint/${taskId}`, '--json', 'number,state'],
      { cwd: process.cwd(), timeout: 5000 }
    );

    const prs = JSON.parse(stdout);
    if (prs.length === 0) return false;

    const pr = prs[0];
    return pr.state === 'MERGED' ? 'merged' : pr.number;
  } catch {
    // gh CLI not available or error
    return false;
  }
}

async function deleteCheckpointBranches(branches: CheckpointBranch[]): Promise<void> {
  console.log(chalk.bold('\n🗑️  Deleting checkpoint branches...\n'));

  const eligible = branches.filter((b) => b.eligible);

  for (const branch of eligible) {
    try {
      await execFileAsync('git', ['push', 'origin', '--delete', branch.name], {
        cwd: process.cwd(),
        timeout: 10000,
      });

      console.log(chalk.green(`✅ ${branch.name} deleted`));
    } catch (error) {
      console.log(
        chalk.red(
          `❌ ${branch.name} failed: ${error instanceof Error ? error.message : 'unknown error'}`
        )
      );
    }
  }

  console.log(chalk.bold(`\nTotal: ${eligible.length} branches deleted\n`));
}

function printGCReport(branches: CheckpointBranch[], isDryRun: boolean): void {
  const eligible = branches.filter((b) => b.eligible);
  const skipped = branches.filter((b) => !b.eligible);

  console.log(chalk.bold('\n📊 Checkpoint branches eligible for cleanup:\n'));

  if (eligible.length === 0) {
    console.log(chalk.green('✅ No branches to delete (all clean)\n'));
  } else {
    for (const branch of eligible) {
      console.log(chalk.green(`✅ ${branch.name} (${branch.reason})`));
    }
  }

  if (skipped.length > 0) {
    console.log(chalk.bold('\n⚠️  Skipped:\n'));
    for (const branch of skipped) {
      console.log(chalk.yellow(`   - ${branch.name} (${branch.reason})`));
    }
  }

  console.log(
    chalk.bold(`\nTotal: ${eligible.length} branches to delete ${isDryRun ? '(use --execute to delete)' : ''}\n`)
  );
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(d|h|m)$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (unit === 'd') return value * 24 * 3600 * 1000;
  if (unit === 'h') return value * 3600 * 1000;
  if (unit === 'm') return value * 60 * 1000;

  throw new Error(`Invalid duration unit: ${unit}`);
}

function formatAge(ageMs: number): string {
  const days = Math.floor(ageMs / (24 * 3600 * 1000));
  if (days > 0) return `${days}d`;

  const hours = Math.floor(ageMs / (3600 * 1000));
  if (hours > 0) return `${hours}h`;

  const minutes = Math.floor(ageMs / (60 * 1000));
  return `${minutes}m`;
}
```

---

### 2. 注册命令

```typescript
// node/src/cli.ts

import { registerCheckpointGC } from './commands/checkpoint-gc.js';

// ... 现有命令注册

registerCheckpointGC(program);
```

---

## Test Strategy

### 单元测试

```typescript
// node/tests/checkpoint-gc.test.ts

describe('checkpoint:gc', () => {
  it('should list eligible branches (AC-1)', async () => {
    // Setup: Create old checkpoint branch
    await execFileAsync('git', ['checkout', '-b', 'checkpoint/TASK-TEST-001']);
    await execFileAsync('git', [
      'commit',
      '--allow-empty',
      '-m',
      'Test checkpoint',
      '--date=2026-04-01T12:00:00',
    ]);
    await execFileAsync('git', ['push', 'origin', 'checkpoint/TASK-TEST-001']);

    // Test
    const output = await captureOutput(() => runGC({ dryRun: true, olderThan: '7d' }));

    expect(output).toContain('TASK-TEST-001');
    expect(output).toContain('stale');
  });

  it('should delete eligible branches (AC-2)', async () => {
    await runGC({ execute: true, olderThan: '7d' });

    // Verify branch deleted
    const { stdout } = await execFileAsync('git', [
      'ls-remote',
      '--heads',
      'origin',
      'checkpoint/TASK-TEST-001',
    ]);

    expect(stdout.trim()).toBe('');
  });

  it('should skip branches with open PR (AC-3)', async () => {
    // Setup: Mock PR check (return open PR)
    jest.spyOn(checkPRStatus, 'implementation').mockResolvedValue('123');

    const output = await captureOutput(() => runGC({ dryRun: true }));

    expect(output).toContain('Skipped');
    expect(output).toContain('PR #123 not merged');
  });

  it('should respect --older-than flag (AC-4)', async () => {
    const branches = await scanCheckpointBranches(parseDuration('14d'));

    // Verify only 14d+ branches listed
    expect(branches.filter((b) => b.eligible)).toHaveLength(1); // TASK-TEST-001 (44d old)
  });
});
```

---

### 边界 Case 测试

| Case | Setup | Expected |
|------|-------|----------|
| **No checkpoint branches** | Remote 无 checkpoint 分支 | 显示 "No branches to delete" |
| **All branches active** | 所有分支 < 7d | 显示 "No branches to delete" |
| **gh CLI unavailable** | Mock gh 命令失败 | 跳过 PR 检查，继续 GC |
| **Git delete permission denied** | Mock git push 权限错误 | 显示错误，继续处理其他分支 |

---

## Definition of Done

- [ ] AC-1~4 所有测试通过
- [ ] `eket checkpoint:gc` 命令实现
- [ ] Dry-run 模式实现（默认）
- [ ] `--execute` flag 执行删除
- [ ] `--older-than` 自定义阈值
- [ ] PR 保护规则实现（集成 gh CLI）
- [ ] Code review 通过

---

## Notes

**依赖**:
- 需 `gh` CLI（GitHub PR 检查），若不可用则跳过保护规则
- 需 git remote 权限（删除分支）

**技术债**:
- 当前未处理多 remote 场景（仅检查 origin）
- 未实现 GC 历史记录（哪些分支被删除）

**后续优化**:
- Cron job 定期自动执行（GitHub Actions）
- Slack 通知（删除分支后通知 Master）

---

## 7. 复盘记录

**复盘者**: Slaver-015 (DevOps Agent)  
**时间**: 2026-05-14T09:25:00+08:00

### 踩坑 / 警示

**坑1: ESM 模块测试中 `__dirname` 未定义**
- **说明**: Jest + ESM 环境下 `__dirname` 不可用
- **解法**: 
  ```typescript
  import { fileURLToPath } from 'url';
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  ```
- **如何规避**: 所有新测试文件默认加上此 polyfill

**坑2: 测试 timeout (默认 5s 不够)**
- **说明**: CLI 命令启动慢（logger/memory monitor 初始化），默认 5s 超时
- **解法**: 每个测试用例显式传入 `35000` timeout
- **如何规避**: 
  ```typescript
  it('test name', async () => { /* ... */ }, 35000); // 添加 timeout
  ```

### 可复用经验（带来复利的发现）

**经验1: 并发扫描 git branches 的 chunk 策略**
- **具体模式**: 
  ```typescript
  const chunkSize = 5;
  for (let i = 0; i < branchNames.length; i += chunkSize) {
    const chunk = branchNames.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map(processBranch));
    branches.push(...results);
  }
  ```
- **价值**: 避免并发过高导致 git rate limit 或超时

**经验2: Graceful fallback 模式 (gh CLI optional)**
- **具体模式**: 
  ```typescript
  try {
    const { stdout } = await execFileAsync('gh', [...], { timeout: 5000 });
    // parse stdout
  } catch {
    // gh CLI unavailable → skip feature, continue execution
    return false;
  }
  ```
- **价值**: 提升容错性，依赖不可用时降级但不中断

**经验3: 彩色输出 + 默认 dry-run (破坏性操作保护)**
- **具体模式**: 
  - `--dry-run` 为默认行为
  - `--execute` 需显式传入
  - 报告中用 ✅/⚠️/❌ + 颜色区分状态
- **价值**: 防止误操作，提升 UX

### 如果重做，最想改的一件事

**分析阶段做得太详细，可直接进入编码（已有 Implementation Sketch）**

- 分析报告耗时 20min，但 ticket 中已有完整 Implementation Sketch（435 行代码骨架）
- 可直接参考 task-status.ts 开始写，边写边调整
- 结果：分析 → 批准 → 实现，总耗时 ~3h（符合预估 4h，但分析环节可优化）

**改进建议**: 若 ticket 含详细 Implementation Sketch，可简化分析报告为 1 页 checklist，直接开始实现

