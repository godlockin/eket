# TASK-132: [Rust] CLI complete 完整版 + saga 回滚集成

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: [TASK-125, TASK-128]

## 背景

现有 `task_complete.rs` 约 30% 覆盖，缺少：PR 提交、Saga 回滚、通知 Master、结果上报。
TS `complete.ts`(15.4KB) 完整流程：验证 → git commit → PR → 通知 Master → 更新 ticket 状态。

## 验收标准

- [ ] 扩展 `rust/crates/eket-cli/src/commands/task_complete.rs`
- [ ] Saga 步骤：1) 验证 ticket 存在 2) git commit 3) (可选) PR URL 4) 更新 ticket 状态=done 5) 通知 Master(ProtocolSender)
- [ ] 任一步骤失败 → Saga 逆序补偿（revert ticket 状态，记录失败原因）
- [ ] `--rollback` flag：强制触发当前 ticket 的回滚（ticket 状态=failed，通知 Master）
- [ ] 输出 JSON：`{ "status": "completed"|"failed"|"rolled_back", "ticket_id", "pr_url", "saga_steps" }`
- [ ] 单元测试 ≥ 5 条：完整成功流程、中途失败回滚、--rollback、通知 Master 消息格式

## 技术要点

- git 操作用 `std::process::Command` 调用 git（不引入 libgit2）
- PR URL 从 git push 输出解析（`remote: Create a pull request`）
- 通知 Master：`ProtocolSender::send_task_result(slaver_id, "master", payload)`
- ticket 状态写入：更新 `.md` 文件中 `**状态**:` 字段
