# Master 复盘机制（Post-Mortem Checklist）

**适用场景**: EPIC/Sprint 完成后、单个 TASK 完成后、季度末复盘

**目的**: 持续改进任务拆解质量、工时估算准确度、团队配置合理性

---

## 1. TASK 级别复盘（每个 TASK 完成后）

### 1.1 三大核心问题

#### Q1: 拆卡是否合适？

**检查项**:
- [ ] Slaver 是否遇到 context 超限风险？（检查 `inbox/human_feedback/[SLAVER-ALERT] context-risk-*`）
- [ ] Task 是否触碰 3+ 模块？（检查 PR diff 文件分布）
- [ ] Slaver 是否在 analysis 阶段提出"任务太大"？
- [ ] AC 数量是否 > 7 个？（超标 = 应拆分）

**判定**:
| 指标 | 理想值 | 实际值 | 结论 |
|------|--------|--------|------|
| Context 使用 | <100k tokens | _填写_ | ✅ 合适 / ❌ 过大 |
| 涉及模块 | ≤2 | _填写_ | ✅ 合适 / ❌ 过大 |
| AC 数量 | ≤7 | _填写_ | ✅ 合适 / ❌ 过大 |
| Slaver 反馈 | 无异议 | _填写_ | ✅ 合适 / ⚠️ 有异议 |

**结论**: 
- ✅ 拆卡合理，无需调整
- ⚠️ 接近上限，下次类似 task 考虑拆小
- ❌ **明显过大，沉淀经验教训**：
  ```bash
  # 写入 confluence/memory/lessons/task-sizing-mistakes.md
  echo "## TASK-XXX 拆卡失误

  **原因**: 单个 task 涉及 5 个模块
  **后果**: Slaver 触发 2 次 context overflow
  **修正**: 应拆分为 3 个 task，每个聚焦 1-2 模块
  " >> confluence/memory/lessons/task-sizing-mistakes.md
  ```

---

#### Q2: 估时是否合理？

**检查项**:
- [ ] 预估工时 vs 实际工时偏差 < 50%？
- [ ] 是否存在"估 4h 实际 10min"（过度拆分）？
- [ ] 是否存在"估 4h 实际 12h"（严重低估）？

**计算偏差**:
```
偏差率 = |实际工时 - 预估工时| / 预估工时 × 100%
```

**判定阈值**:
| 偏差率 | 评级 | 处理 |
|--------|------|------|
| <30% | ✅ 优秀 | 无需调整 |
| 30-50% | ⚠️ 可接受 | 记录原因（技术难度/依赖阻塞） |
| >50% | ❌ 失败 | **沉淀经验教训** |

**经验沉淀模板**:
```markdown
## TASK-XXX 估时失误

**预估**: 4h  
**实际**: 10min  
**偏差**: -98%

**原因**: 高估了复杂度，实际仅需修改 1 行配置
**修正**: 配置类 task 估时 0.5h，代码类 task 估时 4h+

**规则更新**: 
- 修改 MASTER-RULES.md §X：配置文件修改 ≤1h
```

---

#### Q3: Slaver 团队是否足够专业？

**检查项**:
- [ ] Slaver 提交的 PR 质量如何？（代码规范、测试覆盖、文档完整性）
- [ ] Review 轮次是否 > 2？（> 2 = 质量不足）
- [ ] Slaver 是否在 analysis 阶段提出有价值的设计建议？
- [ ] Slaver 是否复用了既有模式？（DRY 原则）

**质量评分卡**:
| 维度 | 权重 | 评分 (1-5) | 得分 |
|------|------|-----------|------|
| 代码质量 | 30% | _填写_ | _自动计算_ |
| 测试覆盖 | 25% | _填写_ | _自动计算_ |
| 文档完整 | 15% | _填写_ | _自动计算_ |
| 设计洞察 | 20% | _填写_ | _自动计算_ |
| DRY 复用 | 10% | _填写_ | _自动计算_ |
| **总分** | 100% | - | _总分_ |

**判定**:
- 总分 ≥4.0: ✅ 优秀，Slaver 专业度匹配
- 总分 3.0-3.9: ⚠️ 可接受，建议补充 expertise
- 总分 <3.0: ❌ **不匹配，需调整团队**

**调整建议**:
```bash
# 如果后端 Slaver 质量不足
eket expert:summon --role senior-backend  # 召唤高级后端

# 如果需要特定领域专家
eket expert:summon --role security-engineer  # 安全审计
```

---

## 2. EPIC 级别复盘（EPIC 完成后）

### 2.1 整体指标

| 指标 | 目标 | 实际 | 达成率 |
|------|------|------|--------|
| 总工时预估 | 34h | _填写_ | _计算_ |
| 任务完成率 | 100% (8/8) | _填写_ | _计算_ |
| 平均估时偏差 | <30% | _填写_ | _计算_ |
| Context overflow 次数 | 0 | _填写_ | - |
| PR review 平均轮次 | ≤2 | _填写_ | - |

### 2.2 关键路径分析

**预期 Critical Path**: TASK-601 → 602 → 603 → 608 → 604 (22h)

**实际执行**:
- _填写实际 critical path_
- _填写瓶颈环节_

**延迟分析**:
| 延迟原因 | 影响 tasks | 损失工时 | 预防措施 |
|---------|-----------|---------|---------|
| _填写_ | _填写_ | _填写_ | _填写_ |

### 2.3 团队配置复盘

**预期**: 5 Slavers (3 backend + 1 devops + 1 architect)

**实际**:
- _填写实际 Slaver 数量_
- _填写是否有 Slaver 闲置 > 4h_
- _填写是否有 Slaver 超负荷（同时处理 2+ tasks）_

**优化建议**:
- 如果有闲置：下次减少 1-2 个 Slaver
- 如果超负荷：下次增加 1-2 个 Slaver

---

## 3. 季度复盘（每季度末）

### 3.1 拆卡质量趋势

**统计**:
```bash
# 统计最近 3 个月的 task sizing 失误
grep -r "拆卡失误\|估时失误" confluence/memory/lessons/*.md | wc -l
```

**趋势分析**:
- Q1: 15 次失误（基线）
- Q2: _填写_（目标：<10 次）
- 改进率: _计算_

### 3.2 Context overflow 趋势

**统计**:
```bash
# 读取 context-overflow.log
cat .eket/logs/context-overflow.log | wc -l
```

**对比**:
- EPIC-006 实施前: _填写_ 次/月
- EPIC-006 实施后: _填写_ 次/月
- 改善率: _计算_

### 3.3 Slaver 质量排名

| Slaver ID | 完成 tasks | 平均质量分 | 平均估时偏差 | 排名 |
|-----------|-----------|-----------|-------------|------|
| backend-001 | _填写_ | _填写_ | _填写_ | _填写_ |
| backend-002 | _填写_ | _填写_ | _填写_ | _填写_ |
| ... | ... | ... | ... | ... |

**优化建议**:
- 高分 Slaver（>4.5）：优先分配 P0 任务
- 低分 Slaver（<3.0）：分配简单 P2 任务 + 培训

---

## 4. 复盘输出（强制产物）

### 每 TASK 完成后
```bash
# Master 执行
eket task:retrospective TASK-XXX

# 自动生成
jira/tickets/TASK-XXX/retrospective.md
```

**模板**:
```markdown
# TASK-XXX Retrospective

**完成时间**: YYYY-MM-DD
**Slaver**: slaver-xxx
**实际工时**: Xh（预估 Yh，偏差 Z%）

## 拆卡质量
- 涉及模块: X 个
- AC 数量: X 个
- Context 峰值: Xk tokens
- 评级: ✅ 合适 / ⚠️ 接近上限 / ❌ 过大

## Slaver 质量
- 代码质量: X/5
- 测试覆盖: X/5
- 文档完整: X/5
- 设计洞察: X/5
- DRY 复用: X/5
- **总分**: X/5

## 经验教训
- _Slaver 填写_
- _Master 补充_
```

### 每 EPIC 完成后
```bash
# Master 执行
eket epic:retrospective EPIC-XXX

# 自动生成
jira/tickets/EPIC-XXX/epic-retrospective.md
```

**包含**:
- 整体指标统计
- 关键路径分析
- 团队配置复盘
- 经验教训汇总
- 下次改进建议

---

## 5. 自动化检查（pre-complete hook）

### task:complete 前置检查
```bash
# .eket/hooks/pre-complete.sh
#!/bin/bash
TASK_ID=$1

echo "=== Pre-Complete Checks for $TASK_ID ==="

# 检查 1: 是否有 retrospective.md
if [ ! -f "jira/tickets/$TASK_ID/retrospective.md" ]; then
  echo "❌ Missing retrospective.md"
  echo "   Run: eket task:retrospective $TASK_ID"
  exit 1
fi

# 检查 2: 是否填写了实际工时
if ! grep -q "实际工时" "jira/tickets/$TASK_ID/retrospective.md"; then
  echo "❌ Retrospective missing actual hours"
  exit 1
fi

# 检查 3: 是否有质量评分
if ! grep -q "总分" "jira/tickets/$TASK_ID/retrospective.md"; then
  echo "❌ Retrospective missing quality score"
  exit 1
fi

echo "✅ Pre-complete checks passed"
```

---

**建立时间**: 2026-05-08  
**维护人**: Master  
**状态**: ✅ 已激活

**Integration**: 
- MASTER-RULES.md §9 补充：完成任务前必须执行复盘
- task:complete 命令添加 pre-hook 调用
