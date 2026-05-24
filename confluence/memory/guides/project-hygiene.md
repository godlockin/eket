# EKET 项目卫生规范

## docs/ vs confluence/memory/ 边界规则

### 目的
明确产品文档（docs/）与内部知识库（confluence/memory/）的职责边界，避免重复和混淆。

### 边界定义

#### docs/ — 产品文档（面向外部）
**受众**：外部用户、新贡献者、技术决策者  
**性质**：静态、稳定、版本化  
**更新频率**：低（版本发布时）

**包含内容**：
- architecture/ — 系统架构设计（三级降级、Master-Slaver、三仓库分离）
- adr/ — Architecture Decision Records（架构决策记录）
- api/ — API 文档、接口规范
- guides/ — 外部操作指南（用户视角：安装、快速上手、模式切换）
- reference/ — 参考文档（错误码、协议规范、CLI 命令）
- ops/ — 运维手册（runbook、备份恢复、分支保护）
- performance/ — 性能基准测试与优化建议
- roadmap/ — 路线图与版本规划
- archive/ — 历史文档归档（只进不出）

#### confluence/memory/ — 内部知识库（面向团队）
**受众**：EKET 开发团队（Master/Slaver）  
**性质**：动态、增量、实战沉淀  
**更新频率**：高（每次 EPIC/ticket 完成后）

**包含内容**：
- patterns/ — 可复用设计模式（实现细节、代码级模式）
- lessons/ — 经验教训（失败案例、防御策略、最佳实践）
- research/ — 研究笔记（技术调研、外部项目借鉴）
- retrospectives/ — 复盘记录（EPIC/ticket/PR 复盘）
- guides/ — 内部操作指南（团队协作：Agent 提示模板、Worktree 集成、代码维护）
- archive/ — 清理记录归档（文档审计、ticket 清理）

### 判定规则

| 问题 | docs/ | confluence/memory/ |
|------|-------|-------------------|
| 内容会频繁变化？ | ❌ | ✅ |
| 外部用户需要阅读？ | ✅ | ❌ |
| 属于产品功能说明？ | ✅ | ❌ |
| 记录失败经验教训？ | ❌ | ✅ |
| 包含实战代码细节？ | ❌ | ✅ |
| 需要版本化发布？ | ✅ | ❌ |

### 迁移原则

**从 confluence/memory/ → docs/**（符合以下条件）：
- 内容已稳定（3 个月无修改）
- 属于架构设计或产品功能说明
- 外部用户需要了解

**从 docs/ → confluence/memory/**（符合以下条件）：
- 内容频繁变化（每周更新）
- 仅团队内部使用
- 包含实战细节或临时研究

### 特殊说明

**guides/ 重叠处理**：
- docs/guides/：用户视角操作（installation, quickstart, mode-switching）
- confluence/memory/guides/：团队内部协作（agent-prompt-template, worktree-agent, codebase-maintenance）

**archive/ 处理**：
- docs/archive/：历史产品文档（旧版架构、废弃 API）
- confluence/memory/archive/：内部清理记录（审计报告、ticket 清理）

### 执行检查

新增文档时自问：
1. 这是给外部用户看的吗？ → Yes = docs/, No = confluence/
2. 这会频繁变化吗？ → Yes = confluence/, No = docs/
3. 这属于产品文档还是实战经验？ → 产品 = docs/, 经验 = confluence/
# EKET 项目卫生规则

**创建时间**: 2026-04-15
**维护者**: Master Agent
**适用范围**: EKET 框架自身项目的维护规则（非新项目模板）

---

## 新增条目格式

新增规则时，统一使用以下结构：

```markdown
### X.Y 标题

**问题**：什么情况下会触发这个规则？

**规则**：应该怎么做（一句话结论优先）。

**反例**：<!-- 可选 -->常见的违规做法。

**验证**：<!-- 可选 -->
\`\`\`bash
# 检查命令
\`\`\`
```

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
- [../codebase-maintenance.md](../codebase-maintenance.md) — 文档债清理通用方法论
- [multi-agent-collab-lessons.md](multi-agent-collab-lessons.md) — 多智能体协作经验
- [../research/borrowed-wisdom.md](../research/borrowed-wisdom.md) — 完整知识库索引

---

## 6. Skills 系统注册规范 {#skills-registry}

*来源：TASK-048 Skills 工具库补全*

### 6.1 批量 export 的类型冲突

Skills 泛型参数各不相同，统一 `forEach` 注册时需 `as any` cast，用 `// eslint-disable` 标注并在技术债记录中说明原因（不是因为懒）。

### 6.2 重复注册静默覆盖

`skillRegistry.register()` 内部用 Map，重复注册会覆盖而非报错。
**规则**：Skills 上线前必须校验 skill ID 唯一性（`grep -r "id:" node/src/skills/ | sort | uniq -d`）。
