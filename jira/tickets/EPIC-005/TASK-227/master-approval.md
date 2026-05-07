# TASK-227 Analysis Approval

**Reviewer**: master-001
**审核时间**: 2026-04-27
**Slaver**: slaver-001
**裁决**: ✅ **分析通过 — 含 2 项开放问题裁决 + 4 条追加约束**

## 评估

报告 186 行，结构齐整。亮点：
1. 6 文件变更行数明确（+42 / +40 / +15 / +28 / +14 / +38），总 ~177 行净增，落在 ≤500 / 单 PR ~200 的健康区间
2. 主仓 vs subrepo 边界主动识别（§5）并显式上报，未擅自修改 subrepo 源文件——anti-rationalization 闭环再一次正面成立
3. `--all` 行为对 subrepo 不可达走 SKIP（非 exit 1），CI 鲁棒性考虑到位
4. SKILL-ANATOMY-TEMPLATE polish 内容（7vs3 表 / architect 注解示例 / 引用现有文件）三块设计合理，避免堆砌

风险表第 1 条（subrepo 路径写死）已自带缓解（SKIP）。第 2 条（optional INDEX.md 主仓镜像可能不存在）需注意：实现时先 `ls .claude/skills/eket/experts/optional/INDEX.md`，不存在则按"新建主仓镜像"处理而非 silent skip。

---

## 两个开放问题裁决

### Q1：subrepo optional INDEX.md 更新归属 — **方案 B+：本 ticket Phase 2 同步改 subrepo，走独立分支**

报告倾向"Phase 2 / 独立 ticket"。Master 不采纳"独立 ticket"路线，理由：
- EPIC-002 已 5/6，再开新 ticket 拖尾会让 EPIC 关闭节点漂移
- subrepo INDEX 增加"3节注入"列与主仓 augment 同根同源，跨 ticket 处理会让 augment 内容不一致
- subrepo 已经在 TASK-225 期间产生 11 个 feature 分支并行存在，再加一个 `feature/TASK-227-index` 不增加 push 复杂度（EPIC 收尾整体 push）

**决策：本 ticket Phase 2 同时改主仓镜像 + subrepo 源文件**。
- subrepo 分支：`feature/TASK-227-index`，从 `miao` 拉
- 主仓镜像内容与 subrepo 源文件**完全一致**（一处生成，两处落盘）
- subrepo commit message 与主仓独立，不互相 trailer 引用
- subrepo 这次只动 `experts/INDEX.md` 一文件，单 commit 即可

### Q2：`--all` 是否进 anatomy-check.yml CI — **方案 C+：加 informational job 但不 hard-gate**

- 不选「不加」：错失 `--all` flag 的 CI 价值，未来人为脱节
- 不选「hard gate 全 53 文件 minimal」：subrepo 在 CI 不可 checkout，必 fail
- **选「加 informational job」**：在 anatomy-check.yml 增加第 3 个 step，跑 `bash scripts/check-skill-anatomy.sh --all`；该 step **必须 PASS**（即 default 全过 + optional 不可达走 SKIP），但不引入新硬指标
- 不要用 `continue-on-error: true`（红线，TASK-226 经验）；`--all` 自身的 SKIP 逻辑就是软处理

**实现要点**：CI 上 subrepo 路径不存在，`--all` 应打印 `[SKIP] subrepo not reachable: <path>` 然后 exit 0（前提是 default 全过）。本机开发者跑 `--all` 时 subrepo 可达则会真扫 53 文件。

---

## 追加约束

1. **PR 切分**：6 个文件变更建议 **2 commits**（不强制单 PR，看实际 diff）：
   - **commit-1**：脚本 + 模板 + CLAUDE.md（`scripts/*` + `template/*`，~120 行）
   - **commit-2**：INDEX 文件（主仓 default 新建 + 主仓 optional augment + subrepo augment 各自分仓）
   
   subrepo commit 单独走 `feature/TASK-227-index`，不混入主仓 commit。

2. **commit message 严禁 `Approved-Large-PR-By` trailer**（lessons-learned 红线）。本 ticket 各 commit 都在 ≤500 健康区间，不会触发。

3. **commit 前实测行数**（TASK-224 lessons-learned）：
   ```bash
   git diff --cached --shortstat
   ```
   commit message 自报数字以实测为准；与分析报告的 +177 估算允许误差 ≤30%，超出需 commit body 解释。

4. **~/.claude 镜像同步**：所有主仓 `.claude/skills/eket/experts/default/INDEX.md` 新建后必须 `cp` 到 `~/.claude/skills/eket/experts/default/INDEX.md`，与 TASK-223/224 一致。

5. **TASK-225 AC-2 回填**：`--all` flag 跑通后，subrepo 53 文件 minimal 全 PASS（TODO skeleton 自带 ≥3 checkbox 行），TASK-225 AC-2 ⏳ → ✅ 关闭。本 ticket commit message 注明该联动。

---

## 解锁

🔓 **TASK-227 Phase 2 编码可以开始**。

执行顺序建议（按 slaver §11，仅微调）：
1. SKILL-ANATOMY-TEMPLATE.md polish（30m）
2. default INDEX.md 新建 + 主仓 optional INDEX.md augment + subrepo INDEX.md augment（45m，三个 INDEX 一起改利于内容对齐）
3. `--all` flag 实现（40m）
4. `--exclude=INDEX.md` 实现（20m）
5. template/CLAUDE.md 新章节（20m）
6. anatomy-check.yml 加 `--all` informational job（10m，新增项）
7. 全量验证 + AC 自查 + ~/.claude 镜像同步（25m）

提交后停在 commit 阶段（不 push），来 review。EPIC-002 push 整体在 TASK-227 review 通过后做。

---

## 📌 Addendum（Master 实测后追加）

Master 在派工前做 `git status` + `git log` 实测，发现两处偏差，追加进本 ticket scope：

### Addendum A：default INDEX.md 草稿已存在（未 git add）

`/.claude/skills/eket/experts/default/INDEX.md` 已存在 46 行高质量草稿（git 状态 `??`，从未 commit）。内容含 7 专家完整表 + 「与扩展专家库关系」段 + `--all` 校验示例 + meta 标注 `TASK-227`，质量优于分析报告 §4 的设计。

**决策**：slaver §4 子任务从「新建」改为「`git add` 既有草稿 + 同步 `~/.claude` 镜像」。不要重写、不要按 §4 表头重做。如需微调（如更新日期、对齐措辞），允许 ≤5 行 edit。

### Addendum B：旧 agent profile 脚本只认 4/5 个专家

实测发现两个老脚本与新 7 default 专家命名不对齐：

| 脚本 | 位置 | 当前 | 目标 |
|------|------|------|------|
| `scripts/init-project.sh` | line 768-783 (5 选项菜单) + line 924-950 (case skills) | 5 选项：frontend_dev / backend_dev / fullstack / tester / devops | 7 选项对齐 default：architect / backend / frontend / fullstack / product / tester / ux |
| `scripts/load-agent-profile.sh` | line 60-95 (label 路由) | 5 路 + 默认 backend | 7 路对齐 default 专家命名 |

**决策**：新增 **commit-3**：`chore(TASK-227): align legacy agent profile scripts with 7 default experts`
- 不破坏现有调用方（保留 `frontend_dev` / `backend_dev` 作为 alias 或同时新增 `frontend` / `backend` 别名映射）
- `devops` 不在新 7 default 内（属 optional），从 init 菜单移除但 load-agent-profile 路由保留（兼容老 ticket label）
- 新增 architect / product / ux 三路时，每路 `AGENT_SKILLS` 列表参考已存在的 fullstack 写法即可，不必发明新 skill 名
- 该 commit 预估 ~80-120 行（两文件合计），仍在 ≤500 健康区间

### 修订后 commit 顺序

| commit | 内容 | 仓 | 分支 |
|--------|------|---|------|
| commit-1 | scripts/check-skill-anatomy.sh `--all` + scripts/codemod-inject-3sections.sh `--exclude` + template/docs/SKILL-ANATOMY-TEMPLATE.md polish + template/CLAUDE.md 新章节 + .github/workflows/anatomy-check.yml 加 `--all` informational job | 主仓 | `feature/TASK-226a-rules-fixtures` |
| commit-2 | `.claude/skills/eket/experts/default/INDEX.md`（git add 草稿+微调）+ 主仓 `.claude/skills/eket/experts/optional/INDEX.md` augment（如不存在则建主仓镜像） | 主仓 | 同上 |
| commit-3 | scripts/init-project.sh 菜单扩 7 + scripts/load-agent-profile.sh 路由扩 7 | 主仓 | 同上 |
| commit-subrepo | subrepo `experts/INDEX.md` augment（与主仓 optional 镜像内容同源） | subrepo | `feature/TASK-227-index`（从 `miao` 拉） |

### Addendum 衍生约束

- commit-3 修改的脚本若有既存测试（`tests/scripts/` 或类似），必须保持通过；如无测试，commit body 注明「manual smoke verified: bash scripts/init-project.sh menu 显示 7 选项」
- 新增的角色名要小写（`architect` 不是 `Architect`），与既有 `backend_dev` 命名风格一致

