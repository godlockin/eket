# TASK-196: WorkflowEngine全局RwLock改per-workflow锁

**状态**: ready

**优先级**: P2
**类型**: Performance
**模块**: eket-engine / workflow.rs:127
**来源**: 红队质疑 Linus

## 问题描述

5把全局RwLock（instances/executors/pending_judgments/kill_handles），每步骤4次write()争用。100个并发workflow时，所有workflow共享一把`instances`写锁，人工串行化。

## 验收标准

- [ ] `instances: Arc<DashMap<String, Arc<RwLock<WorkflowInstance>>>>` — per-workflow锁
- [ ] 外层DashMap仅做查找（并发安全），内层RwLock保护单个instance状态
- [ ] `executors`/`kill_handles` 同样迁移到DashMap
- [ ] 添加 `dashmap = "5"` 到workspace依赖
- [ ] 基准测试（可选）：10并发workflow，执行时间对比
