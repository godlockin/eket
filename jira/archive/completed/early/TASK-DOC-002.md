# TASK-DOC-002: eket epic:create + eket epic:plan

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **预估工时**: 480min
- **epic**: DOC-LIFECYCLE
- **blocked_by**: TASK-DOC-001

## 需求描述
实现两个新 CLI 命令，覆盖需求分析和架构规划节点的文档自动产出。

## 验收标准
- [ ] `eket epic:create <EPIC-ID> "<title>"` 创建 `jira/epics/<EPIC-ID>/epic.md` + `confluence/requirements/<EPIC-ID>-analysis.md`
- [ ] `eket epic:plan <EPIC-ID>` 生成 `confluence/architecture/<EPIC-ID>-plan.md`（含 Mermaid 图骨架）
- [ ] 两个命令均触发对应 DocEvent 走 DocLifecycleMiddleware
- [ ] EPIC-ID 已存在时 epic:create 报错 conflict（不覆盖）
- [ ] `cargo test -p eket-cli -- epic` 全部通过

## 技术要点
- 新建 `rust/crates/eket-cli/src/commands/epic_create.rs`
- 新建 `rust/crates/eket-cli/src/commands/epic_plan.rs`
- 注册到 `rust/crates/eket-cli/src/main.rs` clap subcommand
- 使用 TASK-DOC-001 的 TemplateRenderer 填充模板变量：epic_id / title / timestamp / author

## 参考文件
- `rust/crates/eket-cli/src/commands/task_create.rs`（参考命令结构）
- `templates/confluence/requirement-analysis.md.hbs`（TASK-DOC-001 产出）
- `templates/confluence/architecture-plan.md.hbs`（TASK-DOC-001 产出）

## 实现摘要
- `epic_create.rs`: guard重复、delegate→DocEvent::EpicCreated、patch author字段
- `epic_plan.rs`: guard epic.md存在、delegate→DocEvent::EpicPlanned（覆盖模式）
- `main.rs` + `mod.rs`: 注册两命令
- 修复 `task_create.rs` 测试中缺失 `epic: None` 字段（预存在编译错误）
- `cargo test -p eket-cli -- epic`: 8 passed ✓
