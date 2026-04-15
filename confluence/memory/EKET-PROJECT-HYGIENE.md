# EKET 项目卫生规则

**创建时间**: 2026-04-15
**维护者**: Master Agent
**适用范围**: EKET 框架自身项目的维护规则（非新项目模板）

---

## 目录

1. [template/ 引用：不要误判为断链](#template-links)
2. [Ticket 状态一致性检查](#ticket-hygiene)
3. [outbox 清理规则](#outbox-cleanup)
4. [三仓库文件归属规范](#three-repo-ownership)
5. [版本号同步规范](#version-sync)

---

## 1. template/ 引用：不要误判为断链 {#template-links}

`template/` 下的文件描述的是**新项目初始化后的目标结构**，不是 EKET 框架自身的结构。

```
template/CLAUDE.md 中有 docs/MASTER-WORKFLOW.md
→ 这是新项目会有的路径（init-project.sh 会复制 template/docs/ → docs/）
→ 不是断链，不要修改
```

**判断方法**：看引用的文件是否存在于 `template/` 内部 → 是则视为模板描述，跳过断链检查。

```bash
# 检查 template/ 内的引用（跳过这些 = 正确）
git ls-files 'template/*.md' | while read f; do
  perl -ne 'while (/\]\(([^)#]+)\)/g) { print "$ARGV: $1\n" }' "$f"
done | grep -v "^http"
# → 这些链接描述的是未来项目的路径，属于模板描述，不是断链
```

---

## 2. Ticket 状态一致性检查 {#ticket-hygiene}

随着项目推进，早期 ticket 状态常常变成"僵尸"（标注 `IN_PROGRESS` 但对应分支早已不存在）。

### 僵尸 Ticket 检测

```bash
# 1. 找所有状态为 IN_PROGRESS 的 ticket
grep -l "状态.*IN_PROGRESS\|status.*in_progress" jira/tickets/*.md

# 2. 对每个发现的 ticket，验证对应分支是否还存在
git branch -r | grep TASK-XXX   # 将 TASK-XXX 替换为实际 ticket ID

# 3. 如果分支不存在且功能已在 main/miao 中 → 改状态为 done
```

### 状态修改规则

| 发现情况 | 正确动作 |
|---------|---------|
| 分支不存在，功能已合并 | 改状态为 `done`，填写完成时间 |
| 分支不存在，功能未实现 | 改状态为 `backlog`（重新激活）|
| 分支存在，长期无更新 | 检查是否 blocked，未 blocked 则询问 Slaver |
| Ticket 已超出项目范围 | 改状态为 `cancelled` |

### Ticket 状态机

```
backlog → analysis → ready → gate_review → in_progress → test → pr_review → done
```

不存在"永久 IN_PROGRESS"的 ticket。如果一个 ticket 在 `in_progress` 超过 1 周无更新，触发 Master 心跳检查。

---

## 3. outbox 清理规则 {#outbox-cleanup}

`outbox/review_requests/` 里的文件对应每次 PR review 请求，PR 合并后必须删除。

```bash
# 检查 outbox 中过期的 review request
ls outbox/review_requests/

# 对每个文件，确认对应 PR 是否已合并
gh pr list --state merged | grep <ticket-id>

# 如果 PR 已合并，删除对应的 review request 文件
git rm outbox/review_requests/pr-<ticket-id>-*.md
```

**规则**：`outbox/review_requests/` 只应包含当前**待 review 的**请求文件。

---

## 4. 三仓库文件归属规范 {#three-repo-ownership}

EKET 使用三仓库分离架构：`confluence/`（知识）、`jira/`（任务）、`code_repo`（代码）。

| 文件类型 | 应在哪里 |
|---------|---------|
| 项目知识、架构决策、经验教训 | `confluence/` |
| Ticket 定义、任务追踪 | `jira/tickets/` |
| Ticket 模板 | `jira/templates/` |
| 执行报告、审计报告 | `docs/reports/` |
| 框架文档（给用户看的） | `docs/` |
| 新项目脚手架 | `template/` |
| 经验沉淀（知识库） | `confluence/memory/` |

**常见误放位置**：
- 执行报告（`TASK-XXX-COMPLETION-REPORT.md`）放在根目录 → 应移到 `docs/reports/`
- Ticket 完成后遗留的分析报告放在 `jira/tickets/` 但 ticket 已关闭 → 可归档
- 知识沉淀散落在 `docs/reports/` 里 → 应提炼到 `confluence/memory/`

---

## 5. 版本号同步规范 {#version-sync}

文档中的版本号必须与 `package.json` 的实际版本一致。

```bash
# 查看当前版本
cat node/package.json | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])"

# 批量检查文档中过时的版本号（如 v0.7.x）
grep -rn "v0\.[0-9]\." docs/ --include="*.md" | grep -v "archive\|CHANGELOG" | head -20
```

**规则**：
- `docs/` 下的 README.md 和主要文档的版本号应在每次 major 发布后同步
- `archive/` 里的文档允许保留历史版本号
- `template/` 里的文档不写具体版本号（写占位符如 `{{VERSION}}`）

---

**参见**：
- [DOC-DEBT-CLEANUP.md](DOC-DEBT-CLEANUP.md) — 文档债清理通用方法论
- [MULTI-AGENT-COLLAB-LESSONS.md](MULTI-AGENT-COLLAB-LESSONS.md) — 多智能体协作经验
- [BORROWED-WISDOM.md](BORROWED-WISDOM.md) — 完整知识库索引
