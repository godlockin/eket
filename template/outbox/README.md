# outbox/ — Agent 输出箱

**版本**: v2.0.0
**最后更新**: 2026-04-06

## 用途

`outbox/` 是 Agent 的**输出暂存区**，用于存放已完成但尚未被处理的输出内容。

## 目录结构

```
outbox/
├── README.md          # 本文件
├── tasks/             # 任务相关输出（分析报告、完成通知等）
│   └── README.md      # 任务输出说明
└── messages/          # 消息输出（跨实例通知）
    └── .gitkeep
```

## 工作流程

1. **Slaver 输出**：完成分析/开发后，将输出写入 `outbox/tasks/<ticket-id>/`
2. **Master 读取**：Master 定期扫描 outbox，处理待审批的输出
3. **清理归档**：处理完毕后，将文件移至 `outbox/archive/`

## 命名规范

- 分析报告：`outbox/tasks/<ticket-id>/analysis-report.md`
- 完成通知：`outbox/tasks/<ticket-id>/completion-notice.md`
- PR 请求：`outbox/tasks/<ticket-id>/pr-request.md`

> **注意**：`outbox/` 目录的内容不应提交到 Git，请确保 `.gitignore` 中包含相关规则（`outbox/tasks/*/` 等动态内容）。
