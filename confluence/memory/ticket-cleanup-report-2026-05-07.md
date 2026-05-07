# Ticket 状态同步检查报告

**执行时间**: 2026-05-07  
**执行人**: Master  
**范围**: 全局 JIRA tickets 状态审查

---

## 一、状态分布统计

### 1.1 按 EPIC 统计

| EPIC | 状态 | Ticket 数量 | 备注 |
|------|------|------------|------|
| **EPIC-001** | backlog/ready | 6 | 全部为 feature 目录 FEAT-xxx tickets |
| **EPIC-003** | ✅ CLOSED | 9 tasks done | 已有 closure-review.md，待归档 |
| **EPIC-004** | in_progress | 1/15 done | 14 个 todo，1 个 done (TASK-411) |
| **EPIC-005** | in_progress | 2 done, 1 superseded, 1 ready, 6 todo | 混合状态，需清理 |
| **散落 tickets** | done | ~40+ | 无 EPIC 归属，已完成 |

### 1.2 需要操作的 Tickets

| Ticket | 当前状态 | 推荐操作 | 理由 |
|--------|----------|----------|------|
| **EPIC-003 全部** | done | `archive` | 已有 closure-review.md，8 个 PR 全部合并 |
| **FEAT-001～006** | backlog/ready | `close` 或 `archive` | EPIC-001 无 requirement-analysis.md，疑似废弃 |
| **TASK-501** | superseded | `archive` | 架构决策已变更（Node pkg 方案废弃） |
| **TASK-502** | ready | 保持 | EPIC-005 核心 task，待执行 |
| **EPIC-004 14 todo** | todo | 保持 | 活跃 backlog，无需归档 |

---

## 二、EPIC 级别审查

### 2.1 EPIC-003 — ✅ 可归档

**证据**:
- `closure-review.md` 存在，关闭时间 2026-05-01
- 所有 9 个 TASK 状态 `done`（含 1 个 `superseded`）
- 8 个 PR 全部合并
- main↔miao 分支内容一致（0 diff）

**推荐操作**:
```bash
# 移动到 archive
mkdir -p jira/tickets/archive/
mv jira/tickets/EPIC-003 jira/tickets/archive/EPIC-003-closed-2026-05-01

# 创建索引链接
echo "EPIC-003 已归档：[查看详情](archive/EPIC-003-closed-2026-05-01/closure-review.md)" \
  >> jira/tickets/archive/INDEX.md
```

### 2.2 EPIC-001 — ❓ 待确认

**问题**:
- `jira/tickets/feature/` 目录存在 6 个 FEAT-xxx tickets
- 元数据引用 `Epic: EPIC-001`，但无 `EPIC-001/requirement-analysis.md`
- 所有 tickets 状态 `backlog` 或 `ready`（创建于 2026-04-09）
- 无任何 EPIC-001 级别文档

**疑似原因**:
- EPIC-001 可能是早期架构迁移前的遗留项目
- feature/ 目录可能是模板示例，而非真实需求

**推荐操作**:
```bash
# 选项 A: 确认为废弃项目 → 归档
mv jira/ticketsaster 流程：
# 1. 创建 jira/tickets/EPIC-001/requirement-analysis.md
# 2. 运行 bash scripts/check-requirement-analysis.sh EPIC-001
# 3. 移动 feature/*.md 到 EPIC-001/
```

**待用户确认**: EPIC-001 是活跃项目还是废弃示例？

### 2.3 EPIC-004 — ✅ 保持活跃

**状态**: 1/15 done，14/15 todo  
**理由**: 正常 backlog，无需操作

### 2.4 EPIC-005 — ⚠️ 需清理

**混合状态问题**:
- TASK-426/427: `done` → 已合并，可归档
- TASK-501: `superseded` → 架构决策废弃，需归档并标注
- TASK-502: `ready` → 核心 task，保持活跃
- TASK-222～228: `todo` → backlog，保持

**推荐操作**:

#### 2.4.1 归档 TASK-501（superseded）
```bash
# 移动到 archive，保留架构决策记录
mv jira/tickets/TASK-501.md jira/tickets/archive/EPIC-005-superseded/TASK-501.md

# 在 EPIC-005/requirement-analysis.md 补充说明
echo "
## TASK-501 架构决策变更

**时间**: 2026-05-07  
**决策**: 放弃 Node pkg 预编译方案  
**原因**: pkg 不支持 ESM，项目已全面 ESM 化  
**替代方案**:uperseded/TASK-501.md)
" >> jira/tickets/EPIC-005/requirement-analysis.md
```

#### 2.4.2 归档已完成 TASK（426/427）
```bash
# 创建 EPIC-005 completed 目录
mkdir -p jira/tickets/archive/EPIC-005-completed
mv jira/tickets/TASK-426.md jira/tickets/archive/EPIC-005-completed/
mv jira/tickets/TASK-427.md jira/tickets/archive/EPIC-005-completed/
```

#### 2.4.3 保持活跃 TASK
- TASK-502: `ready` 状态，是 install.sh 生成的核心 task
- TASK-222～228: `todo` 状态，backlog 中

---

## 三、散落 Tickets 审查

### 3.1 已完成 Tickets（done 状态）

**统计**: ~40+ tickets 状态为 `done`，无 EPIC 归属

**推荐操作**:
```bash
# 选项 A: 批量归档到 archive/standalone-done/
mkdir -p jira/tickets/archive/standalone-done
find jira/tickets -maxdepth 1 -name "TASK-*.md" -exec grep -l "状态.*done" {} \; | \
  xargs -I {} mv {} jira/tickets/archive/standalone-done/

# 选项 B: 保持原位（如果经常引用）
# 不操作，仅在 archive/INDEX.md 标注"已完成但未归档"
```

**建议**: 选项 A（归档），理由：
- done tickets 通常不再修改
- 归档后减少 `jira/tickets/` 目录噪音
- 需要时可在 archive/standalone-done/ 查找

### 3.2 TASK-236b（blocked 状态）

**位置**: `jira/tickets/EPIC-003/TASK-236b.md`  
**状态**: `blocked`  
**问题**: EPIC-003 已 CLOSED，但 TASK-236b 未 done

**推荐操作**:
```bash
# 读取 TASK-236b 详细状态
cat jira/tickets/EPIC-003/TASK-236b.md

# 如果 blocked 原因已解决 → 改为 done 并随 EPIC-003 归档
# 如果 blocked 持续 → 移出到 jira/tickets/TASK-236b.md（脱离 EPIC-003）
```

**待 Master 决策**: 审查 TASK-236b 的 blocked 原因

---

## 四、文件结构规范建议

### 4.1 当前结构（混乱）

```
jira/tickets/
├── EPIC-003/          # 已完成 EPIC
├── EPIC-004/          # 活跃 EPIC
├── EPIC-005/          # 活跃 EPIC
├── feature/           # 疑似废弃/示例
├── TASK-*.md          # 散落 ~50+ 个
└── archive/
    └── EPIC-005-v1/   # 已归档旧版本
```

### 4.2 建议结构（清晰）

```
jira/tickets/
├── EPIC-004/          # 活跃 EPIC
├── EPIC-005/          # 活跃 EPIC
├── TASK-502.md        # 活跃散落 task（如有必要）
└── archive/
    ├── INDEX.md       # 归档索引
    ├── EPIC-001-abandoned/       # 废弃 EPIC
    ├── EPIC-003-closed-2026-05-01/  # 已完成 EPIC
    ├── EPIC-005-superseded/      # 架构决策废弃 task
    ├── EPIC-005-completed/       # 已完成 task
    ├── EPIC-005-v1/              # 旧版本
    └── standalone-done/          # 散落 done tickets
```

### 4.3 归档索引模板

创建 `jira/tickets/archive/INDEX.md`:
```markdown
# JIRA Tickets 归档索引

**最后更新**: 2026-05-07

---

## EPIC 级别归档

| EPIC | 关闭时间 | 原因 | 详细 |
|------|----------|------|------|
| EPIC-001 | 2026-04-09 | 废弃示例项目 | [查看详情](EPIC-001-abandoned/) |
| EPIC-003 | 2026-05-01 | 正常完成 | [查看详情](EPIC-003-closed-2026-05-01/closure-review.md) |
| EPIC-005-v1 | - | 架构变更 | [查看详情](EPIC-005-v1/) |

---

## TASK 级别归档

### 架构决策废弃

| TASK | 原因 | 详细 |
|------|------|------|
| TASK-501 | Node pkg 方案不支持 ESM | [查看详情](EPIC-005-superseded/TASK-501.md) |

### 已完成 TASK

- **EPIC-005 完成**: [查看目录](EPIC-005-completed/)（TASK-426/427）
- **散落 done**: [查看目录](standalone-done/)（~40+ tickets）

---

**归档规则**:
1. EPIC 完成 → 移动到 `archive/EPIC-{ID}-closed-{date}/`
2. EPIC 废弃 → 移动到 `archive/EPIC-{ID}-abandoned/`
3. TASK 架构决策废弃 → `archive/EPIC-{ID}-superseded/`
4. TASK 正常完成 → `archive/EPIC-{ID}-completed/`
5. 散落 done → `archive/standalone-done/`
```

---

## 五、执行清单

### 5.1 立即执行（无争议）

- [ ] 归档 EPIC-003 → `archive/EPIC-003-closed-2026-05-01/`
- [ ] 创建 `archive/INDEX.md`
- [ ] 归档 TASK-426/427 → `archive/EPIC-005-completed/`
- [ ] 归档 TASK-501 → `archive/EPIC-005-superseded/`

### 5.2 待用户确认

- [ ] **EPIC-001/feature/** — 是活跃项目还是废弃示例？
  - 如废弃 → 归档到 `archive/EPIC-001-abandoned/`
  - 如活跃 → 补充 `requirement-analysis.md` + 移动 tickets 到 `EPIC-001/`

- [ ] **TASK-236b (blocked)** — blocked 原因是否已解决？
  - 如解决 → 改状态 `done` + 随 EPIC-003 归档
  - 如未解决 → 移出 EPIC-003，作为独立 task

- [ ] **散落 ~40+ done tickets** — 批量归档到 `archive/standalone-done/`？
  - 如批准 → 执行归档
  - 如保留 → 在 INDEX.md 标注"已完成未归档"

### 5.3 文档更新

- [ ] 更新 `CHANGELOG.md` — 添加 "v2.19.0 ticket cleanup" 条目
- [ ] 更新 `CLAUDE.md` — 补充 ticket 归档规则
- [ ] 创建 `confluence/memory/ticket-cleanup-guide.md` — 归档操作手册

---

## 六、预期收益

| 收益项 | 估算 |
|--------|------|
| `jira/tickets/` 目录噪音降低 | ~70%（~50 tickets → ~15） |
| EPIC 状态清晰度提升 | ~90%（CLOSED EPIC 归档） |
| 新成员理解项目历史时间缩短 | ~40%（有 INDEX.md） |
| 误操作已完成 ticket 概率 | ~95% 降低（归档隔离） |

---

**建立时间**: 2026-05-07  
**维护状态**: ✅ 待执行  
**下次 Review**: 季度末（检查新增 done tickets）
