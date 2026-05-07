# TASK-DOC-005: eket doc:status 完整性检查

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **预估工时**: 360min
- **epic**: DOC-LIFECYCLE
- **blocked_by**: TASK-DOC-001

## 需求描述
实现 doc:status 命令，扫描 EPIC 文档完整性；集成到 task:complete 前置 warn。

## 验收标准
- [ ] `eket doc:status <EPIC-ID>` 输出 JSON，包含 missing / present / warnings 三个数组
- [ ] 检查项：epic.md、requirement-analysis.md、architecture-plan.md、每个关联 ticket 的 retro 文件
- [ ] `eket doc:status --all` 扫描所有 EPIC
- [ ] `task:complete` 执行时若缺少 retro 模板打印 warn（不阻塞）
- [ ] `cargo test -p eket-cli -- doc_status` 通过

## 技术要点
- 新建 `rust/crates/eket-cli/src/commands/doc_status.rs`
- 扫描 `jira/epics/<EPIC>/` + `confluence/requirements/` + `confluence/architecture/` + `confluence/memory/retrospectives/`
- ticket 列表从 EPIC plan 的 `<!-- eket:section:tickets -->` 解析
- task:complete.rs 在 Saga Step 1（ValidateTicket）前插入 doc warn 检查

## 参考文件
- `rust/crates/eket-cli/src/commands/project_status.rs`（参考扫描模式）
- `rust/crates/eket-cli/src/commands/task_complete.rs`（注入 warn 位置）
