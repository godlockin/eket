# TASK-DOC-007: Roadmap / Spike / Design 文档命令 + 模板

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **预估工时**: 480min
- **epic**: DOC-LIFECYCLE

## 需求描述
补充三类缺失的 confluence 文档场景：项目 Roadmap、技术 Spike 调研、设计文档。
每类都需要：Rust 命令 + Handlebars 模板 + DocEvent + handle_event 处理。

## 验收标准
- [x] `eket roadmap:update <PROJECT_ID> [--quarter Q2-2026]` → `confluence/roadmap/<PROJECT_ID>.md`（已存在则更新 quarter section）
- [x] `eket spike:create <SPIKE_ID> "<title>" [--epic EPIC_ID]` → `confluence/spikes/<SPIKE_ID>/plan.md` + `jira/tickets/<SPIKE_ID>.md`
- [x] `eket spike:complete <SPIKE_ID> --outcome adopt|reject|defer` → `confluence/spikes/<SPIKE_ID>/findings.md` + ticket 状态→done
- [x] `eket doc:create <TYPE> <ID> "<title>"` → 通用文档创建（type: design|adr|runbook|onboarding）→ `confluence/<type>/<ID>.md`
- [x] DocEvent 新增：RoadmapUpdated / SpikeStarted / SpikeCompleted / DesignDocCreated
- [x] 所有模板（`roadmap.md.hbs` / `spike-plan.md.hbs` / `spike-findings.md.hbs` / `design.md.hbs`）存在
- [x] `cargo test -p eket-cli -- roadmap spike doc_create` 通过（6 passed）

## 技术要点
- 新建命令文件：`roadmap_update.rs` / `spike_create.rs` / `spike_complete.rs` / `doc_create.rs`
- roadmap.md.hbs：季度目标 + Epic 列表 + 优先级矩阵 + 里程碑时间线
- spike-plan.md.hbs：问题陈述 + 调研范围 + 时间盒（time-box）+ 成功标准
- spike-findings.md.hbs：结论（adopt/reject/defer）+ 证据 + 下一步行动
- design.md.hbs：背景 + 方案对比 + 决策 + 影响面（ADR 格式）
- spike 同时创建 jira ticket（类型=spike，预估≤480min）

## 参考文件
- `rust/crates/eket-core/src/doc_lifecycle.rs`（扩展 DocEvent）
- `rust/crates/eket-cli/src/commands/epic_create.rs`（参考命令结构）
- `templates/confluence/`（现有模板参考）
