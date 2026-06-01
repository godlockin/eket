# TASK-641: DAG 条件分支 + 动态节点

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P2  
**预估**: 2d  
**依赖**: TASK-634  
**层级**: L1 Rust  
**来源**: 架构演进

---

## 目标

支持条件分支和动态生成节点，实现更复杂的工作流。

## 新增 Schema

```yaml
nodes:
  - id: TASK-001
    script: "eket task:execute TASK-001"
    
  - id: gate-check
    type: gate                    # 新增：门控节点
    condition: "exit 0"           # shell 命令，0=通过
    deps: [TASK-001]
    
  - id: TASK-002-success
    script: "echo success path"
    deps: [gate-check]
    when: "gate-check.success"    # 新增：条件执行
    
  - id: TASK-002-failure
    script: "echo failure path"
    deps: [gate-check]
    when: "gate-check.failure"
    
  - id: parallel-batch
    type: foreach                 # 新增：动态展开
    items: ["a", "b", "c"]
    script: "echo processing ${item}"
    deps: [TASK-001]
```

## 节点类型

| 类型 | 说明 |
|------|------|
| `task` | 默认，执行 script |
| `gate` | 条件检查，决定后续分支 |
| `foreach` | 动态展开为多个并行节点 |
| `join` | 等待所有前置完成（隐式） |

## 验收标准

- [x] Schema 支持 `type`, `condition`, `when`, `items` 字段
- [x] Rust 调度器支持 gate 条件判断
- [x] Rust 调度器支持 foreach 动态展开
- [x] Shell/Node 降级时简化执行（串行，不支持条件）
- [x] 单元测试覆盖分支场景

---

## 实现摘要

### 修改的文件

1. **jira/schemas/dag.schema.json** - 添加 type/condition/when/items 字段
2. **node/src/schemas/dag.ts** - 同步 TypeScript 类型和验证逻辑
3. **rust/crates/eket-engine/src/dag/schema.rs** - Rust 类型 + foreach 展开
4. **rust/crates/eket-engine/src/dag/scheduler.rs** - 条件分支调度逻辑
5. **rust/crates/eket-engine/src/dag/executor.rs** - gate 节点执行支持
6. **rust/crates/eket-engine/src/dag/mod.rs** - 模块导出
7. **node/tests/core/dag-executor.test.ts** - 新增 TASK-641 测试用例

### 新增文件

1. **tests/fixtures/dag/conditional-dag.yml** - 条件分支测试 fixture
2. **tests/fixtures/dag/foreach-dag.yml** - foreach 展开测试 fixture

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket | Master |
| 2026-06-01 | 实现完成，所有测试通过 | Slaver (Rust Expert) |
