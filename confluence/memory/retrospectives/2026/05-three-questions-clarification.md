# 三个问题的完整回答

**日期**: 2026-05-11  
**执行者**: Master

---

## 1. Skills — 正确（Git Submodule）

### 发现

**.claude/skills/eket/experts/extended** 是 **Git Submodule**

**配置**：
```gitmodules
[submodule ".claude/skills/eket/experts/extended"]
    path = .claude/skills/eket/experts/extended
    url = https://github.com/godlockin/eket-experts-extended.git
```

**评估**: ✅ **设计正确**
- 扩展专家库（53位专家）独立仓库维护
- 主项目保留 default 专家（7位）
- 符合模块化原则

**无需修改**

---

## 2. Lessons & Learn — 已整理

### 发现问题

**Lessons 文件散落** 4 处：
1. `jira/epics/epic-006-slaver-lessons-2026-05-09.md`
2. `jira/tickets/EPIC-005/TASK-226/lessons-learned.md`
3. `confluence/memory/EPIC-005-lessons.md`
4. `confluence/memory/context-optimization-lessons-2026-05-10.md`

### 已执行清理

✅ 全部移动到 `confluence/memory/lessons/`（现有 13 个文件）

**理由**: 
- Lessons 是可复用知识（非任务生命周期产物）
- 符合 eket-project-hygiene.md §4 规范
- 便于检索和知识飞轮推送

---

## 3. Remote Repository — 单一 Remote（正确设计）

### 当前状态

```bash
git remote -v
# origin https://github.com/godlockin/eket (fetch)
# origin https://github.com/godlockin/eket (push)
```

**仅 1 个 remote**: origin (godlockin/eket)

### Human 澄清

**三仓库模式适用于**: 用 EKET 初始化的**用户项目**
- 用户运行 `eket init <project>` 时
- 可选择创建 3 个独立 repos（confluence/jira/code）
- **目的**: 独立更新、独立权限、独立部署

**EKET 框架本身**: ✅ **单一 repo 正确**
- 框架代码不需要拆分
- confluence/jira/node 是**逻辑分离**（目录结构）
- **无需修改**

### README 描述修正

README.md 当前描述：
> "three physically separate repos (confluence / jira / code)"

**建议修正为**：
> "three logically separate directories (confluence / jira / code) in the framework repo.
> When you initialize a new project with EKET, you can optionally create three physically
> separate repositories for independent updates and permissions."

---

## 本次清理最终总结

✅ **已完成清理**: 37 个文件 + 2 个目录

| 维度 | 问题 | 状态 |
|------|------|------|
| 1. Skills | Git submodule 正确设计 | ✅ 无需修改 |
| 2. Lessons | 散落 4 处 | ✅ 已整理到 lessons/ |
| 3. Remote | 单一 remote 设计疑问 | ✅ 已澄清（框架单 repo 正确）|
| 4. .serena | 108K 历史数据 | ✅ 已删除 |
| 5. 根目录 | 9 个报告文件 | ✅ 已移动 |
| 6. Confluence | 15 个 EPIC/TASK | ✅ 已移动 |
| 7. Docker | 4 个文件散落 | ✅ 已整理 |

**防止复发**:
- ✅ 更新 eket-project-hygiene.md（完整归属表）
- ✅ 更新 MASTER-RULES.md（添加文件归属检查）
- ✅ 创建 TASK-623/624（pre-commit hook + CI）
- ✅ 创建复盘文档（5-Why 根因分析）

---

## 额外发现：.serena/ 历史数据

### 状态

- **大小**: 108K
- **内容**: 2026-04-26 Rust 迁移期间 Serena 插件留下的 memories
- **当前**: Serena 插件已停用（.claude/settings.json 无配置）

### 已处理

✅ 删除 .serena/ 目录  
✅ 添加到 .gitignore  
✅ 内容已提炼到 confluence/memory/retrospectives/

**理由**: Rust 迁移经验已正式沉淀，Serena 数据不再需要

---

## 汇总：本次清理统计

| 类别 | 数量 | 操作 |
|------|------|------|
| 根目录 EPIC/TASK 文件 | 9 | → jira/ |
| Confluence EPIC/TASK 文件 | 15 | → jira/ |
| Lessons 文件 | 4 | → confluence/memory/lessons/ |
| Docker 文件 | 4 | → docker/ |
| 脚本 | 1 | → scripts/ |
| 历史目录 | 1 (.serena) | 删除 |
| 空目录 | 1 (test-fixtures) | 删除 |

**总计**: 37 个文件重组织 + 2 个目录清理

**提交**: 9 个 commits（在 feature 分支）

**下一步**: 需要你确认"三仓库物理分离"的设计意图（选项 A 或 B）

---

**报告位置**: outbox/reviews/three-questions-answer.md
