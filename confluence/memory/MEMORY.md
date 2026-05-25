# MEMORY.md

> 🧠 **EKET 项目记忆快速导航** — 启动时加载此文件获取关键上下文

---

## 🔥 最常用

| 文档 | 用途 |
|------|------|
| [memory-index.md](memory-index.md) | 完整记忆索引（68+ 文件） |
| [codebase-map.md](codebase-map.md) | 代码库架构地图 |
| [glossary/terms.md](glossary/terms.md) | EKET 术语表 |

---

## 📐 核心模式

| 模式 | 摘要 |
|------|------|
| [四级降级](patterns/four-level-degradation.md) | Shell → Rust → Node.js → Redis |
| [Master-Slaver 协调](patterns/master-slaver-coordination.md) | 多实例协作模式 |
| [知识飞轮](patterns/knowledge-flywheel.md) | claim 推送 + complete 触发 |
| [Git Worktree 集成](patterns/git-worktree-eket-integration.md) | 并行开发隔离 |

---

## ⚠️ 高频陷阱

| 陷阱 | 症状 | 解决 |
|------|------|------|
| [上下文爆炸](pitfalls/context-explosion-defense.md) | 任务熔断/超时 | 分块写入 + /compact |
| [Master 单点故障](pitfalls/master-single-point-failure.md) | 无人处理 PR | 外部 Supervisor |
| [Worktree 代码丢失](pitfalls/slaver-worktree-code-loss.md) | 代码未提交 | 强制 checkpoint |
| [并行 .git/index.lock](retrospectives/epics/EPIC-003.md) | 死锁 | 串行 git 操作 |

---

## 📚 关键经验

| 经验 | 核心教训 |
|------|---------|
| [项目级数据隔离](lessons/project-level-data-isolation.md) | SQLite/队列必须在项目内 |
| [Agent 幻觉问题](lessons/epic-006-slaver-lessons-2026-05-09.md) | 隔离环境导致状态不同步 |
| [红队 Bug 模式](lessons/red-team-bug-patterns.md) | tokio Mutex/AbortHandle |
| [Claude Code Setup 对比](lessons/claude-code-setup-comparison.md) | 竞品分析与改进方向 |

---

## 🛠️ 指南

| 指南 | 适用场景 |
|------|---------|
| [分支策略](guides/branch-strategy.md) | 三分支同步 |
| [Ticket 编号规则](guides/ticket-numbering-rules.md) | FEAT/FIX/TASK 前缀 |
| [Agent Prompt 模板](guides/agent-prompt-template.md) | 防卡死 |
| [Context Token 预算](guides/context-token-budget.md) | 200K 限制管理 |

---

## 📊 最近更新

| 日期 | 文件 | 变更 |
|------|------|------|
| 2026-05-19 | [claude-code-setup-comparison.md](lessons/claude-code-setup-comparison.md) | 新增：竞品分析 |
| 2026-05-19 | [project-level-data-isolation.md](lessons/project-level-data-isolation.md) | 新增：数据隔离原则 |
| 2026-05-19 | [context-overflow-prevention.md](lessons/context-overflow-prevention.md) | 新增：上下文溢出防御 |
| 2026-05-18 | [EKET-PROJECT-HYGIENE.md](EKET-PROJECT-HYGIENE.md) | 新增：项目卫生规则 |

---

## 🔍 按需加载指令

在 Claude Code 中使用以下指令按需加载记忆：

```bash
# 查看完整索引
cat confluence/memory/memory-index.md

# 查看特定分类
ls confluence/memory/patterns/
ls confluence/memory/pitfalls/
ls confluence/memory/lessons/

# 搜索关键词
grep -r "上下文" confluence/memory/ --include="*.md" -l
```

---

*快速导航 | 详细内容见 [memory-index.md](memory-index.md) | 共 71 文件*
