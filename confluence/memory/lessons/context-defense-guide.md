# Context Length 防护使用指南

**版本**: v1.0 (EPIC-006)  
**更新**: 2026-05-11  
**适用**: 所有 EKET Slavers

---

## 快速参考

### Slaver 无需操作 ✅

**五层防护自动启用**，无需手动干预：
1. ✅ 120k 自动 compact
2. ✅ Tool output 自动过滤
3. ✅ 错误自动告警
4. ✅ 风险自动上报
5. ✅ 日志自动记录

### Master 介入时机

**仅收到告警文件时**:
- `inbox/human_feedback/[ALERT] context-overflow-TASK-*.md`
- `inbox/human_feedback/[ALERT] context-system-critical.md`
- `.eket/inbox/context-risk-TASK-*.md`

**响应命令**:
```bash
# 拆分大任务
eket task:split TASK-123

# 查看统计
eket logs:context-overflow
```

---

## 五层防护详解

### Layer 1: Auto-Compact (主动预防)

**触发**: Session tokens ≥ 120k  
**行为**:
1. 自动执行 `/compact`
2. 失败等待 2s 后重试
3. 双重失败创建告警

**告警**: `.eket/inbox/compact-failure-<timestamp>.md`

**Slaver 操作**: 无（全自动）

---

### Layer 2: Tool Output Filter (智能优化)

**作用**: 大输出场景节省 60-80% tokens

**策略**:
- **Grep**: 精确匹配优先，限 100 条
- **Glob**: mtime 降序，stat 限 200，限 100 条
- **ls**: 保持原顺序
- **通用**: 截断 5000 chars

**示例**:
```
# Before filtering
Grep: 500 results → 120k tokens

# After filtering
Grep: 50 results (exact matches first) → 30k tokens
Footer: "[... 450 more results]"
```

**Slaver 操作**: 无（自动过滤）

---

### Layer 3: Alert System (被动监控)

**Task-level** (3 次阈值):
- 单任务触发 3 次 400 错误
- 创建: `inbox/human_feedback/[ALERT] context-overflow-TASK-XXX.md`
- 包含: 错误次数、token 历史、建议操作

**System-level** (5 次阈值):
- 全局累计 5 次 400 错误
- 创建: `inbox/human_feedback/[ALERT] context-system-critical.md`
- 包含: 受影响任务、紧急措施

**自动清理**: 任务完成时删除对应告警

**Master 操作**: 读取告警 → 决策拆分/调整

---

### Layer 4: Slaver 主动上报 (自适应)

**触发**: Slaver 检测到 120k (执行中)

**行为**:
1. 创建风险告警: `.eket/inbox/context-risk-TASK-XXX.md`
2. 发送消息到 Master
3. 暂停等待 Master 决策

**告警内容**:
- 当前 tokens
- 已完成工作概述
- 建议拆分方案 (3 选项)

**Master 响应**:
```bash
eket task:split TASK-XXX --into 2
```

---

### Layer 5: 可观测性 (问题溯源)

**Error Log**:
- 位置: `.eket/logs/context-overflow.log`
- 格式: `[timestamp] sessionId=X, taskId=Y, tokens=Z, result=recovered|failed`
- 查询: `eket logs:context-overflow`

**Session Snapshot**:
- 位置: `.eket/debug/session-<id>-overflow.json`
- 内容: metadata only (last 20 messages, tool sequence)
- 大小: < 10MB (自动精简)

**查询输出**:
```
📊 Context Overflow Statistics

Total errors: 12
Recovered: 10 (83.3%)
Failed: 2

📝 Recent 10 entries:
[2026-05-10T20:30:00Z] sessionId=abc, taskId=TASK-607, tokens=150000, result=recovered
...
```

---

## 告警决策流程

### 收到 Task Alert (3 次错误)

**选项 A: 拆分任务** (推荐)
```bash
eket task:split TASK-XXX --into 2
# 创建 TASK-XXX-a, TASK-XXX-b
```

**选项 B: 限制分析深度**
```markdown
# 在 ticket 添加约束
## 执行约束
- Max Read: 5 files
- Use Grep for search
- Avoid large files
```

**选项 C: 人工接管**
```bash
# Master 手动完成
eket task:manual-override TASK-XXX
```

---

### 收到 System Alert (5 次全局)

**紧急措施**:
1. 暂停自动任务分配
2. 审查任务拆分粒度
3. 升级 Slaver 指令（硬性约束）

**中期优化**:
1. 引入 Context Budget 机制
2. 强化分析瘫痪检测
3. 考虑模型层级升级

---

### 收到 Slaver 上报

**Slaver 主动请求拆分**:
```bash
# 读取告警文件
cat .eket/inbox/context-risk-TASK-XXX.md

# 执行拆分
eket task:split TASK-XXX --into 2

# Slaver 收到通知后继续
```

---

## 监控指标

### 主动监控

```bash
# Context 错误统计
eket logs:context-overflow

# 活跃告警
ls inbox/human_feedback/[ALERT]*.md

# Session 状态
ls .eket/debug/session-*.json
```

### 被动通知

**Master 会收到**:
- 告警文件自动创建
- 消息队列通知
- 日志实时记录

---

## 故障排查

### Q: Auto-compact 不工作？

**检查**:
```bash
# 查看日志
cat .eket/logs/context-overflow.log

# 检查告警
ls .eket/inbox/compact-failure-*.md

# 手动触发
/compact
```

### Q: Tool output 未过滤？

**验证**:
```bash
# 检查 pipeline 是否启用
grep "FilterNode" node/src/hooks/pipelines/post-tool-use.ts

# 测试
eket knowledge:search "test" | wc -l  # 应 ≤ 100
```

### Q: 未收到告警？

**检查**:
```bash
# Alert Manager 是否集成
grep "alertManager.recordError" node/src/core/claude-runner.ts

# 手动测试
node -e "const {alertManager} = require('./dist/core/alert-manager.js'); alertManager.recordError('TEST', 150000).then(() => console.log('OK'))"
```

---

## 版本历史

**v1.0** (2026-05-11, EPIC-006):
- 五层防护初始版本
- Auto-compact + retry
- Tool output filter
- Alert system (3/5 阈值)
- Slaver 主动上报
- Error logging + snapshot

---

**维护者**: eket-framework-team  
**文档**: `confluence/memory/context-defense-guide.md`
