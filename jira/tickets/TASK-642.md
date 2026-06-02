# TASK-642: DAG 与 Master-Slaver 协作整合

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P0  
**预估**: 2d  
**依赖**: TASK-635, TASK-640  
**层级**: All  
**来源**: 核心架构

---

## 目标

将 DAG 编排与现有 Master-Slaver 协作模式整合，实现自动任务分发。

## 整合方案

```
Master 流程:
1. 收到 EPIC → epic:analyze 判断复杂度
2. 复杂度高 → dag:generate 生成 DAG
3. dag:run 启动执行
4. DAG 调度器根据依赖自动 dispatch 到 Slaver

Slaver 流程:
1. slaver:poll 收到 DAG 节点任务
2. 执行 task:execute
3. 完成后 DAG 调度器自动推进下游
```

## 新增命令

```bash
# Master 一键启动 EPIC DAG 模式
eket epic:run EPIC-017 --dag

# 等价于:
# 1. eket epic:analyze EPIC-017
# 2. eket dag:generate EPIC-017  (如果不存在)
# 3. eket dag:run jira/epics/EPIC-017/dag.yml
```

## 事件整合

| DAG 事件 | Master-Slaver 动作 |
|----------|-------------------|
| `dag.node.ready` | Master dispatch 到空闲 Slaver |
| `dag.node.done` | Slaver 上报完成 |
| `dag.node.failed` | Master 决定重试/跳过/终止 |
| `dag.run.completed` | Master 发起 EPIC 验收 |

## 验收标准

- [x] `eket epic:run EPIC-NNN --dag` 一键执行
- [x] DAG 节点自动分发到 Slaver 邮箱
- [x] Slaver 完成后自动推进 DAG
- [x] Master heartbeat 包含 DAG 进度
- [ ] Web Dashboard 显示 DAG 执行图 (待 TASK-639 集成)

## 实现产出

### 新增文件

1. **`node/src/core/dag-slaver-bridge.ts`** - DAG-Slaver 桥接模块
   - 监听 DAG 事件 (NODE_PENDING, NODE_DONE, NODE_FAILED, etc.)
   - 自动分发节点到空闲 Slaver 邮箱
   - 跟踪 Slaver 分配状态
   - 提供 DAGProgress 结构用于 heartbeat 报告

2. **`node/src/commands/epic-run.ts`** - epic:run 命令
   - 支持 `--dag` 标志启用 DAG 模式
   - 支持 `--dry-run` 预览执行
   - 支持 `--watch` 实时监控进度
   - 支持 `--force` 强制重新生成 DAG

### 修改文件

1. **`node/src/commands/master-heartbeat.ts`**
   - 新增 `dagProgress` 字段包含活跃 DAG run 状态
   - heartbeat 报告显示 DAG 节点完成/运行/失败数
   - 健康检查包含 DAG 相关警告

2. **`node/src/index.ts`**
   - 注册 epic:run 命令

### 架构图

```
┌─────────────┐    dag.node.ready    ┌──────────────────┐
│             │─────────────────────►│                  │
│ DAGExecutor │                      │ DAGSlaverBridge  │
│             │◄─────────────────────│                  │
└─────────────┘    dag.node.done     └────────┬─────────┘
                                              │
                                              │ sendTaskAssignment()
                                              ▼
                                     ┌──────────────────┐
                                     │  Slaver Mailbox  │
                                     │  (.eket/inboxes) │
                                     └────────┬─────────┘
                                              │
                                              │ slaver:poll
                                              ▼
                                     ┌──────────────────┐
                                     │     Slaver       │
                                     │  (task:claim)    │
                                     └──────────────────┘
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket | Master |
| 2026-06-01 | 实现完成 | Slaver |
