# Master 助理角色 Prompt 模板

本目录包含 Master 可委托的 5 个助理角色的 prompt 模板。

---

## 助理角色列表

| 角色 | 文件 | 职责 | 触发条件 |
|------|------|------|----------|
| `pr_reviewer` | [pr_reviewer.md](pr_reviewer.md) | 4-Level PR 审核 | 待审 PR > 3 |
| `scrum_master` | [scrum_master.md](scrum_master.md) | 心跳监控、进度汇总 | 消息积压 > 10 |
| `incident_reviewer` | [incident_reviewer.md](incident_reviewer.md) | 超时根因诊断 | 超时事件 > 2 |
| `analysis_reviewer` | [analysis_reviewer.md](analysis_reviewer.md) | 分析报告审核 | 有 analysis_review_request |
| `test_reviewer` | [test_reviewer.md](test_reviewer.md) | 测试结果审核 | 有 test_complete 消息 |

---

## 使用方式

### 手动启动

Master 根据负载情况手动启动助理 subagent：

```bash
# 示例：启动 pr_reviewer 助理
claude --prompt "$(cat template/prompts/assistants/pr_reviewer.md)" \
       --input '{"pr_number": "feature/TASK-101-xxx", "ticket_id": "TASK-101"}'
```

### 自动触发

参考 `template/docs/MASTER-RULES.md` §Rule 4.3 的自动触发条件。

---

## 权限边界

**所有助理共同遵守**：

| 可以做 | 不可以做 |
|--------|----------|
| 读取文件 | 修改 ticket 状态 |
| 执行验证命令 | 合并/驳回 PR |
| 生成报告 | Release Slaver |
| 发送提醒 | 创建新 ticket |

**最终决策权归 Master**。

---

## 输出位置

所有助理报告写入：
```
shared/message_queue/inbox/assistant_report/<role>_<context>_<timestamp>.json
```

Master 需定期扫描此目录处理助理建议。

---

## 相关文档

- [MASTER-RULES.md §Rule 4](../../docs/MASTER-RULES.md) — 负载分担机制
- [master-single-point-failure.md](../../../confluence/memory/pitfalls/master-single-point-failure.md) — 问题背景
- [supervisor.sh](../../../scripts/supervisor.sh) — 外部兜底脚本
