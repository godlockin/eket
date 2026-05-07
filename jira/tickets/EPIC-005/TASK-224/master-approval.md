# TASK-224 Analysis Approval

**Reviewer**: master-001
**审核时间**: 2026-04-27
**Slaver**: slaver-001
**裁决**: ✅ **分析通过 — 含 3 个关键决策**

## 评估

报告 248 行，做对了一件最关键的事：**AC-1 审计发现 7 文件 0 checkbox 全失败时未擅自修内容**，而是上报。这正是 anti-rationalization 红线起作用的形态——slaver 没有用「我顺手补上吧」绕过 Master 决策。本次行为入档作为正面案例。

Master 复跑 awk 验证：7 文件 Verification 节确实 0 checkboxes（仅 bash 块），与报告一致。

## 关键诊断：TASK-223 与 TASK-224 的 AC 措辞冲突（非 Slaver 错）

TASK-223 SKILL-ANATOMY-TEMPLATE 写的是「2-4 条可执行自查命令或客观验证方法，每条带预期输出说明」，未要求 checkbox 格式。slaver-001 在 PR-A/B/C 落地的 bash-only 风格 Master **review 时还点名表扬**（「Verification 含可执行 grep + 预期输出」）。

TASK-224 AC-1 才首次引入「≥3 条 `- [ ]` 复选框」。这是 ticket 写法漂移，**责任在 Master 拆 ticket 时未对齐 AC**，不是 slaver-001 的执行问题。

## 三个 Open Questions 的裁决

### Q1：7 文件 0 checkbox — **选 B+加补丁**

- 不选 A：扩 TASK-224 范围会模糊"工具 vs 内容"边界
- 不选 C：`continue-on-error` 是上线观察期工具，不是用来掩盖明知未达标的 AC
- **选 B：TASK-224 交付脚本 + fixtures，独立 commit hotfix-TASK-224-checkbox 补 7 文件**

**hotfix 形式约束**：
- **不替换**现有 bash 块（那是 TASK-223 经 Master 表扬的成果）
- 在 Verification 节标题下先加 **3 行 `- [ ]` 描述性自检**（process verification，对应 ticket §详细描述 #1），再保留现有 bash 块（command verification，对应 §详细描述 #2）
- 每个专家的 3 行 checkbox 内容**必须贴该专家职责**（不要写"已读完关联 ticket 的 AC"这种通用话）。例如 architect 可写：
  ```
  - [ ] 是否绘制了模块依赖地图，识别出隐形单体或边界失效点？
  - [ ] 技术选型是否对应了项目规模、团队约束与可观测性需求？
  - [ ] 是否标注了 [P0/P1/P2] 改进建议，而非泛泛指出问题？
  ```

### Q2：子仓 53 文件 CI 覆盖 — **选 C**

TASK-224 CI 只检查主仓 7 default 专家 `--minimal` 不跑子仓。理由：
- 子仓未 push，CI 无 source 可 checkout
- TASK-227 会处理子仓 INDEX 聚合 + CI 整合
- TASK-225 PR-01~11 均带 TODO skeleton，**`--minimal` 跑过去本来就会过**（TODO 行也是 `- [ ]` 格式），意义不大

### Q3：`--minimal` 模式 frontmatter — **SKIP**

optional 专家无 `rationalizations_count` 字段，强制校验会全部 fail。`--minimal` 仅校验后 3 节存在 + 内容（≥3 checkbox / ≥1 bash）。frontmatter 校验仅完整模式开启。

## 追加约束

1. **commit 顺序**：
   - **commit-1**：脚本 + fixtures + workflow（TASK-224 主体单 PR）
   - **commit-2**：hotfix-TASK-224-checkbox 补 7 文件 Verification（独立 commit）
   - 不要打包成一个 commit，便于将来 revert 单点

2. **commit-1 提交时 CI 会失败**（脚本红 7 文件）。这是预期的——commit-2 紧跟立即变绿。**不要**为了让 commit-1 自洽就改宽阈值或加 continue-on-error。

3. **hotfix-TASK-224-checkbox 同步 ~/.claude 镜像**（TASK-223 PR-A/B/C 既有约定）

4. **commit message 严禁 `Approved-Large-PR-By` trailer**（lessons-learned）

5. **fixture `bad-no-checkbox.md`**：用 7 节齐全 + Verification 仅 bash 块（无 checkbox）的样式 —— 故意模拟当前 7 文件 pre-hotfix 状态。这样 commit-1 的 self-test 能直接证明"脚本能识别这种形态为 FAIL"。

## 经验沉淀（写入本 ticket lessons-learned，本 ticket 完成时归档）

> TASK-224 暴露：拆 ticket 时**不同 ticket 的 AC 必须对相同制品的措辞对齐**。TASK-223 的"2-4 条可执行自查"与 TASK-224 的"≥3 条 checkbox"互不兼容，导致 PR-A/B/C 通过 TASK-223 review 但天然违反 TASK-224 AC-1。预防：拆 ticket 时 Master 应 grep 后续 ticket 中对同一制品的 AC，提前对齐措辞。

## 解锁

🔓 **TASK-224 编码可以开始**。提交后停在 commit 阶段（不 push），来 review。
