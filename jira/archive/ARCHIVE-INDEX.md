# Archived Tickets Index

**归档时间**: 2026-05-05  
**归档数量**: 38 张

## 归档原则

| 状态 | 说明 | DB 标记 |
|------|------|---------|
| `dropped` | 需求取消、方向变更、重复 | status='dropped' |
| `superseded` | 被新任务取代 | status='dropped' |
| `closed` | 人工关闭（非完成） | status='dropped' |

## 归档列表

| TASK-013 | dropped | GitHub Actions CI 流水线 |
| TASK-014 | dropped | 健康检查端点 |
| TASK-015 | dropped | 版本号对齐 + Round 13b 状态更新 |
| TASK-024 | dropped | PR Review Checklist 补充 4-Level Artifact Verification |
| TASK-025 | dropped | Slaver 偏差处理协议（Deviation Rules 4 分类） |
| TASK-027 | dropped | Slaver 可用命令集规范 |
| TASK-031 | dropped | Master 禁止写代码的物理级约束 |
| TASK-032 | dropped | Master CLAUDE.md 实时状态读取 |
| TASK-035 | dropped | Hook 脚本骨架（状态变更触发管道） |
| TASK-037 | dropped | CLAUDE.md 角色分离拆分 |
| TASK-039 | dropped | 进度上报模板内嵌 mini-rules |
| TASK-050 | superseded | governance hardening + continuous retro/phase loop |
| TASK-051 | superseded | post-merge-broadcast 修复 |
| TASK-052 | superseded | # TASK-052 |
| TASK-053 | closed | # TASK-053 |
| TASK-054 | dropped |  |
| TASK-055 | superseded |  |
| TASK-056 | superseded |  |
| TASK-057 | dropped |  |
| TASK-061 | dropped |  |
| TASK-062 | dropped |  |
| TASK-063 | dropped |  |
| TASK-072 | superseded | 替换轮询，实时推送 Agent 状态 |
| TASK-076 | superseded | TASK-064 task:resume 接入 resumeWithFallback() |
| TASK-077 | superseded | TASK-065 claim.ts 接入 sqlite-client.claimTask() |
| TASK-078 | superseded | TASK-067 Slaver 执行阶段触发 appendTaskMessage() |
| TASK-079 | superseded | TASK-069 SLAVER-RULES 加载 ACTIVE_CONTEXT.md |
| TASK-080 | superseded | TASK-070 注册 workflow:run CLI 命令 |
| TASK-081 | superseded | TASK-071 模型路由结果传递给 Claude SDK |
| TASK-082 | superseded | TASK-072 确认 SSEEventBus 在可达分支上实现完整 |
| TASK-083 | superseded | TASK-075 master-heartbeat 实际调用 canProceed() |
| TASK-105a |  | 生命周期封装 |
| TASK-105b |  | # TASK-105b: task:claim/complete 集成 worktree 隔离 |
| TASK-193 | dropped | WebSocket连接加认证——防止冒充任意agent |
| TASK-202 | dropped | 角色级模型路由 |
| TASK-203 | dropped | 并行验收门禁 |
| TASK-204 | dropped | 长流程token控制 |
| TASK-252 | closed | ruflo 借鉴研究经验沉淀 |

## DB 同步命令

```bash
# 标记 archive 目录中的 ticket 为 dropped
for f in jira/archive/TASK-*.md; do
  tid=$(basename "$f" .md)
  sqlite3 ~/.eket/data/sqlite/eket.db \
    "UPDATE tickets SET status='dropped' WHERE id='$tid';"
done
```

## 验证

```bash
sqlite3 ~/.eket/data/sqlite/eket.db \
  "SELECT COUNT(*) FROM tickets WHERE status='dropped';"
# 期望：38 条
```
