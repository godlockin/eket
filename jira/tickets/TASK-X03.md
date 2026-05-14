# TASK-X03: 实现 `eket task:verify` 进度验证命令

**ID**: TASK-X03  
**Epic**: EPIC-008  
**优先级**: P0  
**Agent Type**: `backend_dev`  
**预估工时**: 6 小时  
**状态**: `ready`

---

## 任务描述

实现 CLI 命令 `eket task:verify <task-id>`，交叉验证 `progress.md` 声明的进度与实际 git 状态是否一致，防止 Slaver 伪造进度。

**核心能力**: 检测 progress 文件声称"完成 AC-1"，但对应文件/commit 不存在的情况。

---

## 验收标准

**AC-1: 验证文件存在性**
- **Given**: `progress.md` 声称完成 `AC-1`，metadata `{ files: ['src/auth.rs', 'src/db.rs'] }`
- **When**: 运行 `eket task:verify TASK-640`
- **Then**: 检查这 2 个文件是否真实存在，输出：
  ```
  ✅ TASK-640 Verification PASSED
  - AC-1: ✅ files exist [src/auth.rs, src/db.rs]
  ```

**AC-2: 验证 commit 存在性**
- **Given**: `progress.md` 声称 `commit: abc123def`
- **When**: 运行 `eket task:verify TASK-640`
- **Then**: 执行 `git show abc123def`，若存在输出 ✅，不存在输出 ❌

**AC-3: 验证测试可重跑**
- **Given**: `progress.md` 声称 `tests: ✅`
- **When**: 运行 `eket task:verify TASK-640 --run-tests`
- **Then**: 执行 `npm test -- <test-file>`，若通过输出 ✅，失败输出 ❌

**AC-4: 检测伪造进度**
- **Given**: `progress.md` 声称完成 AC-2，但文件不存在
- **When**: 运行 `eket task:verify TASK-640`
- **Then**: 输出：
  ```
  ❌ TASK-640 Verification FAILED
  - AC-2: ❌ file not found [src/missing.rs]
  ```

**AC-5: JSON 输出模式（供脚本调用）**
- **Given**: 需要在 CI 中自动检查
- **When**: 运行 `eket task:verify TASK-640 --json`
- **Then**: 输出 JSON：
  ```json
  {
    "taskId": "TASK-640",
    "status": "failed",
    "checks": [
      { "ac": "AC-1", "check": "files", "result": "pass" },
      { "ac": "AC-2", "check": "files", "result": "fail", "missing": ["src/missing.rs"] }
    ]
  }
  ```

---

## 技术要求

### 命令位置
```
node/src/commands/task-verify.js       # 主实现
node/tests/unit/task-verify.test.js    # 单元测试
```

### 安全要求
⚠️ **必须使用 `execFileNoThrow` 替代 `exec`** 防止命令注入：
```javascript
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

// ❌ 不安全：exec(`git show ${commit}`)
// ✅ 安全：
const { status, stdout } = await execFileNoThrow('git', ['show', commit]);
```

### CLI 接口
```bash
eket task:verify <task-id> [options]

Options:
  --run-tests       重新运行测试验证
  --json            输出 JSON 格式
  --verbose         详细输出（显示每个检查细节）
```

### 验证逻辑流程
```javascript
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

async function verifyTask(taskId, options) {
  // 1. 读 progress.md
  const progress = await parseProgressMd(`jira/tickets/${taskId}/progress.md`);
  
  // 2. 提取所有声称完成的 AC
  const completedACs = progress.completed.filter(sults = [];
  for (const ac of completedACs) {
    // 3.1 验证文件存在
    if (ac.metadata.files) {
      for (const file of ac.metadata.files) {
        const exists = await fs.access(file).then(() => true).catch(() => false);
        results.push({ ac: ac.id, check: 'file', file, result: exists ? 'pass' : 'fail' });
      }
    }
    
    // 3.2 验证 commit 存在（安全版）
    if (ac.metadata.commit) {
      const { status } = await execFileNoThrow('git', ['show', ac.metadata.commit]);
      results.push({ ac: ac.id, check: 'commit', result: status === 0 ? 'pass' : 'fail' });
    }
    
    // 3.3 验证测试（可选）
    if (options.runTests && ac.metadata.tests === '✅') {
      // 重新运行测试
      const testResult = await runTests(ac.testFiles);
      results.push({ ac: ac.id, check: 'tests', result: testResult });
    }
  }
  
  // 4. 汇总结果
  const allPassed = results.every(r => r.result === 'pass');
  return { taskId, status: allPassed ? 'verified' : 'failed', checks: results };
}
```

---

## 实现指导

### Progress.md 解析
```javascript
// node/src/utils/parse-progress-md.js
export fu[x] AC-N ..." 行
  const acPattern = /- \[x\] (.+?) \(timestamp: (.+?)\)/g;
  const metadataPattern = /- files: \[(.+?)\]/;
  
  // 返回结构化数据
  return {
    completed: [
      { id: 'AC-1', timestamp: '...', metadata: { files: [...] } }
    ]
  };
}
```

### 文件存在性检查（高效版）
```javascript
// 批量检查（并发）
async function checkFilesExist(files) {
  const results = await Promise.allSettled(
    files.map(f => fs.access(f))
  );
  return files.map((f, i) => ({
    file: f,
    exists: results[i].status === 'fulfilled'
  }));
}
```

---

## 测试策略

### 单元测试
```javascript
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

describe('eket task:verify', () => {
  it('should pass when all files exist', async () => {
    // 创建测试 progress.md
    await createFakeProgress('TASK-TEST-001', {
      completed: [{ id: 'AC-1', files: ['test-file.js'] }]
    });
    await fs.writeFile('test-file.js', '// test');
    
    const result = await verifyTask('TASK-TEST-001');
    expect(result.status).toBe('verified');
  });

  it('should fail when file missing', async () => {
    await createFakeProgress('TASK-TEST-002', {
      completed: [{ id: 'AC-1', files: ['missing.js'] }]
    });
    
    const result = await verifyTask('TASK-TEST-002');
    expect(result.status).toBe('failed');
    expect(result.checks[0].result).toBe('fail');
  });

  it('should verify git commit exists', async () => {
    await execFileNoThrow('git', ['commit', '--allow-empty', '-m', 'test']);
    const { stdout } = await execFileNoThrow('git', ['rev-parse', 'HEAD']);
    const commit = stdout.trim();
    
    await createFakeProgress('TASK-TEST-003', {
      completed: [{ id: 'AC-1', commit }]
    });
    
    const result = await verifyTask('TASK-TEST-003');
    expect(result.checks.find(c => c.check === 'commit').result). 运行 `eket task:verify <task-id>`
3. 验证所有检查通过
4. 手动删除一个文件
5. 再次运行 verify，验证检测到失败

---

## 可观测性

**成功输出**:
```
✅ TASK-640 Verification PASSED (3/3 checks)
  - AC-1: ✅ files [src/auth.rs, src/db.rs]
  - AC-1: ✅ commit abc123def
  - AC-2: ✅ files [src/router.rs]
```

**失败输出**:
```
❌ TASK-640 Verification FAILED (2/3 checks)
  - AC-1: ✅ files [src/auth.rs, src/db.rs]
  - AC-1: ❌ commit xyz999 (not found)
  - AC-2: ✅ files [src/router.rs]
```

**退出码**:
- `0` — 验证通过
- `1` — 验证失败
- `2` — progress.md 不存在或损坏

---

## 回滚方案

若 verify 命令误报（false positive）：
1. 检查 progress.md 解析逻辑（正则可能匹配错误）
2. 临时绕过：使用 `--skip-verify` 标志（Master 手动审核）

---

## 依赖关系

**Blocked by**: TASK-X02（需要 Slaver 生成真实 progress.md 才能测试）  
**Blocks**: 无（Milestone 1 最后一个 task）

---

## 非功能需求

| 指标 | 目标 |
|------|------|
| **执行速度** | < 5s（不含 `--run-tests`） |
| **准确率** | 0% false negative（不能漏报伪造） |
| **可用性** | 支持 CI 集成（JSON 输出 + 退出码） |

---

## 参考资料

- [专家评审文档](../../jira/epics/EPIC-008/expert-review-architecture.md) §QA - 验证机制
- [Commander.js](https://github.com/tj/commander.js) — CLI 框架
- [execFileNoThrow 源码](../../node/src/utils/execFileNoThrow.ts) — 安全的命令执行工具

---

**创建时间**: 2026-05-14 16:00  
**更新时间**: 2026-05-14 16:05  
**状态历史**:
- 2026-05-14 16:00 — 创建，状态 `ready`（依赖 TASK-X02）
- 2026-05-14 16:05 — 更新：修正为使用 `execFileNoThrow` 防止命令注入
