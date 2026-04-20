# Round 25~26 跨项目研究经验教训

**来源**: EKET Round 25-26（2026-04-20）
**背景**: 同时研究 7 个外部项目（Archon、DeepTutor、oh-my-claudecode、deer-flow、MiroFish、learn-claude-code、claude-code-best-practice），从中提取借鉴点并落地为 TASK-108~122。

---

## 1. 研究方法论

### 1.1 并行专家组的局限性

**发生了什么**: Round 25 为 7 个项目各开满配置 5 专家组（35 个 agent 并行），结果在 session compact 后研究报告全部丢失，只剩 Block 4~7 被建卡落地。

**根本原因**: 研究结果只存在于对话 context 中，未写入文件。session compact 后丢失。

**规则**:
- 研究 agent 完成后**立即写文件**，不等"一起整理"
- 研究文件路径：`confluence/memory/research/round-XX-<project>.md`
- 研究报告写完后才能开始 review 讨论

### 1.2 研究范围控制

**发现**: 每个项目的真正可借鉴点通常只有 1-3 个，5 专家组并行产出的大量分析中 80% 是噪音。

**规则**:
- 单项目研究：1 个 Explore agent 足够，不需要满配专家团
- 多项目并行：每项目 1 agent，而非每项目 5 agent
- 每个项目借鉴上限：**2-3 个具体落地点**，超出的记入 borrowed-wisdom.md 备查但不建卡

### 1.3 借鉴价值过滤标准

5 项评估维度（来自 borrowed-wisdom.md 附录）：

| 维度 | 高分条件 |
|------|---------|
| 问题匹配度 | 当前已有痛点或 near-miss |
| 可移植性 | 无需新基础设施 |
| 可验证性 | 有对应 test/grep 命令 |
| 范围可控 | ≤3 个文件改动 |
| 可撤销性 | 纯新增，不改已有逻辑 |

4/5 高分 → 直接建卡；3/5 → spike；< 3 → 记录不建卡

---

## 2. 本轮具体发现

### 2.1 oh-my-claudecode URL 错误

**问题**: 原 URL `nicholasgasior/oh-my-claudecode` 返回 404，浪费一个 agent slot。

**正确 URL**: `Yeachan-Heo/oh-my-claudecode`

**规则**: 研究前先用 `gh search repos "<project-name>" --limit=5` 验证 URL，而非直接 WebFetch。

### 2.2 MiroFish 的预测仿真与 EKET 核心方向不符

**发现**: MiroFish 是预测引擎（parallel world simulation），本质是科研工具，与 EKET 的工程执行框架定位差距较大。

**借鉴点降级**: 从 P1 降为 P3，仅取"知识图谱→自动 DAG 依赖推断"这一个点（TASK-122）。

**规则**: 定位偏差大的项目，只取最小化借鉴点，不强行映射全部特性。

### 2.3 同类发现的合并处理

**发现**: deer-flow（sandbox isolation）与 TASK-105（worktree isolation）高度重叠，仅增量取了 `SlaveResult schema` 这一个新点。

**规则**: 与已有实现重叠度 > 60% 的借鉴点，直接标注"已实现"跳过，不重复建卡。

---

## 3. Slaver 执行经验

### 3.1 Git 操作必须在单 Bash 调用中链式执行

**来源**: TASK-114 Slaver 踩坑（PR retro GitHub Action）

**问题**: `git checkout -b feature/xxx` 在第一个 bash call 生效，后续 bash calls 回到原分支，导致 commit 落错分支。

**规则**: 所有 git 操作必须在**单个 bash call** 中用 `&&` 链接：
```bash
git checkout miao && git pull origin miao && git checkout -b feature/TASK-xxx && git add . && git commit -m "..."
```
禁止跨多个 bash call 执行 git 分支操作。

### 3.2 API 500 崩溃后的恢复策略

**来源**: TASK-110b Slaver API 500 崩溃

**问题**: Agent 崩溃前已写代码，但未推 PR。Master 重新召唤时需要先检查文件是否已存在，避免重复实现。

**规则**:
1. 召唤重启 Slaver 前，先检查 `ls node/src/<路径>.ts` 确认文件是否已存在
2. 文件存在 → 重启 Slaver 只需跑测试 + 推 PR，不需要重新实现
3. 在 Slaver prompt 中明确说明"代码可能已存在，先检查再实现"

### 3.3 两个相关 ticket 合并执行更高效

**来源**: TASK-120/121 合并给同一 Slaver 执行

**规则**: 涉及同一文件（`types/index.ts`、`complete.ts`）的多个 ticket，合并给同一 Slaver 避免 PR 冲突，比并行执行更可靠。

---

## 4. 建卡质量规则

### 4.1 验收标准必须附验证命令（Nyquist Rule 落地）

本轮 TASK-116~122 全部采用带验证命令的验收标准格式：
```markdown
- [ ] 描述；验证：`grep -n "xxx" node/src/core/yyy.ts`
```

**效果**: Slaver 可以自检，无需人工判断"是否完成"。

### 4.2 P3 ticket 的必要性

**发现**: P3 ticket（TASK-122 依赖推断）工作量中等，但用户价值是减少 Master 手动填写依赖，属于乘数效应。保留 P3 是正确的——低优先级不等于不值得做。

---

## 5. 框架演进路线洞见

### 5.1 EKET 的真正护城河

经过本轮研究对比，EKET 在以下维度领先所有 7 个参考项目：

1. **Gate Review + Anti-Hallucination**：无其他框架有类似机制
2. **三级降级容灾**：零基础设施可运行
3. **Ticket 状态机 + 分支保护**：工程纪律体系完整
4. **Harness 化程度**：规则→代码强制的转化深度

### 5.2 本轮补足的短板

| 短板 | 补足措施 | Ticket |
|------|---------|--------|
| Slaver 执行无回滚 | Saga executor | TASK-113 |
| 复盘手动 + 经常跳过 | GitHub Action 自动复盘 | TASK-114 |
| Master 黑盒无可观测性 | Trace store + SSE | TASK-115 |
| ticket 完成验证主观 | RAG 交叉验证 | TASK-116 |
| context 截断丢状态 | 三层压缩 | TASK-117 |
| Skill 单一无组合 | Skill stacking + envelope | TASK-118 |
| PR review 单视角 | Ultrareview 多 agent | TASK-119 |
| 失败只能回滚 | Loop 节点迭代细化 | TASK-120 |
| Slaver 输出非结构化 | SlaveResult schema | TASK-121 |
| 依赖手动填写 | 自动推断 | TASK-122 |
