# TASK-632: Shell DAG Runner (L0 兜底)

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P0  
**预估**: 1.5d  
**依赖**: TASK-631  
**层级**: L0 Shell

---

## 目标

纯 bash 实现 DAG 执行器，作为最后兜底方案。任何 POSIX 环境可用。

## 约束

- **零外部依赖**：仅用 bash 内置 + coreutils (awk/sed/grep)
- **串行执行**：忽略 `max_parallel`，按拓扑顺序逐个执行
- **文件锁**：用 `flock` 防止并发冲突
- **状态持久化**：写入 `.eket/data/dag_runs/` 目录

## 验收标准

- [x] `scripts/dag-runner.sh` 实现完整
- [x] 支持 `--dry-run` 模式（只打印执行顺序）
- [x] 支持 `--resume` 从失败节点恢复
- [x] ASCII 进度输出：`[2/5] TASK-632 ⏳ running...`
- [x] 循环依赖检测 + 明确报错
- [x] 单元测试：`tests/dag-runner.bats`

## 实现要点

### 拓扑排序 (Kahn 算法)

```bash
# 伪代码
# 1. 计算入度
# 2. 入度=0 的节点入队
# 3. 循环取队首，执行，减少后继入度
# 4. 入度变0则入队
# 5. 执行完检查是否所有节点都处理（否则有环）
```

### 状态文件结构

```
.eket/data/dag_runs/
└── EPIC-017-20260601-143022/
    ├── meta.json       # {epic, started_at, status}
    ├── TASK-631.status # done|failed|pending
    ├── TASK-632.status
    └── output.log
```

## 命令接口

```bash
# 执行 DAG
scripts/dag-runner.sh jira/epics/EPIC-017/dag.yml

# Dry run
scripts/dag-runner.sh --dry-run jira/epics/EPIC-017/dag.yml

# 从失败点恢复
scripts/dag-runner.sh --resume .eket/data/dag_runs/EPIC-017-xxx/
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket | Master |
| 2026-06-01 | 完成实现 + bats 测试 | Slaver |
