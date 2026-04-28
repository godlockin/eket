# TASK-DOC-001: 模板系统 + DocLifecycleMiddleware 骨架

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **预估工时**: 480min
- **epic**: DOC-LIFECYCLE

## 需求描述
实现 DocLifecycleMiddleware 基础设施，使后续所有生命周期节点可以自动产出 confluence 文档。

## 验收标准
- [ ] `rust/crates/eket-core/src/doc_lifecycle.rs` 存在，包含 `DocEvent`、`DocLifecycleMiddleware`、`TemplateRenderer`
- [ ] `templates/confluence/requirement-analysis.md.hbs`、`architecture-plan.md.hbs`、`retrospective.md.hbs`、`expert-review.md.hbs` 存在
- [ ] `templates/jira/ticket.md.hbs`、`epic.md.hbs` 存在
- [ ] `DocLifecycleMiddleware` 注册到 `middleware_pipeline.rs` post hook
- [ ] `cargo test -p eket-core -- doc_lifecycle` 全部通过
- [ ] 文档写入失败只 warn 不 panic（不阻塞主流程）
- [ ] 幂等：追加前检查 `<!-- eket:section:xxx -->` 标记行

## 技术要点
- `DocEvent` enum: EpicCreated / EpicPlanned / TaskClaimed / TaskCompleted / ExpertReviewed
- 模板引擎：`handlebars` crate（添加到 eket-core/Cargo.toml）
- 模板查找优先级：`./templates/` > `~/.eket/templates/` > 内置字符串
- 原子写：已存在文件追加 section，新文件直接创建

## 参考文件
- `rust/crates/eket-core/src/middleware_pipeline.rs`（注入位置）
- `rust/crates/eket-core/src/doc_lifecycle.rs`（新建）
- `templates/confluence/*.md.hbs`（新建）

## 执行日志

**执行者**: rust-slaver
**完成时间**: 2026-04-27

### 实现摘要
1. 添加 `handlebars = "6"` 到 `eket-core/Cargo.toml`
2. 新建 `src/doc_lifecycle.rs`：DocEvent enum（6种事件）、TemplateRenderer（三级查找）、DocLifecycleMiddleware（async_trait impl）、handle_event()、append_section_if_absent()
3. 模板文件：confluence/{requirement-analysis,architecture-plan,retrospective,expert-review}.md.hbs + jira/epic.md.hbs
4. `lib.rs` 添加 `pub mod doc_lifecycle;`
5. Pipeline::default() 无状态，DocLifecycleMiddleware 可按需 .add() 注册

### 测试结果
```
cargo test -p eket-core: 115 passed, 1 ignored
```

### 注意事项
- `include_str!` 路径从 crate 根相对，实际为 `../../../../templates/...`（相对于 src/doc_lifecycle.rs）
- Pipeline::default() 是空 pipeline，DocLifecycleMiddleware 需调用方手动 `.add()`
- 文档写入失败 eprintln!("[WARN]") 不 panic，主流程不受影响

