---
id: TASK-239
title: "P0 — SKILL.md RAG 化：减少 SessionStart context 注入"
type: feature
priority: P0
status: backlog
created: 2026-05-03
epic: context-optimization
---

## 需求

当前 `SKILL.md`（~13k chars ≈ 3.5k tokens）在每次 SessionStart 时全量注入 context，
导致 Slaver 起手 context 已消耗 35-50k chars，复杂任务直接溢出静默退出。

**目标**：SKILL.md 内容按需检索，每次注入 < 1k tokens。

## 验收标准

- [ ] SessionStart hook 不再全量读取 SKILL.md，改为只注入命令索引（命令名 + 一行描述）
- [ ] 提供 `eket skill:search <keyword>` 命令，利用已有 tantivy 知识库检索 SKILL.md 片段
- [ ] 命令索引 < 100 行（约 500 tokens）
- [ ] `eket skill:search epic:create` 返回对应命令的完整说明（< 200 tokens）
- [ ] 不引入新的外部模型或 embedding 服务，纯文本/关键字匹配即可

## 技术方案

1. **拆分 SKILL.md**
   - `SKILL-INDEX.md`：命令速查表（命令名 + 一行描述），注入 SessionStart
   - `SKILL-DETAIL.md`：完整说明，不注入，按需读

2. **SessionStart hook 修改**
   - 只读 `SKILL-INDEX.md`（< 500 tokens）
   - 移除全量 SKILL.md 读取

3. **`eket skill:search`**
   - 实现方式：grep + 段落提取（不依赖 tantivy，零依赖）
   - 搜索 `SKILL-DETAIL.md`，提取匹配命令段落返回

## 影响文件

- `.claude/skills/eket/SKILL.md` → 拆分为 `SKILL-INDEX.md` + `SKILL-DETAIL.md`
- `.claude/settings.json` / hook 配置（SessionStart 读取文件路径）
- `rust/crates/eket-cli/src/commands/` → 新增 `skill_search.rs`（或 Node.js 实现）

## 约束

- 不引入外部模型（无 embedding、无 LLMLingua）
- 纯文本 grep 匹配足够，不需要语义搜索
- 向后兼容：现有引用 SKILL.md 的地方改为引用 SKILL-INDEX.md

## 预估工作量

~3h（拆文件 1h + hook 修改 1h + skill:search 命令 1h）
