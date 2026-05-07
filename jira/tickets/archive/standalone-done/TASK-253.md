# TASK-253: 修复 experts/extended/README.md 路径错误

**状态**: done
**优先级**: P1
**预估工时**: 30min
**负责人**: —
**创建时间**: 2026-05-05
**所需专家**: any
**依赖**: —
**阻塞**: —

---

## 背景

`experts/extended/README.md` 中存在多处路径/结构错误：

1. **目录树描述错误**：写的是 `experts/{tech,ai,...}/` 但实际结构是 `experts/extended/experts/{tech,ai,...}/`，README 在 `extended/` 根目录
2. **安装脚本路径不存在**：`bash ~/.claude/skills/eket/scripts/install-extended.sh` — `scripts/` 目录根本不存在
3. **INDEX.md 路径注释错误**：`experts/INDEX.md` 里写的 "路径相对于 `~/.claude/skills/eket/experts/optional/`"，实为 `extended/experts/`
4. **使用方式过时**：`assigned_experts` 字段已被 `required_expertise` / `--expertise` 取代
5. **外链引用虚构 repo**：`EKET_EXTENDED_REPO=https://github.com/godlockin/eket-experts-extended` 不存在

## 验收标准

- [ ] `README.md` 目录树与实际 `extended/experts/` 结构一致
- [ ] 安装说明改为实际可执行方式（本地路径，无虚构远程 repo）
- [ ] 使用示例改用 `required_expertise` / `--expertise` 正确字段名
- [ ] `INDEX.md` 顶部路径注释修正为 `~/.claude/skills/eket/experts/extended/experts/`
- [ ] skills/ 目录在 README 中补充说明
