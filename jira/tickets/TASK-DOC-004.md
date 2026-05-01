# TASK-DOC-004: task:test + task:create --epic

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **预估工时**: 360min
- **epic**: DOC-LIFECYCLE
- **blocked_by**: TASK-DOC-001

## 需求描述
新增 task:test 命令记录测试结果；task:create 支持 --epic 关联并更新 EPIC plan 的 ticket 列表。

## 验收标准
- [ ] `eket task:test TASK-NNN --status pass|fail --coverage 85` 追加 `## 测试记录` section 到 ticket
- [ ] `eket task:create "title" --epic EPIC-001` 创建 ticket 后更新 `confluence/architecture/EPIC-001-plan.md` 的 ticket 列表 section
- [ ] EPIC plan 不存在时 --epic 参数 warn 但不失败
- [ ] 幂等：测试记录标记行检查
- [ ] `cargo test -p eket-cli -- task_test task_create_epic` 通过

## 技术要点
- 新建 `rust/crates/eket-cli/src/commands/task_test.rs`
- 修改 `rust/crates/eket-cli/src/commands/task_create.rs`：增加 `--epic` 可选参数
- EPIC plan 更新：找到 `<!-- eket:section:tickets -->` 标记追加一行 `- TASK-NNN: <title>`
- task_test 输出 JSON：`{"ticket_id","status","coverage","recorded_at"}`

## 参考文件
- `rust/crates/eket-cli/src/commands/task_create.rs`
- `rust/crates/eket-cli/src/commands/gate_review.rs`（参考 section 追加模式）

## 实现记录

- 新增 `rust/crates/eket-cli/src/commands/task_test.rs`：task:test 命令，幂等 section 追加，4 tests pass
- 修改 `task_create.rs`：`--epic` 参数，写票后查 EPIC plan 追加 ticket 行（marker 替换），plan 不存在 warn
- `commands/mod.rs` + `main.rs` 注册 task:test subcommand
- `cargo build` clean，`cargo test -p eket-cli task_test` 4/4 pass
