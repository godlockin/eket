# 任务分析报告：TASK-225

**Slaver**: slaver-002  
**分析时间**: 2026-04-27  
**预计工时**: 16h（与票面一致）  
**状态**: analysis_review

---

## 1. Optional Expert 实际清单（Inventory）

| 目录 | 文件数 | 行数分布（min~max） |
|------|--------|---------------------|
| ai | 8 | 41~70 |
| business | 5 | 41~70 |
| consulting | 3 | 69 |
| design | 5 | 68~69 |
| hr | 5 | 64~68 |
| knowledge | 3 | 68~69 |
| marketing | 5 | 70~90 |
| ops | 4 | 69~97 |
| pr | 4 | 69~94 |
| tech | 8 | 41~70 |
| training | 3 | 68~69 |
| **合计** | **53** | — |

> ⚠️ **实际文件数 = 53，非 ticket 所述 60**。差值 7，需 Master 确认：(a) 票面数字有误，(b) 还有 7 个文件待社区提交，(c) 部分文件在其他子目录。

**三节覆盖率（预检）**：`grep -r "Common Rationalizations"` = 0 命中。**全 53 个文件均缺失 3 节**，无需文件跳过逻辑（skip-detection 可简化为"始终注入"）。

---

## 2. Schema Diff（各分类 frontmatter 风格差异）

所有文件均为 **单一 YAML 代码块**（` ```yaml … ``` `）包裹，无裸 frontmatter。

| 风格变体 | 代表文件 | 特征 |
|----------|----------|------|
| **Slim（41 行）** | ai/aiml.md, tech/devops.md, business/business.md | 仅含 id/name/role/emoji/domain/tier + personality + analysis_focus + output_format + trigger/phase；无 background、thinking_framework |
| **Standard（64~70 行）** | hr/*.md, design/*.md, knowledge/*.md 等 | 增加 background + thinking_framework，output_format 为简单 markdown 段落 |
| **Extended（84~97 行）** | marketing/seo.md, ops/community.md, pr/crisis.md 等 | output_format 含表格/多段；偶有 weaknesses/notable_skills |

**关键结论**：3 种 schema 变体，但**全部文件的结构为纯 YAML 代码块**，末尾以 ` ``` ` 结束。注入 3 节应在 **YAML 块关闭符 ` ``` ` 之后** 追加 Markdown，而非修改 YAML 内部字段。这使 sed/awk 注入点确定且统一：检测末尾 ` ``` `，在其后追加。

**id 格式分裂**：
- `eket.{domain}.001` 风格（多数）
- 裸 slug 风格（marketing/pr 的社区贡献文件，如 `seo-sem-expert`、`pr-manager`）

→ id 格式分裂不影响 3 节注入，但需在 codemod 文档中注明（避免后续 INDEX.md 工作踩坑）。

---

## 3. Codemod 设计

### 语言与工具
Bash + awk（按 ticket §技能要求）。不用 sed，因 sed 多行追加在 macOS/GNU 间有差异；awk 行为更一致。

### 输入 / 输出
```
输入：单个 .md 文件（YAML 代码块包裹的专家文件）
输出：原文件 in-place 修改，YAML 块后追加 3 节 Markdown
```

### 核心逻辑（伪码）
```awk
END_BLOCK_FOUND = 0
/^```$/ { END_BLOCK_FOUND = 1 }
{ print }
END_BLOCK_FOUND && !INJECTED {
  print "\n## Common Rationalizations\n..."
  print "\n## Red Flags\n..."
  print "\n## Verification\n..."
  INJECTED = 1
}
```

### 幂等性
注入前检测文件是否已含 `## Common Rationalizations`：
```bash
grep -q "^## Common Rationalizations" "$file" && continue
```
已有则跳过，确保重复执行安全。

### Dry-run 模式
```bash
./codemod-inject-3sections.sh --dry-run experts/marketing/
# 输出：[DRY-RUN] would inject: seo.md, content.md, ...（不写磁盘）
```

### AC-4 约束
脚本本体目标 ≤ 150 行 + ≤ 50 行单元测试（对 fixture 目录）。

---

## 4. 3-Section 内容模板策略

### 方案：Skeleton-first，内容留白

3 节**仅注入最小骨架**（满足 AC-1 的 ≥3 行/项要求），不在本 ticket 手填专业内容：

```markdown
## Common Rationalizations

> ⚠️ 非穷举清单 — 请根据该专家领域补充具体措辞。

| 借口 | 反驳 |
|------|------|
| "先快速做出来，{domain}规范后面再对齐" | 上线后的技术债利息是指数增长的 |
| "这个问题{domain}不负责，是业务/技术的事" | 跨职能盲区是最高频的事故根因 |
| "现有方案够用，先不动" | "够用"通常是"没量化过成本"的别名 |

## Red Flags

- [ ] 缺乏可量化目标（无指标/无基线/无 deadline）
- [ ] 跳过领域评审直接进入执行
- [ ] 方案未经小范围验证即全量推行

## Verification

- [ ] 核心假设是否经过数据或用例验证？
- [ ] 是否识别出至少 1 个该领域的高频反模式？
- [ ] 输出是否可被其他角色独立复现？
```

**理由**：
- 满足 AC-1（每节 ≥3 行/项）✓
- 满足 AC-2（anatomy check --minimal）✓ — pending TASK-224
- 不伪造专业知识；后续可由社区/Master 指派专人填充
- 避免 60 × 3 节手写内容导致 PR 爆炸（会触发 Rule of 500）

---

## 5. PR 分批方案

| PR# | 目录 | 文件数 | 估算净增行数 | 状态 |
|-----|------|--------|-------------|------|
| PR-01 | ai | 8 | ~120 | - |
| PR-02 | tech | 8 | ~120 | - |
| PR-03 | business | 5 | ~75 | - |
| PR-04 | hr | 5 | ~75 | - |
| PR-05 | design | 5 | ~75 | - |
| PR-06 | marketing | 5 | ~75 | - |
| PR-07 | ops | 4 | ~60 | - |
| PR-08 | pr | 4 | ~60 | - |
| PR-09 | consulting | 3 | ~45 | - |
| PR-10 | knowledge | 3 | ~45 | - |
| PR-11 | training | 3 | ~45 | - |

每份文件注入约 15 行（3 节骨架）。最大单 PR（ai/tech，8 文件）≈ 120 行净增，远低于 AC-3 的 300 行特批阈值。  
**codemod 脚本本身单独 PR**（先行合并，后续 11 个 PR 调用它）。

---

## 6. 风险表

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| **codemod 幂等失效**：重复运行在已注入文件再次追加 | 低 | 中（文件损坏，AC-1 失败） | grep 检测 + dry-run 验证；fixture 单元测试覆盖幂等场景 |
| **frontmatter YAML 块关闭符定位错误**：部分文件末尾有空行或多个 ` ``` ` | 中 | 高（注入位置错误） | awk 以"最后一个 ` ``` `"为注入点；fixture 测试含边界用例（trailing newline / multi-block） |
| **AC-2 依赖 TASK-224 未完成**：`check-skill-anatomy.sh --minimal` 不可用 | 高（TASK-224 blocked） | 中（无法自动验收，需人工） | 设计阶段可并行；PR 提交时用临时 grep 检查替代；正式 AC-2 在 TASK-224 完成后补跑 |
| **subrepo PR 协调**：eket-experts-extended 是独立 git repo，PR 流程与主仓不同 | 中 | 低（流程摩擦） | 每批 PR 开独立 feature branch；codemod 脚本留在主仓，专家文件改动在子仓；在 PR 描述中交叉引用 |
| **实际文件数 53 ≠ ticket 所述 60** | 已确认 | 中（AC-1 目标文件数不明） | 见 Open Questions Q1 |

---

## 7. 与 TASK-224 并行策略

### 可立即进行（无需 TASK-224）
- ✅ codemod 脚本开发（bash + awk）
- ✅ fixture 目录创建 + 单元测试
- ✅ Dry-run 验证全 53 文件注入位置正确
- ✅ PR-01～PR-11 分支创建 + codemod 执行
- ✅ PR 描述撰写

### 必须等待 TASK-224
- ⏳ AC-2 正式验收：`check-skill-anatomy.sh --minimal` 通过率 ≥90%
- ⏳ 最终 PR 合并（建议等 TASK-224 完成后一并跑 anatomy check，再触发合并）

**建议**：提交全部 11 个 PR 后，在 PR 描述注明 `Blocked-by: TASK-224 for AC-2`，Master 可预审其余 AC，TASK-224 完成后直接跑 anatomy check 即可绿灯合并。

---

## 8. Open Questions for Master

**Q1. 文件数差异确认**  
实际 53 文件 vs ticket 所述 60。差异 7 个文件的来源？是票面错误，还是有 7 个文件在其他路径/待社区提交？AC-1 验收基准应以 53 还是 60 为准？

**Q2. 内容骨架策略确认**  
本报告建议注入"通用占位骨架"而非领域专属内容（减少手工量 + 避免 PR 爆炸）。Master 是否接受 skeleton-first 策略，还是需要在本 ticket 内填充领域专属 Rationalizations？后者会显著增加工时。

---

*报告完毕。等待 Master 审批后开始 codemod 脚本开发。*
