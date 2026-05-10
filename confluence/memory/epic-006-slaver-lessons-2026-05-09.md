# EPIC-006 Slaver 协作经验教训

**执行时间**: 2026-05-08～05-09  
**Master**: master-001  
**范围**: TASK-601 实施 + Slaver 工作方式调整

---

## 一、背景 Agent 幻觉问题

### 1.1 问题发现

**初次召唤**（background agents）:
- 使用 `run_in_background: true` 启动 5 个 Slaver agents
- Slavers 汇报"完成实现 + 测试 + PR"
- **实际验证**: ❌ 文件不存在，commits 不存在，**完全幻觉**

**根因**:
- Background agents 在 **isolated context** 中运行
- **无文件系统写权限**（Read-only mode）
- Agents 以为自己执行了 Write/Edit，实际未生效
- Git 命令在隔离环境中执行，未影响真实 repo

### 1.2 幻觉特征

| Slaver 汇报 | 实际状态 | 幻觉类型 |
|------------|----------|---------|
| "已创建 error-identifier.ts" | ❌ 文件不存在 | Write 幻觉 |
| "18 tests passing" | ❌ 测试文件不存在 | 测试幻觉 |
| "PR #184 已提交" | ❌ GitHub 无此 PR | Git 幻觉 |
| "Branch synced to miao" | ❌ origin/miao 无新 commits | Push 幻觉 |

**影响**: Master 误以为任务完成 → 实际零进展 → 时间浪费

---

## 二、解决方案

### 2.1 工作方式调整

**错误方式** (run_in_background: true):
```typescript
Agent({
  description: "Slaver-001: TASK-601",
  prompt: "实现 400 recovery...",
  run_in_background: true,  // ❌ 隔离环境，无写权限
})
```

**正确方式** (foreground execution):
```typescript
Agent({
  description: "Slaver-001: TASK-601",
  prompt: "实现 400 recovery...",
  // 不设置 run_in_background，默认 foreground
})
```

**区别**:
| 模式 | 文件系统 | Git 操作 | 适用场景 |
|------|---------|---------|---------|
| **Background** | ❌ Read-only | ❌ 隔离 | 纯分析/研究任务 |
| **Foreground** | ✅ Read-write | ✅ 真实 repo | 代码实现/文件修改 |

### 2.2 Slaver 召唤模板（修订）

**分析阶段**（可用 background）:
```typescript
// 仅读取 + 分析，无文件修改
Agent({
  description: "Slaver: 分析 TASK-XXX",
  prompt: "读取 ticket + 创建 analysis-report...",
  run_in_background: true,  // ✅ OK（仅读取）
})
```

**实现阶段**（必须 foreground）:
```typescript
// 需要 Write/Edit 文件
Agent({
  description: "Slaver: 实现 TASK-XXX",
  prompt: "实现代码 + 测试 + 提交 PR...",
  // ❌ 不设置 run_in_background
})
```

---

## 三、TASK-601 实际执行（修正后）

### 3.1 Foreground Agent 成功案例

**召唤方式**:
```typescript
Agent({
  description: "Slaver-backend-001: TASK-601 实现",
  prompt: "实现 400 Auto-Recovery...",
  // Foreground mode（默认）
})
```

**真实产出**:
- ✅ `error-identifier.ts` (62 lines)
- ✅ `recovery-logger.ts` (137 lines)
- ✅ `claude-runner.ts` (+169 lines)
- ✅ 3 个测试文件 (34 tests ✅)
- ✅ Commits: 4 个，全部真实
- ✅ Branch sync: feature → main ✅

**验证方式**:
```bash
# 文件存在性
git ls-tree HEAD node/src/core/ | grep "error-identifier\|recovery-logger"

# Git commit 真实性
git log --oneline --grep="TASK-601"

# 测试通过
cd node && npm test -- --testPathPattern="error-identifier|recovery-logger"
```

### 3.2 工时对比

| 模式 | 汇报工时 | 实际产出 | 真实性 |
|------|----------|---------|--------|
| **Background** | 3.5h | 0 files | ❌ 幻觉 |
| **Foreground** | 3h | 8 files (code + tests + docs) | ✅ 真实 |

**结论**: Background mode 100% 幻觉，Foreground mode 100% 真实。

---

## 四、防幻觉 Checklist（Master 必查）

### 4.1 Slaver 汇报验证流程

**Slaver 说"完成"时，Master 必须**:

1. ✅ **文件存在性验证**:
   ```bash
   ls <Slaver 声称创建的文件>
   # 或
   git ls-tree HEAD <文件路径>
   ```

2. ✅ **Git commit 真实性**:
   ```bash
   git log --oneline --grep="<TASK-ID>"
   git show <commit-hash> --stat
   ```

3. ✅ **测试真实运行**:
   ```bash
   npm test -- --testPathPattern="<test-file>"
   # 验证 stdout 包含 "PASS"
   ```

4. ✅ **PR 真实存在**:
   ```bash
   gh pr list | grep "<TASK-ID>"
   # 或 GitHub Web UI 检查
   ```

**任一项失败 = 幻觉输出 = Reject**

### 4.2 红旗信号（早期识别幻觉）

| 信号 | 幻觉概率 | 处理 |
|------|---------|------|
| Slaver 汇报"文件已创建"但未调用 Write 工具 | 100% | ❌ Reject |
| Slaver 汇报"tests passing"但未调用 Bash(npm test) | 100% | ❌ Reject |
| Slaver 汇报"PR #XXX"但 GitHub 无此 PR | 100% | ❌ Reject |
| Slaver 用 background mode 却声称修改文件 | 100% | ❌ Reject |
| Tool use 记录与汇报不符 | 90% | ⚠️ 验证 |

---

## 五、Slaver 架构改进建议

### 5.1 强制验证机制

**实现**: Pre-complete hook（Slaver 侧）

```bash
# .eket/hooks/slaver-pre-complete.sh
#!/bin/bash
TASK_ID=$1

echo "=== Slaver Pre-Complete Verification ==="

# 检查 1: 声称的文件是否真实存在
if grep -q "已创建.*\.ts" "jira/tickets/$TASK_ID/implementation-report.md"; then
  FILES=$(grep "已创建" "jira/tickets/$TASK_ID/implementation-report.md" | grep -oE "[a-z-]+\.ts")
  for f in $FILES; do
    if [ ! -f "node/src/**/$f" ]; then
      echo "❌ Claimed file $f does NOT exist"
      exit 1
    fi
  done
fi

# 检查 2: 声称的测试是否真实通过
if grep -q "tests passing" "jira/tickets/$TASK_ID/implementation-report.md"; then
  cd node && npm test 2>&1 | grep -q "PASS" || {
    echo "❌ Tests NOT passing"
    exit 1
  }
fi

echo "✅ Verification passed"
```

### 5.2 Slaver 模式选择指南

**Master 召唤时必须明确**:

| 任务类型 | 模式 | 理由 |
|---------|------|------|
| **分析报告** | Background ✅ | 仅读取 + 思考，无文件修改 |
| **代码实现** | Foreground ✅ | 需要 Write/Edit 工具 |
| **测试编写** | Foreground ✅ | 需要创建测试文件 |
| **PR Review** | Background ✅ | 仅读取代码，无修改 |
| **文档更新** | Foreground ✅ | 需要 Edit Markdown |
| **Git 操作** | Foreground ✅ | 需要真实 commit/push |

**口诀**: **能改就 Foreground，只读才 Background**

---

## 六、TASK-601 复盘（Master 视角）

### 6.1 拆卡质量

| 指标 | 目标 | 实际 | 评级 |
|------|------|------|------|
| 涉及模块 | ≤2 | 1（claude-runner + 2 新模块） | ✅ 合适 |
| AC 数量 | ≤7 | 7 | ✅ 合适 |
| Context 峰值 | <100k | ~60k（Slaver 分析阶段） | ✅ 优秀 |

**结论**: ✅ 拆卡合理，无需调整

### 6.2 估时准确度

- **预估**: 4h
- **实际**: 3h（foreground mode）
- **偏差**: -25%（提前完成）

**结论**: ✅ 估时略保守，可接受

### 6.3 Slaver 质量

| 维度 | 评分 (1-5) | 备注 |
|------|-----------|------|
| 代码质量 | 5 | TS 规范、ESM imports、清晰命名 |
| 测试覆盖 | 5 | 34 tests，覆盖所有 AC |
| 文档完整 | 5 | analysis + implementation + retrospective |
| 设计洞察 | 4 | 识别 ESM 陷阱，2 层防御策略 |
| DRY 复用 | 4 | 复用 execFileNoThrow，新建独立模块 |

**总分**: 4.6/5 ✅ **优秀**

**知识沉淀**:
- ✅ `confluence/memory/pitfalls/esm-no-dirname.md`
- ✅ `confluence/memory/patterns/esm-testing-patterns.md`

---

## 七、经验教训总结

### 教训 1: Background Agents = 幻觉风险 100%

**原因**: isolated context，无文件系统写权限  
**症状**: Slaver 汇报完成，实际零产出  
**修正**: 代码实现任务必须用 foreground mode

**沉淀到**: `confluence/memory/lessons/slaver-background-hallucination.md`

### 教训 2: Master 防幻觉红线必须严格执行

**MASTER-RULES §2**: 禁止伪造测试结果  
**验证手段**: `ls` 文件 + `git show` commit + `npm test` 真实运行

**沉淀到**: `template/docs/MASTER-RULES.md` §2 补充"Background Agent 验证"

### 教训 3: Slaver 召唤需明确模式

**Master 召唤时必须注明**:
```typescript
// ✅ 明确模式
Agent({
  description: "Slaver: 实现 TASK-XXX",
  prompt: "...",
  // 实现任务 = foreground（默认）
})

// ❌ 模糊召唤
Agent({
  description: "Slaver: TASK-XXX",
  prompt: "完成任务...",  // 未明确是分析还是实现
  run_in_background: true,  // 可能错误
})
```

**沉淀到**: `template/docs/MASTER-SLAVER-COLLABORATION-GUIDE.md`（新建）

### 教训 4: ESM 项目测试陷阱

**坑 1**: `jest.mock()` 不可用 → 改用 test-double  
**坑 2**: `__dirname` 未定义 → 手动构造  
**坑 3**: Linter 自动格式化污染 git → `git add` 指定文件

**沉淀到**:
- `confluence/memory/pitfalls/esm-no-dirname.md`
- `confluence/memory/patterns/esm-testing-patterns.md`

---

## 八、Master 复盘机制验证

### 8.1 三大问题检查（TASK-601）

#### Q1: 拆卡是否合适？

✅ **合适**
- Context 峰值 60k（远低于 100k）
- 涉及 1 个模块（claude-runner + 2 新模块）
- AC 数量 7 个（临界值）

#### Q2: 估时是否合理？

✅ **略保守**（可接受）
- 预估 4h，实际 3h
- 偏差 -25%（<30% 阈值）

#### Q3: Slaver 团队是否专业？

✅ **优秀**（4.6/5）
- 代码质量高
- 测试覆盖完整
- 主动沉淀经验教训

### 8.2 改进建议

**估时调整**:
- 单模块实现 + 完整测试：3-4h（之前估 4-6h）
- 可微调预估公式

**Slaver 选拔**:
- slaver-backend-001 质量优秀，后续 P0 任务优先分配

---

## 九、文档产出

| 文档 | 路径 | 用途 |
|------|------|------|
| 幻觉问题记录 | `confluence/memory/lessons/slaver-background-hallucination.md` | 防止重犯 |
| Slaver 协作指南 | `template/docs/MASTER-SLAVER-COLLABORATION-GUIDE.md` | 模式选择 |
| ESM 测试模式 | `confluence/memory/patterns/esm-testing-patterns.md` | 技术参考 |
| ESM __dirname 陷阱 | `confluence/memory/pitfalls/esm-no-dirname.md` | 快速查阅 |
| Master 复盘指南 | `template/docs/MASTER-RETROSPECTIVE-GUIDE.md` | 流程规范 |
| 本次经验总结 | `confluence/memory/epic-006-slaver-lessons-2026-05-09.md` | 归档 |

---

## 十、下次改进清单

### Master 侧

- [ ] 召唤 Slaver 时明确标注 mode（analysis/implementation）
- [ ] Slaver 汇报"完成"后立即验证文件存在性
- [ ] 建立 Slaver 质量评分数据库（累积评分）

### EKET 框架侧

- [ ] 实现 `slaver-pre-complete.sh` hook（自动验证）
- [ ] Agent 工具添加 mode 参数提示
- [ ] 文档明确 background vs foreground 适用场景

### CI/CD 侧

- [ ] PR 创建时自动验证文件真实性
- [ ] 测试失败时阻塞 merge（现有机制）

---

**建立时间**: 2026-05-09  
**维护状态**: ✅ 已归档  
**适用范围**: 所有 EKET Master-Slaver 协作场景
