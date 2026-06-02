# TASK-631: DAG YAML Schema + 验证器

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P0  
**预估**: 1d  
**依赖**: 无  
**层级**: All

---

## 目标

定义统一的 DAG YAML schema，三层引擎（Rust/Node/Shell）共用。

## 验收标准

- [x] `jira/schemas/dag.schema.json` — JSON Schema 定义
- [x] `scripts/validate-dag.sh` — Shell 验证脚本（用 yq + jq）
- [x] `node/src/schemas/dag.ts` — TypeScript 类型定义
- [x] `rust/crates/eket-engine/src/dag/schema.rs` — Rust struct + serde
- [x] 单元测试覆盖：valid/invalid YAML 各 3 例

## Schema 设计

```yaml
version: "1.0"
epic: EPIC-NNN
nodes:
  - id: TASK-NNN          # required
    script: "command"     # required
    deps: [TASK-XXX]      # optional, default []
    retry: 2              # optional, default from settings
    timeout: 600          # optional, default from settings
settings:
  max_parallel: 3         # Rust/Node 用，Shell 忽略
  retry_count: 2
  timeout_seconds: 3600
  on_failure: "stop"      # stop | continue | rollback
```

## 产出物

1. `jira/schemas/dag.schema.json`
2. `scripts/validate-dag.sh`
3. `node/src/schemas/dag.ts`
4. `rust/crates/eket-engine/src/dag/schema.rs`

## 测试用例

| 用例 | 预期 |
|------|------|
| valid-basic.yml | ✅ 通过 |
| valid-parallel.yml | ✅ 通过 |
| valid-complex.yml | ✅ 通过 |
| invalid-cycle.yml | ❌ 循环依赖 |
| invalid-missing-id.yml | ❌ 缺少必填字段 |
| invalid-unknown-dep.yml | ❌ 引用不存在节点 |

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket | Master |
| 2026-06-01 | 完成所有产出物 + 测试 | Slaver |
