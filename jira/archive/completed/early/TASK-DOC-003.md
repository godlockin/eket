# TASK-DOC-003: task:claim + task:complete doc hooks

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **预估工时**: 480min
- **epic**: DOC-LIFECYCLE
- **blocked_by**: TASK-DOC-001

## 需求描述
在 task:claim 和 task:complete 的 post hook 里注入文档产出逻辑。

## 验收标准
- [ ] `eket task:claim TASK-NNN` 执行后，ticket 文件内追加 `## 分析记录` section（含 `<!-- eket:section:分析记录 -->` 标记）
- [ ] 重复 claim 不重复追加（幂等）
- [ ] `eket task:complete TASK-NNN` 执行后，自动创建 `confluence/memory/retrospectives/<YYYY-MM-DD>-<TASK-NNN>.md`
- [ ] retro 模板填充：ticket_id / title / completed_at / slaver_id / execution_summary
- [ ] `cargo test` 验证 claim 幂等性 + complete retro 文件生成

## 技术要点
- 修改 `rust/crates/eket-cli/src/commands/task_claim.rs`：Saga 成功后触发 DocEvent::TaskClaimed
- 修改 `rust/crates/eket-cli/src/commands/task_complete.rs`：Step 5（RecordCompletion）后触发 DocEvent::TaskCompleted
- section 追加逻辑：读文件检查标记行 → 不存在则 append
- retro 目录不存在时自动 mkdir_all

## 参考文件
- `rust/crates/eket-cli/src/commands/task_claim.rs`
- `rust/crates/eket-cli/src/commands/task_complete.rs`
- `rust/crates/eket-core/src/doc_lifecycle.rs`（TASK-DOC-001 产出）
- `templates/confluence/retrospective.md.hbs`（TASK-DOC-001 产出）
