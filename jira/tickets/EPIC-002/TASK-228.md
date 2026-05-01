# TASK-228: 主仓 optional 6 文件 — 同步注入 3 节 skeleton

## 元数据
- **状态**: todo
- **类型**: refactor
- **优先级**: P2
- **agent_type**: fullstack
- **estimate_hours**: 2
- **parent_epic**: EPIC-002
- **创建时间**: 2026-04-29
- **依赖**: TASK-225, TASK-227
- **assigned_experts**: tech-architect

## 背景

EPIC-002 收尾后跑 `bash scripts/check-skill-anatomy.sh --all` 暴露 gap：
- subrepo `eket-experts-extended/experts/` 53 文件 ✅ 53/53 PASS（TASK-225 已注入 3 节 skeleton）
- 主仓 `.claude/skills/eket/experts/optional/` 6 文件（aiml.md / business.md / data.md / devops.md / qa.md / security.md）❌ 0/6 PASS（无 skeleton，仅 yaml frontmatter）

主仓 optional 6 文件本质是 subrepo 同名分类的"代表性瘦身镜像"（每个分类挑 1 个 persona 复制到主仓，便于无 subrepo 安装时使用），但**未同步 TASK-225 codemod 注入的 3 节 skeleton**，导致 `--all` 检查不全绿。

## 详细描述

复用 TASK-225 codemod (`scripts/codemod-inject-3sections.sh`) 在主仓 optional 6 文件上跑一次。
- 输入：`.claude/skills/eket/experts/optional/{aiml,business,data,devops,qa,security}.md`
- 输出：每文件追加 `## Common Rationalizations` / `## Red Flags` / `## Verification` 三节 TODO skeleton（与 subrepo 同源同格式）
- 参考 TASK-227 `--exclude=INDEX.md` 行为（本 ticket 无需 exclude，6 个文件无 INDEX.md）

镜像同步约束：主仓改完后必须 `cp` 到 `~/.claude/skills/eket/experts/optional/` 镜像（与 TASK-223/224 一致）。

## 验收标准

- [ ] AC-1 (GWT): Given 主仓 optional 6 文件无 skeleton, When 跑 codemod, Then 6 文件全部新增 3 节 TODO skeleton
- [ ] AC-2: `bash scripts/check-skill-anatomy.sh --all` 跑出 default 7/7 PASS + optional 59/59 PASS（53 subrepo + 6 主仓）
- [ ] AC-3: 单 PR 净变更 ≤ 200 行（6 文件 × ~25 行 skeleton ≈ 150 行）
- [ ] AC-4: ~/.claude/skills/eket/experts/optional/ 镜像与主仓 identical（diff 为空）

## observability
- logs: ["optional.expert.mainrepo_skeleton_injected"]
- metrics: ["optional.expert.mainrepo_minimal_pass_rate"]

## rollback_plan

单 PR 单 commit，revert 即可。skeleton 内容是 TODO，业务零影响。

## test_strategy
- unit: codemod 在 6 文件上跑出预期 diff（3 节追加，frontmatter 不变）
- integration: `--all` 全绿
- regression: subrepo 53 + 主仓 default 7 不受影响（独立路径）

---

**类型**: Refactor
**技能要求**: Bash / 复用 TASK-225 codemod
**依赖**: TASK-225, TASK-227
**assigned_experts**: tech-architect

<!-- machine-readable fields -->
agent_type: fullstack
estimate_hours: 2
