# TASK-DOC-009: EXPERT-PANEL-PLAYBOOK 补充 + SKILL.md 联动触发词

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **预估工时**: 360min
- **epic**: DOC-LIFECYCLE
- **blocked_by**: TASK-DOC-007,TASK-DOC-008

## 需求描述
将新增的 Roadmap/Spike/Design 场景和专家+Skills 联动机制写入规范文档，
确保 Master 和 Slaver 知道何时召唤什么专家组合并调用哪些 skills。

## 验收标准
- [ ] `template/docs/EXPERT-PANEL-PLAYBOOK.md` 新增 §6 Spike 流程（召唤时机、专家组、时间盒规范）
- [ ] PLAYBOOK 新增 §7 Roadmap 规划流程（季度更新、OKR 对齐）
- [ ] PLAYBOOK §0 召唤时机表格补充：Spike(2人)、Roadmap(3人)、设计评审(3人)
- [ ] `~/.claude/skills/eket/SKILL.md` 新增触发词：spike/调研/时间盒/roadmap/路线图/季度规划/设计评审/ADR
- [ ] SKILL.md Trigger 命令类补充：`eket roadmap:update` / `eket spike:create` / `eket expert:compose`
- [ ] SKILL.md 生命周期文档矩阵表格追加 Roadmap / Spike / Design 行
- [ ] SKILL.md Preamble 专家组表格注释：每位专家关联的核心 skills

## 技术要点
- 修改 `template/docs/EXPERT-PANEL-PLAYBOOK.md`（追加 §6 §7，更新 §0 表格）
- 修改 `~/.claude/skills/eket/SKILL.md`（更新 Trigger + Commands + 矩阵表格 + Preamble 专家表）
- Spike 流程：时间盒 ≤3 天，产出 findings.md，召唤 architect + 领域专家（如 backend/ai）
- Roadmap 流程：每季度，召唤 architect + product + devops

## 参考文件
- `template/docs/EXPERT-PANEL-PLAYBOOK.md`
- `~/.claude/skills/eket/SKILL.md`
