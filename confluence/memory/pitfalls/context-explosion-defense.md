---
title: Context 爆炸三级防御
review_status: accepted
review_ticket: manual
reviewed_at: 2026-05-03T00:00:00Z
proof:
  task_id: TASK-239 + TASK-240
  exit_code: 0
  timestamp: 2026-05-03T00:00:00Z
  tool_name: wc -c
---

# Context 爆炸三级防御

**场景**：Claude Code session 启动时 SessionStart hook 自动注入大量内容，起手 context 可达 35-50k chars（≈10-15k tokens），Slaver 可用空间严重压缩导致静默失败。

**根因**：三大注入源叠加——`~/.claude/CLAUDE.md`（全局规则+代码示例）、`SKILL.md`（framework文档）、项目 `CLAUDE.md`，每一个单独看合理，叠加后超载。

**三级防御方案**：

### Level 1：拆分大文件（最高收益）
- SKILL.md 拆为 INDEX（2.6k，SessionStart 注入）+ DETAIL（5.9k，按需读取）
- 效果：-10k chars / session，80% 减少

### Level 2：代码示例外化
- `~/.claude/CLAUDE.md` 只保留规则文字，代码示例移到 `~/.claude/docs/patterns/` 
- CLAUDE.md 末尾加引用注释即可
- 效果：14.6k → 4.5k chars，69% 减少

### Level 3：install 时主动检查
- `install-skill.sh` 安装后自动检查 `~/.claude/CLAUDE.md` 大小
- 超过 8000 chars 输出黄色警告 + 迁移步骤
- 预防新团队成员累积臃肿

**量化效果**：SKILL.md(−10k) + CLAUDE.md(−10k) = 每 session 节省约 5k tokens。

**踩坑**：
- `install-skill.sh` 只操作 `~/.claude/skills/eket/`，不触碰 `~/.claude/CLAUDE.md`，修改全局 CLAUDE.md 必须手动操作
- SKILL.md 拆分后，SKILL-INDEX.md 是 SessionStart 加载的文件名，SKILL.md 保持为主入口，两个文件需同时维护

**来源**：TASK-239, TASK-240, TASK-241
