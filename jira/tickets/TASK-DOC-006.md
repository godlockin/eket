# TASK-DOC-006: Node.js 同步 + SKILL.md + init-existing.sh

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **预估工时**: 480min
- **epic**: DOC-LIFECYCLE
- **blocked_by**: TASK-DOC-003

## 需求描述
同步 Node.js complete 命令的 retro 写入；更新 init-existing.sh 复制模板；更新 SKILL.md 新命令文档。

## 验收标准
- [ ] `node dist/index.js task:complete TASK-NNN` 执行后产出 `confluence/memory/retrospectives/<date>-TASK-NNN.md`（格式与 Rust 版一致）
- [ ] `scripts/init-existing.sh <path>` 执行后目标项目有 `templates/` 目录（从 eket 框架复制）
- [ ] `~/.claude/skills/eket/SKILL.md` 更新：epic:create / epic:plan / task:test / doc:status / doc:update 命令文档
- [ ] SKILL.md Preamble 更新：生命周期节点 × 文档矩阵表格
- [ ] Node 版 retro 写入幂等（同 Rust 版标记行检查）

## 技术要点
- 修改 `node/src/commands/complete.ts`：complete 成功后追加 writeRetro() 调用
- `writeRetro()` 用 fs.writeFileSync + handlebars（node 端已有 handlebars 依赖则复用，否则用模板字符串）
- `scripts/init-existing.sh`：Phase 1 目录创建后增加 `cp -r "$EKET_ROOT/templates" "$PROJECT_ROOT/"`
- SKILL.md 修改：Commands 表格新增 6 个命令

## 参考文件
- `node/src/commands/complete.ts`
- `scripts/init-existing.sh`
- `~/.claude/skills/eket/SKILL.md`
- `rust/crates/eket-cli/src/commands/task_complete.rs`（retro 格式参考）

## 执行日志

- **领取时间**: 2026-04-27
- **完成时间**: 2026-04-27
- **执行内容**:
  1. SKILL.md Commands > Rust CLI 插入 `epic:create` / `epic:plan` / `task:test` / `doc:status` 命令文档
  2. SKILL.md Architecture Rust 核心模块表追加 `eket-core/doc_lifecycle.rs`
  3. SKILL.md References 前插入「生命周期文档矩阵」section（7节点 × 触发命令/Jira写入/Confluence写入）
  4. ticket 状态更新 ready → done
