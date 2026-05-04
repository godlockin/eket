---
title: expert dispatch 等待队列 + 按需召唤模式
category: pattern
source_ticket: TASK-247, TASK-248
created_at: 2026-05-04
---

# Expert Dispatch 等待队列 + 按需召唤

## 场景

heartbeat 找不到匹配专家时，不应沉默 skip，也不应阻塞主流程。正确做法：写等待队列，异步通知，下次优先重试。

## 完整 dispatch 流程

```
task:create --expertise rust
      ↓ 未知 tag → auto-scaffold persona（extended/rust.md）
master:heartbeat（周期循环）
      ↓ 读 required_expertise，匹配 idle slaver
      ├─ 有匹配 → 派送，清理 waiting 条目
      └─ 无匹配 → 写 waiting-for-expert.json + inbox/need-expert-*.md
                        ↓ 人工 / 自动
             expert:summon --role rust
                        ↓ 注册新 slaver 实例（idle）
             master:heartbeat（下次循环）
                        ↓ waiting 队列优先，精准派送，清理
```

## 队列优先级

```
priority_tickets 构建顺序：
  1. unblocked-queue.json（依赖全解除，最高优先）
  2. waiting-for-expert.json（等待时间越长 retries 越高，越靠前）
  3. DAG-ready（普通就绪 tickets）
```

## expert:summon 两种用法

```bash
eket expert:summon --role rust          # 召唤单个角色
eket expert:summon --from-waiting       # 批量处理 waiting-for-expert.json 中所有缺失角色
```

- 已有对应角色的 idle/busy slaver → skip（`already_exist`）
- 无 → `upsert_instance(role, skills=[role], status=idle)`

## 文件约定

| 文件 | 用途 |
|------|------|
| `.eket/state/waiting-for-expert.json` | 等待队列，含 ticket_id / required / since / retries |
| `.eket/inbox/need-expert-{TASK-NNN}.md` | 人类可读召唤建议，派送成功后删除 |
| `~/.claude/skills/eket/experts/extended/{tag}.md` | auto-scaffold persona 骨架 |

## 注意

- waiting 队列和 inbox 文件在派送成功后必须清理，否则下次心跳会重复处理
- `expert:summon` 只注册 DB 实例，不启动真正的 AI session；真实 Slaver 需人工启动并 `slaver:register`
- auto-scaffold 的 persona 骨架只有最小字段，需人工补充完整设定后 `task:claim` 才能获得有效专家上下文
