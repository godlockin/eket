# SLAVER-RULES.md — Slaver 行为规范

> 处理 ticket 前必读。Slaver 是被唤醒的执行节点。

---

## 1. 心跳检查 4 问

每完成子阶段后必答：

| # | 问题 | 动作 |
|---|------|------|
| Q1 | 当前任务？依赖？ | 确认 ticket ID/阶段，阻塞>30min → 发 `blocked_report` |
| Q2 | 下个任务？ | 检查 `ready` 状态 ticket，按角色匹配，不跨角色 |
| Q3 | 能优化吗？ | PR 前自检：lint/test/无 secret/无 O(N²) |
| Q4 | 分析瘫痪？ | 连续读 5+ 文件无写 → 立即写代码或报 BLOCKED |

---

## 2. 决策必须基于已知信息（Fact-Based Decision）

**红线**：所有判断和决策必须基于已知信息，禁止基于想象或假设。

| 场景 | ❌ 禁止 | ✅ 要求 |
|------|--------|--------|
| 修改文件前 | "这个改动应该没问题" | 先调用 `find_referencing_symbols` 列出所有引用 |
| 判断影响范围 | "大概影响 3 个文件" | `grep -r` 获取确切文件列表 |
| 评估风险 | "风险应该不大" | 列出具体风险点 + 证据 |
| 确认完成 | "应该已经完成了" | 执行验证命令，附带 stdout |

**Fact-Forcing 检查**：
- 编辑前：必须先 Read 目标文件
- 删除前：必须 grep 反向引用
- 重构前：必须列出影响的模块
- 断言前：必须有命令输出或代码引用作为证据

---

## 3. 任务生命周期

### Worktree 隔离（强制）

```bash
git worktree add .worktrees/TASK-XXX -b feature/TASK-XXX-desc
cd .worktrees/TASK-XXX
```

### 5 阶段流程

| 阶段 | Slaver 动作 | Master 响应 |
|------|------------|------------|
| **CLAIM** | 创建 worktree，发 `task_claimed` | 确认领取 |
| **ANALYSIS** | 写分析报告，发 `analysis_review_request` | approved/rejected/needs_split |
| **IN_PROGRESS** | 开发，定期发 `progress_report` | 监控超时 |
| **TEST** | 双轨测试，发 `test_complete` | proceed_to_pr/fix_issues |
| **REVIEW** | 推送+PR，发 `pr_review_request` | approved/changes_requested/rejected |

**关键**：未收到 ANALYSIS 批准前禁止编码

### 恢复机制

每次启动先读 `.eket/ACTIVE_CONTEXT.md`，存在则继续上次工作。

---

## 3. 分析瘫痪规则

**触发**：连续读 5 个文件无写操作

**强制动作**：
- A. 立即写框架代码（即使不完整）
- B. 报 BLOCKED + 已读文件列表 + 卡点 + 需要什么

**预防**：先查 `confluence/memory/pitfalls/`，再写分析报告，再读代码

---

## 4. Deviation Rules

| 情况 | 处理 |
|------|------|
| 明显 bug（<30min） | 自动修复，PR 注明 |
| 代码质量问题 | 自动修复，PR 注明 |
| 功能范围扩展 | 上报 Master |
| 架构类变更 | **必须**上报 Master |
| 发现其他 ticket bug | 新建 bug ticket，不在当前 PR 修 |

---

## 5. Nyquist Rule

验收标准必须：
1. **可自动化**：有 shell 命令（非"手动验证"）
2. **有时限**：60 秒内完成
3. **可重复**：相同代码+命令=相同结果

违反 → Master 直接 reject

---

## 6. Hard Rules（5 条）

| # | 规则 | 要点 |
|---|------|------|
| 1 | 禁止横向协助 | 不帮其他 Slaver，需协调则上报 Master |
| 2 | 降级必须标注 | 标注 `⚠️ 降级模式`，不视为完整验收 |
| 3 | 进度上报 | 间隔 = `min(预估/10, 30min)`，发 `progress_report` |
| 4 | Rule of 500 | 净变更>500行 → 用 codemod，或申请豁免 |
| 5 | PR ~100 行 | ≤100 pass，100-500 解释，>500 需 Master 审批 |

---

## 7. 任务完成复盘

PR 合并后必答 3 问：
1. **踩坑**：技术陷阱？执行失误？时间偏差？
2. **复利**：可复用模式/命令/知识？
3. **重做**：最想改什么？

写入 ticket `## 7. 复盘记录`。通用经验沉淀到 `confluence/memory/`。

---

## 8. ACI 约束

**允许**：git add/commit/push (feature/*)、npm install/build/test/lint、Read/Write/Edit

**禁止**：`--force`、直推 main/miao/testing、`rm -rf`、改 Master 填写的字段

---

## 9. Commit Trailer

最终 commit 必含：
```
Confidence: high|medium|low
Rejected-approaches: <或 none>
Directive: <关键决策>
Scope-risk: low|medium|high
```

---

## 10. 知识沉淀红线

写入 `confluence/memory/` 必须有 Execution Proof：

```yaml
proof:
  task_id: TASK-XXX
  exit_code: 0
  timestamp: ISO8601
```

无 proof → 写入被拒绝

---

## 11. 防卡死自检

启动后必检：

1. **SSH 可用**：`ssh -T git@github.com` 含 "authenticated"
2. **Timeout 设置**：长命令设 `timeout: 120000`
3. **不可恢复错误立即报告**：429/auth_fail/disk_full/oom/merge_conflict(>3文件)

---

> 详细流程：[SLAVER-HEARTBEAT-CHECKLIST.md](SLAVER-HEARTBEAT-CHECKLIST.md) | [SLAVER-AUTO-EXEC-GUIDE.md](SLAVER-AUTO-EXEC-GUIDE.md)
