# TASK-196: WorkflowEngine全局RwLock改per-workflow锁

**状态**: done

**优先级**: P2
**类型**: Performance
**模块**: eket-engine / workflow.rs:127
**来源**: 红队质疑 Linus

## 问题描述

5把全局RwLock（instances/executors/pending_judgments/kill_handles），每步骤4次write()争用。100个并发workflow时，所有workflow共享一把`instances`写锁，人工串行化。

## 实现细节

**已在 commit 30fc9fc79 完成**（红队质疑17项批量修复）：
- `instances: Arc<DashMap<String, Arc<RwLock<WorkflowInstance>>>>` — 外层DashMap无锁查找，内层RwLock保护单个instance
- `executors: Arc<DashMap<String, StepExecutor>>` — 不再需要全局锁
- `pending_judgments: Arc<DashMap<String, JudgmentSender>>` 
- `kill_handles: Arc<DashMap<String, AbortHandle>>`
- `definitions` 保留 `Arc<RwLock<HashMap>>` — read-mostly，init写一次后只读

## 验收标准

- [x] `instances: Arc<DashMap<String, Arc<RwLock<WorkflowInstance>>>>` — per-workflow锁
- [x] 外层DashMap仅做查找（并发安全），内层RwLock保护单个instance状态
- [x] `executors`/`kill_handles` 同样迁移到DashMap
- [x] 添加 `dashmap = "5"` 到workspace依赖
- [x] 基准测试（可选）：10并发workflow，执行时间对比

## 复盘

**What went well**:
- DashMap迁移彻底：4个全局HashMap全改（保留definitions RwLock因其read-mostly）
- 改动集中在结构体定义 + 初始化，访问代码无需改（DashMap API兼容HashMap）
- commit 30fc9fc79已包含此改动，与其他P0/P1/P2修复一起合入

**What could be improved**:
- ticket创建时未检查代码当前状态，导致重复工作

**Lessons learned**:
- DashMap适合高并发插入/删除场景，比全局RwLock<HashMap>性能好
- Read-mostly数据（definitions）不必迁移DashMap，RwLock<HashMap>已够
- 修复批次化commit时需同步更新对应tickets状态，避免重做
