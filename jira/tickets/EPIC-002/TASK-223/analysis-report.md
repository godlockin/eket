# 任务分析报告：TASK-223

**Slaver**: slaver-001
**分析时间**: 2026-04-27
**预计工时**: 8 小时（原估 12h，内容为 MD 重写，无编译产物）

---

## 1. 需求理解

将 7 个 default 专家文档（architect / backend / frontend / fullstack / product / tester / ux）从"Frontmatter + Common Rationalizations 2 节"扩充为"7 节完整 anatomy"（addyosmani SKILL 标准）。  
标题顺序（AC-1）：`## Overview` → `## When to Use` → `## When NOT to Use` → `## Process` → `## Common Rationalizations` → `## Red Flags` → `## Verification`。  
发布策略：影子目录灰度切换（`default-v2/` → swap → `default-v1-backup/`）。  
TASK-222 已验证 Common Rationalizations 方法有效；TASK-222 的 master-pr-b-review line 39 明确要求本 ticket 补齐 fullstack / tester（合计 7 文件，非 ticket 标题所写的 5）。

---

## 2. Scope Confirmation — 7 文件现状与预期

| 文件 | 当前行数 | 现有节 | 预计新增行 | 预计总行 |
|------|----------|--------|-----------|----------|
| architect.md | 80 | Frontmatter + Common Rationalizations | ~80 | ~160 |
| backend.md | 74 | Frontmatter + Common Rationalizations | ~80 | ~154 |
| frontend.md | 74 | Frontmatter + Common Rationalizations | ~80 | ~154 |
| fullstack.md | 74 | Frontmatter + Common Rationalizations | ~80 | ~154 |
| product.md | 74 | Frontmatter + Common Rationalizations | ~80 | ~154 |
| tester.md | 74 | Frontmatter + Common Rationalizations | ~80 | ~154 |
| ux.md | 74 | Frontmatter + Common Rationalizations | ~80 | ~154 |
| **合计** | **524** | — | **~560** | **~1084** |

> 净新增约 560 行（5 节 × 7 文件 × ~16 行/节）。超过 Rule 5 的 ~100 行 silent-pass 门槛，需在 PR description 说明；不超过 Rule of 500 / 单 PR 绝对限额，若合理分组每 PR ≤500 行可满足 AC-4。

---

## 3. PR Partition Plan

### 原则
- Rule of 500：单 PR 净变更 ≤ 500 行（AC-4 硬约束）
- Rule 5：~100 行 silent pass；100–500 行需 PR description 说明拆分困难；**禁止 `Approved-Large-PR-By` trailer（lessons-learned 假传圣旨）**
- 按领域相似度分组，方便 Master review 时上下文连贯

### 方案：分 3 个 PR

| PR | 包含文件 | 预计净变更 | Rule 5 状态 | 备注 |
|----|----------|-----------|-------------|------|
| PR-A | architect.md + backend.md | ~160+160 = **~320 行** | warn（需说明） | 系统设计视角，自然成对 |
| PR-B | frontend.md + fullstack.md | ~160+160 = **~320 行** | warn（需说明） | 前端/全栈同领域 |
| PR-C | product.md + tester.md + ux.md | ~160+160+160 = **~480 行** | warn（需说明） | 软技能/质量三角，≤500 安全 |

> PR-A / PR-B / PR-C 均 < 500 行，满足 AC-4；description 均须说明"5 新节 × N 文件，无法再细拆单文件 PR"。

---

## 4. Shadow-Directory Rollout（影子目录灰度切换）

```
Step 0  核实当前路径
        ls .claude/skills/eket/experts/default/
        → 确认 7 个文件存在，无 default-v2/ default-v1-backup/ 目录

Step 1  建立影子目录
        mkdir -p .claude/skills/eket/experts/default-v2/
        cp .claude/skills/eket/experts/default/*.md \
           .claude/skills/eket/experts/default-v2/
        # 此时 default-v2/ = 7 个文件 × v1 内容（起点快照）

Step 2  在 default-v2/ 内完成全部重写
        # 3 个 PR 的改动全部落在 default-v2/*.md
        # default/ 不动，线上零影响

Step 3  AC-2 校验（重写完毕后）
        for f in .claude/skills/eket/experts/default-v2/*.md; do
          bash scripts/check-skill-anatomy.sh "$f"
        done
        # 全部 PASS 才进入 Step 4

Step 4  Swap（原子性单命令序列）
        mv .claude/skills/eket/experts/default \
           .claude/skills/eket/experts/default-v1-backup
        mv .claude/skills/eket/experts/default-v2 \
           .claude/skills/eket/experts/default
        # 如果中途失败：mv default-v1-backup default（< 5s 回滚）

Step 5  冒烟验证
        node dist/index.js system:doctor
        # 确认 skill.anatomy.swapped 日志出现，无 skill.anatomy.swap_failed

Step 6  7 天观察期后清理
        rm -rf .claude/skills/eket/experts/default-v1-backup
```

> ⚠️ Step 4 的两条 `mv` 需在同一 shell session 连续执行，不得中断。回滚命令应提前写入 ticket，防止 Master 找不到。

---

## 5. Per-Section Content Strategy

以下针对"专家人格文件"定义各节内容要求（区别于 workflow/skill 类文件）：

| 节 | 内容策略 |
|----|---------|
| **## Overview** | 2–3 句话：专家的核心职责定位、思维框架关键词、在专家组中的作用（何时被 Master 首先召唤）。不重复 Frontmatter 字段，而是"活的" narrative。 |
| **## When to Use** | 3–5 个触发场景，用动词短句。示例（architect）："需要评估模块边界划分" / "引入新技术选型前" / "出现性能/扩展性瓶颈时"。强调：此专家在哪种问题类型下最有独特价值。 |
| **## When NOT to Use** | 2–4 个反向场景，防止召唤过度。示例（architect）："纯 UI 样式调整" / "单函数 bug 修复" / "已有完整设计文档时不需重复架构评审"。帮助 Master 节约 token。 |
| **## Process** | 3–6 步执行流程，有序编号。强调该专家的**分析产出物**（图表/表格/清单），对应 Frontmatter 的 `output_format`。Process 与 output_format 互补，不重复。 |
| **## Common Rationalizations** | 保留 v1 已有内容（≥5 条借口表），仅做格式对齐；不删减已验证条目（TASK-222 活体验证通过）。 |
| **## Red Flags** | 3–5 条**可观测**的警示信号（需有"如果你看到 X，说明 Y"结构）。区别于 Common Rationalizations（借口是主观话术，Red Flags 是客观迹象）。示例（architect）："如果模块间调用超过 3 层跨边界，说明边界划分已失效"。 |
| **## Verification** | 2–4 条可执行的自查命令或客观验证方法（呼应 Nyquist Rule）。示例（architect）：`grep -r "import" src/ | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -20`（检查依赖集中度）。每条带预期输出说明。 |

---

## 6. Risk Table

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| **内容漂移**：v2 重写时不小心删改 Common Rationalizations 已验证内容 | 中 | 高 | Step 2 结束后 `diff default-v1-backup/<file> default-v2/<file>` 逐文件确认 Rationalizations 节无删减 |
| **Swap 原子性失败**：Step 4 两条 mv 之间进程崩溃，出现 default/ 目录消失 | 低 | 高 | 提前将回滚命令写入 runbook；CI 检测 default/ 目录存在性 |
| **下游 loader 路径硬编码**：代码中若有 `experts/default/` 绝对路径引用，swap 后可能仍然指向备份目录 | 中 | 中 | Swap 前运行 `grep -r "default" node/src/ --include="*.ts"` 确认无路径字符串硬编码；若有则改为配置项 |
| **Frontmatter 字段新增破坏 schema**：AC-3 要求新增 `rationalizations_count` 字段，可能导致现有 loader 解析失败 | 中 | 中 | PR-A 先行，发布后跑 `system:doctor`；若有 schema 报错，其余 PR 暂停等修复 |
| **行数估算偏差**：实际重写超过预估，单 PR 逼近 500 行边界 | 低 | 中 | 每 PR 提交前执行 `bash scripts/check-pr-size.sh`；如超 400 行考虑拆出 1 文件到独立 PR |

---

## 7. Open Questions for Master

1. **SKILL-ANATOMY-TEMPLATE.md 是否已存在？**  
   TASK-223 描述称"模板见 `template/docs/SKILL-ANATOMY-TEMPLATE.md`（本 ticket 一并产出）"，但当前仓库未发现此文件。若 Slaver 需在本 ticket 内同时产出该模板，会增加约 60 行，并影响 PR-A 行数估算。请 Master 确认：模板由本 ticket 产出，还是单独 TASK？

2. **`check-skill-anatomy.sh` 的依赖顺序**：  
   AC-2 依赖 `scripts/check-skill-anatomy.sh`，但该脚本是 TASK-224 的产出物。若 TASK-223 与 TASK-224 并行执行，AC-2 在 TASK-224 完成前无法通过 shell 验证（只能人工 grep 验证顺序）。请 Master 确认执行顺序：TASK-223 是否需等待 TASK-224 完成再进入 test 阶段？还是 TASK-223 PR 可先合并，AC-2 在 TASK-224 完成后补验？

---

## 8. AC Mapping

| AC | 验证方式 | 责任阶段 |
|----|---------|---------|
| AC-1：7 节标题顺序 | `grep "^## " <file>` 输出顺序比对，人工 + 脚本双验 | PR 提交前，每文件 |
| AC-2：`check-skill-anatomy.sh` PASS | `bash scripts/check-skill-anatomy.sh <file>` exit 0 | TASK-224 完成后补验；PR description 注明"pending TASK-224" |
| AC-3：Frontmatter 3 字段 | `grep -E "name:|description:|rationalizations_count:" <file>` 输出 3 行 | 每文件写完后即验 |
| AC-4：单 PR ≤ 500 行 | `bash scripts/check-pr-size.sh` ≤ 500 | 每 PR push 前 |
| AC-5：`system:doctor` 无新增告警 | Swap 后 24h 内运行 `node dist/index.js system:doctor`，输出与 baseline 比对 | Step 5（swap 后） |
