# 任务分析报告：TASK-227

**Slaver**: slaver-001
**分析时间**: 2026-04-27
**预计工时**: 3.5h
**状态**: analysis_review

---

## 1. 需求理解

TASK-227 是 EPIC-002 最后一张 ticket，收尾性质：
1. 完善已存在的 `SKILL-ANATOMY-TEMPLATE.md`（TASK-223 建了空骨架）
2. 新建 default `INDEX.md`（不存在）；augment optional `INDEX.md`（已存在，内容丰富）
3. `scripts/check-skill-anatomy.sh` 补 `--all` 扫描 flag
4. `scripts/codemod-inject-3sections.sh` 补 `--exclude=INDEX.md` 保护
5. `template/CLAUDE.md` 增加 ≤50 行新章节

---

## 2. 具体文件变更计划

| 文件 | 操作 | 估计行数变化 |
|------|------|-------------|
| `template/docs/SKILL-ANATOMY-TEMPLATE.md` | Edit — polish | +42 行 |
| `.claude/skills/eket/experts/default/INDEX.md` | **新建** | +40 行 |
| `eket-experts-extended/experts/INDEX.md` | Edit — augment | +15 行 |
| `scripts/check-skill-anatomy.sh` | Edit — add `--all` flag | +28 行 |
| `scripts/codemod-inject-3sections.sh` | Edit — add `--exclude` | +14 行 |
| `template/CLAUDE.md` | Edit — new section | +38 行 |

**总净增**: ~177 行（git diff --shortstat 实测后以实际为准）

---

## 3. SKILL-ANATOMY-TEMPLATE.md Polish 策略

现有文件 60 行，已有骨架但无示例和模式说明。追加三块内容（目标 ~100 行）：

**A. 7节 vs 3节 说明（+12 行）**
```
## 何时用 7 节 vs 3 节

| 文件类型 | 适用节数 | 说明 |
|---------|---------|------|
| default 专家（7位）| 7节 full | 高频调用，需完整 Overview/When 指引 |
| optional 专家（53位）| 3节 minimal | TASK-225 codemod 注入；Overview等可选补充 |
| 新 Skill 文件（非专家）| 7节 full | 技能本身需完整文档 |
```

**B. Expert Persona 注解示例（+20 行）**  
以 `architect.md` 为蓝本，在 frontmatter 字段旁加注释说明含义与填写规范。

**C. 引用现有文件（+10 行）**  
Reference 块：指向 `default/architect.md`（7节示范）、`subrepo aiml.md`（3节示范）、`check-skill-anatomy.sh`。

---

## 4. Default INDEX.md 新建方案

路径：`.claude/skills/eket/experts/default/INDEX.md`

**表格 schema**（来自 frontmatter 字段）：

| id | name_cn | role | emoji | description | rationalizations_count |
|----|---------|------|-------|-------------|----------------------|
| eket.architect.001 | 陈架构 | 系统架构师 | 🏗️ | 系统架构师，专注模块边界… | 6 |
| eket.backend.001 | 张后端 | 后端工程师 | 🖥️ | 后端工程师，专注 API 设计… | 6 |
| eket.frontend.001 | 李前端 | 前端工程师 | 🎨 | 前端工程师，专注组件架构… | 6 |
| eket.fullstack.001 | 林全栈 | 全栈工程师 | 🧰 | 全栈工程师，专注端到端… | 6 |
| eket.product.001 | 赵产品 | 产品经理 | 📋 | 产品经理，专注功能完整性… | 6 |
| eket.tester.001 | 吴测试 | 测试工程师 | 🧪 | 测试工程师，专注测试金字塔… | 6 |
| eket.ux.001 | 王UX | UI/UX 设计师 | 🖌️ | UI/UX 设计师，专注用户旅程… | 6 |

文件共 7 行数据 + 表头 + 少量说明，约 25-30 行。

---

## 5. Optional INDEX.md Augment 策略

subrepo `experts/INDEX.md` 已有 176 行，内容完整：树状结构 + 快速查找表 + 按领域安装状态表。

**策略：最小化 augment（非 full regen）**
- 现有内容保留（已经是优质索引）
- 在安装状态表增加一列 `3节注入`，标注 53 个文件的 TODO skeleton 是否注入
- 追加脚注说明与 `check-skill-anatomy.sh --minimal` 的关系

**约 +15 行**，在 `## 安装状态` 表后追加。

**subrepo 分支决策**：optional INDEX.md 修改要走 subrepo 独立分支（不污染主仓）。但本 ticket 当前要求 **read-only** 对子仓。实现时仅修改主仓镜像位置 `.claude/skills/eket/experts/optional/INDEX.md`（如存在）或备注为 Phase 2 subrepo 任务。  
→ **决策：主仓镜像路径 augment；subrepo 原文件在本 ticket 不动（Phase 2 / 独立 ticket）。**

---

## 6. `--all` Flag 实现方案

**范围决策**：
- 主仓 default：`~/.claude/skills/eket/experts/default/*.md`（排除 INDEX.md）
- 主仓 optional（镜像）：`~/.claude/skills/eket/experts/optional/**/*.md`（若路径可达）
- subrepo：检测 `~/working/sourcecode/research/eket-experts-extended/experts/` 是否存在，可达则扫描，不可达则 SKIP（非 error）

**行为**：
```bash
bash scripts/check-skill-anatomy.sh --all
# default files → full mode
# optional files → minimal mode (--minimal)
# 汇总：default N/7 PASS, optional N/53 PASS
```

**实现**：在参数解析区加 `--all` case，构建两批 FILES 数组，分别以 full/minimal 模式调用 `check_file()`，最后打印双行汇总。约 +28 行代码。

---

## 7. `--exclude=INDEX.md` 实现方案

在 `codemod-inject-3sections.sh` 文件收集阶段，检测文件名是否匹配 exclude pattern，跳过则 SKIP 并打印提示。

```bash
EXCLUDE_NAMES=()
for arg in "$@"; do
  if [[ "$arg" == --exclude=* ]]; then
    EXCLUDE_NAMES+=("${arg#--exclude=}")
  fi
done
# 在文件循环中：
[[ " ${EXCLUDE_NAMES[*]} " =~ " $(basename "$f") " ]] && continue
```

约 +14 行。

---

## 8. template/CLAUDE.md 新章节

**插入位置**：在现有 `## 重要：身份确认` 之后，`## 项目简介` 之前。

**内容**（~38 行）：

```markdown
## 技能/专家文档统一 7 节式规范

所有 `.claude/skills/eket/experts/` 下的专家文件遵循统一 anatomy：

| 文件类型 | 要求节数 | 验证命令 |
|---------|---------|---------|
| default 专家（7位）| 7节 full | `check-skill-anatomy.sh <file>` |
| optional 专家（53位）| 3节 minimal | `check-skill-anatomy.sh --minimal <file>` |

**模板**：`template/docs/SKILL-ANATOMY-TEMPLATE.md`  
**校验脚本**：`scripts/check-skill-anatomy.sh`  
**全量扫描**：`bash scripts/check-skill-anatomy.sh --all`（default 100%，optional ≥90%）
```

Diff 实测 ≤50 行（AC-3 满足）。

---

## 9. 风险评估

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| `--all` 扫描 subrepo 路径写死，在 CI 环境不可达导致 false 失败 | 中 | 中 | subrepo 不可达时打印 SKIP 而非 exit 1 |
| optional INDEX.md 主仓镜像位置不存在（检查显示 `optional/` 有文件但无 INDEX.md）| 低 | 低 | 新建镜像位置；subrepo 原文件不动 |

---

## 10. 开放问题（2条）

1. **subrepo optional INDEX.md 更新归属**：本 ticket 仅更新主仓镜像；subrepo 原文件改动是否需要独立 ticket or 在 TASK-227 Phase 2 commit 中附带一个 subrepo 分支？需 Master 指示。

2. **`--all` CI 集成**：anatomy-check.yml workflow 是否需要同步添加 `--all` job，或仍仅跑 default？需 Master 决策是否进 scope。

---

## 11. 任务拆解

| 子任务 | 预估 | 顺序 |
|--------|------|------|
| SKILL-ANATOMY-TEMPLATE.md polish | 30m | 1 |
| default INDEX.md 新建 | 20m | 2 |
| optional INDEX.md augment（主仓镜像）| 15m | 3 |
| check-skill-anatomy.sh `--all` | 40m | 4 |
| codemod-inject-3sections.sh `--exclude` | 20m | 5 |
| template/CLAUDE.md 新章节 | 20m | 6 |
| 全量验证 + AC 自查 | 25m | 7 |
