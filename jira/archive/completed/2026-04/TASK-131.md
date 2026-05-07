# TASK-131: [Rust] CLI task-create — ticket 创建

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: [TASK-124]

## 背景

TS `task-create.ts`(9.9KB) 创建新 ticket markdown 文件，是 Master 拆任务的核心命令。
需要支持：标题/类型/优先级/依赖，并自动写入 jira/tickets/TASK-NNN.md。

## 验收标准

- [ ] `rust/crates/eket-cli/src/commands/task_create.rs`
- [ ] `eket task:create "<title>" [--type feature|bug|chore] [--priority P0-P3] [--blocked-by TASK-X,TASK-Y] [--assignee <id>]`
- [ ] 自动计算下一个 TASK-NNN 编号（扫描 tickets 目录最大值 +1）
- [ ] 生成符合 EKET ticket 格式的 markdown 文件（元数据 + 背景/验收标准占位）
- [ ] 调用 DAG 环检测（TASK-124）：若 blocked-by 形成环路则拒绝创建
- [ ] 输出 JSON：`{ "status": "created", "ticket_id", "path", "blocked_by" }`
- [ ] 单元测试 ≥ 4 条：基本创建、自动编号、环路拒绝、blocked_by 解析

## 技术要点

- ticket 格式与现有 TASK-xxx.md 保持完全一致（兼容 TS 版本解析）
- 编号计算：`max(已有 TASK-NNN) + 1`，并发安全（文件创建用 `OpenOptions::create_new`）
- blocked-by 写入格式：`- blocked_by: [TASK-X, TASK-Y]`
