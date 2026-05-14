# TASK-X01: 实现 ProgressTracker 核心类

**ID**: TASK-X01  
**Epic**: EPIC-008  
**优先级**: P0  
**Agent Type**: `backend_dev`  
**预估工时**: 6 小时  
**状态**: `ready`

---

## 任务描述

实现 `ProgressTracker` 类，负责 Slaver 执行过程中的进度记录。支持内存缓存 + 异步 flush + 关键节点同步写。

**输入**: Checkpoint 事件（phase, metadata）  
**输出**: `jira/tickets/<task-id>/progress.md` 实时更新

---

## 验收标准

**AC-1: 基础 checkpoint 记录**
- **Given**: Slaver 调用 `tracker.checkpoint('analysis_done', { artifact: 'analysis-report.md' })`
- **When**: 30s 内（或立即 flush）
- **Then**: `progress.md` 包含：
  ```markdown
  ## Completed
  - [x] Analysis (timestamp: 2026-05-14T15:30:00+0800)
    - artifact: analysis-report.md
  ```

**AC-2: 异步 flush 机制**
- **Given**: Slaver 每 10s 调用一次 `checkpoint('impl_progress', { file: 'x.rs' })`
- **When**: 期间未调用 `flush()`
- **Then**: 内存缓存积累 3+ 条记录，30s 后自动 flush 到文件（验证：检查文件修改时间间隔 ≈ 30s）

**AC-3: 关键节点同步写**
- **Given**: Slaver 调用 `checkpoint('ready_for_pr')`
- **When**: 立即检查文件
- **Then**: `progress.md` 已更新（不等 30s flush）

**AC-4: 原子写防损坏**
- **Given**: 模拟写入过程中进程被杀（kill -9）
- **When**: 重启后读 `progress.md`
- **Then**: 文件完整（要么是旧内容，要么是新内容，不会损坏）

**AC-5: Markdown 格式正确**
- **Given**: 完成 3 个 checkpoint
- **When**: 读 `progress.md`
- **Then**: 符合模板格式：
  ```markdown
  # Task Progress: TASK-XXX
  **Last Update**: ISO8601 timestamp
  **Slaver**: slaver-NNN
  **Current Phase**: `phase_name`
  
  ## Completed
  - [x] Phase 1 (timestamp)
  - [x] Phase 2 (timestamp)
  
  ## Next Steps
  - [ ] Phase 3
  ```

---

## 技术要求

### 文件位置
```
node/src/core/progress-tracker.js       # 主实现
node/tests/unit/progress-tracker.test.js  # 单元测试
```

### API 设计
```javascript
class ProgressTracker {
  constructor(taskId, slaverId) { }
  
  async checkpoint(phase, metadata = {}) { }
  async flush() { }
  async close() { }  // 清理 interval
  renderMarkdown() { }  // 私有方法，生成 MD 内容
}
```

### 依赖
- `fs.promises` (Node.js 内置)
- 原子写工具函数（需实现 `atomicWrite(path, content)`）

---

## 实现指导

### 原子写实现
```javascript
// node/src/utils/atomic-write.js
export async function atomicWrite(filepath, content) {
  const tmpPath = `${filepath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, filepath);  // 原子操作
}
```

### Checkpoint 缓存结构
```javascript
this.buffer = [
  { timestamp: '2026-05-14T15:30:00+0800', phase: 'analysis_done', artifact: '...' },
  { timestamp: '2026-05-14T15:45:00+0800', phase: 'impl_ac1', files: ['x.rs'] }
];
```

### 关键节点列表
```javascript
const SYNC_PHASES = [
  'analysis_done',
  'design_done',
  'ready_for_pr',
  'tests_passed'
];
```

---

## 测试策略

### 单元测试（必须）
- ✅ `checkpoint()` 正常写入
- ✅ 30s 自动 flush（使用 `jest.useFakeTimers()`）
- ✅ 关键节点立即写
- ✅ 原子写防损坏（模拟 SIGKILL）
- ✅ Markdown 格式校验

### 边界测试
- ⚠️ 磁盘满（`ENOSPC`）→ 捕获错误，记到 `.eket/logs/checkpoint-failures.log`
- ⚠️ 无权限（`EACCES`）→ 同上
- ⚠️ Buffer 溢出（1000+ checkpoint）→ 自动 flush

### 性能测试
- 📊 1000 次 `checkpoint()` 调用耗时 < 100ms（内存操作）
- 📊 单次 `flush()` 耗时 < 50ms

---

## 可观测性

**日志**:
```javascript
console.log(`[ProgressTracker] Checkpoint: ${phase} (task: ${taskId})`);
console.warn(`[ProgressTracker] Flush failed: ${error.message}`);
```

**Metrics**（可选，phase 2）:
- `checkpoint_count` — Counter
- `flush_duration_ms` — Histogram

---

## 回滚方案

若发现 ProgressTracker 导致 Slaver 崩溃：
1. 在 `slaver.js` 中注释掉所有 `tracker.checkpoint()` 调用
2. 回退到手动读 `.output` transcript（旧方案）

特性开关（环境变量）:
```bash
ENABLE_PROGRESS_TRACKING=false npm start  # 禁用 checkpoint
```

---

## 依赖关系

**Blocked by**: 无  
**Blocks**: TASK-X02（Slaver 集成需要本类）

---

## 参考资料

- [专家评审文档](../../jira/epics/EPIC-008/expert-review-architecture.md) §后端工程师建议
- Node.js `fs.rename` 原子性保证: https://nodejs.org/api/fs.html#fspromisesrenamepath-newpath

---

**创建时间**: 2026-05-14 15:30  
**更新时间**: 2026-05-14 15:30  
**状态历史**:
- 2026-05-14 15:30 — 创建，状态 `ready`
