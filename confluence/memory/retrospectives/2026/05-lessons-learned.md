# 经验教训 — DB+MD 双写失效排查与修复

**时间**: 2026-05-05～2026-05-06  
**问题**: 用户反馈"Slaver 说完成了，但 DB 显示 59%"  
**结论**: Slaver 正确（实际 100%），追踪系统失效

---

## 🔴 Critical Pitfalls（致命陷阱）

### P1: dispatch Agent 隔离上下文不回写主目录

**现象**: 
- dispatch 9 组并行 Agent 完成 TASK-001~281
- 代码提交到 git ✅
- MD 文件状态仍 `todo` ❌
- DB 无记录 ❌

**根因**: Agent 在隔离上下文运行，无法直接写主目录文件

**解决**:
```rust
// 主会话 dispatch 后必须代理回写
let result = agent.wait()?;
if result.success {
    task::complete(result.task_id)?;  // 主会话写 MD + DB
}
```

**教训**: dispatch Agent 完成后，主会话**必须**显式调用 `task:complete` 回写状态

---

### P2: 空实现函数静默失败

**现象**:
```ts
async function syncToSqlite() {
    console.log('✓ SQLite 同步完成（简化实现）');  // 骗人的
    return { success: true };  // 什么都没做
}
```

**影响**: `task:complete` 调用此函数，以为 DB 已同步，实际 DB 永远为空

**解决**: Code Review 时重点检查"简化实现""TODO""暂不实现"注释

**教训**: 空实现函数**必须**返回 `Error` 或 `unimplemented!()`，不能返回 `success`

---

### P3: 双写系统不原子导致不一致

**现象**:
- `task:create` 写 MD ✅
- `task:create` 写 DB... 失败（条件不满足）❌
- 结果：MD 有，DB 无

**根因**: 
```sql
UPDATE tickets ... WHERE id=? AND status='ready'
-- 但 create 时 status='todo'，条件不匹配
```

**解决**: 
1. 双写用事务（MD + DB 原子提交）
2. WHERE 条件宽松：`status IN ('todo', 'ready', 'backlog')`

**教训**: 双写系统**必须**原子，否则会静默失真

---

## 🟡 Important Patterns（重要模式）

### Pattern 1: 状态字段必须严格规范

**问题**: 发现 7 种格式
- `**状态**: done`
- `status: done`
- `**状态**: DONE`
- `**状态**: ✅Done`
- `**状态**: ✅完成`
- `**状态**: Done`
- `**状态**: completed`

**影响**: 正则解析失败，统计混乱

**解决**: 
```python
def normalize_status(s):
    s = s.lower().strip().lstrip('✅').split('(')[0]
    mapping = {'done': 'done', 'completed': 'done', ...}
    return mapping.get(s, s)
```

**教训**: 状态字段需 **Schema 校验** + **归一化函数**

---

### Pattern 2: 两套表并存需显式统一

**问题**: `tickets` 表 vs `ticket_index` 表
- 不同 schema（priority INTEGER vs TEXT）
- 不同模块写入（Rust vs Node.js）
- `task:progress` 读哪个？不确定

**解决**: 
1. Code Review 发现
2. 创建 TASK-272 统一 schema
3. 废弃 `ticket_index`，全部用 `tickets`

**教训**: 双表系统**必须**明确：谁是 primary？如何同步？

---

### Pattern 3: 降级机制必须早期测试

**问题**: DB 不可用时，代码是否仍能运行？

**验证方法**:
```bash
chmod 000 ~/.eket/data/sqlite/eket.db
eket task:create "test"
# 期望: WARN + MD 创建成功（不报错）
```

**教训**: 降级测试**必须**在 Code Review 前完成（TASK-270 已做到）

---

## 🟢 Action Items（已落地）

### 已完成修复
- [x] TASK-270: task:create 双写 MD + DB
- [x] TASK-271: task:claim 条件修复
- [x] TASK-273: `eket db:recover --from from-md` 批量恢复
- [x] TASK-274/275/276: Master/Slaver 身份冲突修复
- [x] TASK-277: Node.js 测试适配
- [x] TASK-278~281: Code Review 安全加固

### 已建立机制
- [x] DB + MD 双向同步
- [x] Archive 机制（`jira/archive/ARCHIVE-INDEX.md`）
- [x] 降级测试覆盖（chmod 000 场景）
- [x] Code Review 流程（发现 5 个安全问题）

---

## 📊 数据修正记录

| 指标 | 修复前 | 修复后 | 差异 |
|------|--------|--------|------|
| done | 133 | 217 | +84 |
| todo | 89 | 0 | -89 |
| 完成率 | 59% | 100% | +41% |

**84 张状态修正**:
- 33 张：git 有代码但 MD/DB 状态未更新
- 11 张：本轮新修复 ticket（TASK-270~281）
- 40 张：历史 ticket 状态归一化修正

---

## 🎓 核心教训（Broadcast to all future Slavers）

1. **dispatch Agent 必须回写** — 隔离上下文完成后，主会话必须调用 `task:complete`
2. **双写必须原子** — MD + DB 写入需事务保证一致性
3. **空实现不能返回 success** — 返回 Error 或 unimplemented!()
4. **状态字段需 Schema** — 禁止自由格式（done/DONE/✅Done 混用）
5. **双表系统需明确 primary** — 谁是权威？如何同步？
6. **降级测试必须早期** — chmod 000 / rename DB / 网络断开
7. **Code Review 必查安全** — JWT secret 长度 / expiration / 竞态条件

---

## 📚 沉淀到知识库

已写入文档:
- `confluence/memory/db-md-sync-fix-report.md` — 技术复盘
- `confluence/memory/task-275-lessons.md` — Slaver 退出清理
- `confluence/memory/redis-architecture-analysis.md` — Redis 架构
- `confluence/memory/lessons-learned-2026-05-06.md` — 本文档

---

**总结**: 100% 的项目显示 59%，问题出在追踪系统。修复后验证了 Slaver 团队的判断完全正确。
