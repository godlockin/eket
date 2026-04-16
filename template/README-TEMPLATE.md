# template/ 目录说明

**目的**: 存放 EKET 框架的所有模板文件和初始化资源

---

## 目录结构

```
template/
├── CLAUDE.md                     # Claude Code 项目指南
├── AGENTS.md                     # 通用 AI Agent 引导文件
├── README.md                     # 项目 README 模板
├── SYSTEM-SETTINGS.md            # 系统设定模板
├── SECURITY.md                   # 安全指南
├── FILE-CLASSIFICATION.md        # 文件分类策略（元文档）
├── INIT-GUIDE.md                 # 初始化快速指南
├── eket.config.yml               # EKET 配置文件
│
├── .claude/                      # Claude Code 配置
│   ├── commands/                 # 自定义命令脚本
│   ├── CLAUDE.md                 # 命令使用说明
│   └── settings.json             # 权限配置
│
├── .eket/                        # EKET 框架配置
│   ├── config.yml                # 主配置文件
│   ├── version.yml               # 版本信息
│   ├── health_check.sh           # 健康检查脚本
│   ├── IDENTITY.md               # 实例身份说明
│   ├── config/                   # 模块化子配置
│   └── state/                    # 状态文件模板
│
├── .github/                      # GitHub 配置
│   └── workflows/                # CI/CD 工作流
│
├── agents/                       # Agent 定义
│   ├── agent_base_template.yml
│   ├── coordinator/              # 协调型 Agent
│   ├── executor/                 # 执行型 Agent
│   ├── reviewer/                 # 审查型 Agent
│   └── dynamic/                  # 动态 Agent
│
├── skills/                       # Skills 定义
│   ├── design/                   # 设计类 Skills
│   ├── development/              # 开发类 Skills
│   ├── devops/                   # DevOps Skills
│   ├── documentation/            # 文档 Skills
│   ├── testing/                  # 测试 Skills
│   ├── requirements/             # 需求 Skills
│   └── registry.yml              # Skills 注册表
│
├── confluence/                   # Confluence 模板
│   ├── projects/PROJECT_NAME/    # 项目文档模板
│   └── templates/                # 通用模板
│
├── jira/                         # Jira 模板和结构
│   ├── state/                    # 状态文件模板
│   │   ├── ticket-index.yml      # Ticket 索引模板
│   │   └── project-status.yml    # 项目状态模板
│   ├── templates/                # Ticket 模板
│   ├── index/                    # 索引模板
│   └── tickets/                  # Ticket 目录模板
│
├── docs/                         # 框架文档
│   ├── EKET-VISION.md            # 框架愿景（D 类记忆文件）
│   ├── MASTER-HEARTBEAT-CHECKLIST.md
│   ├── SLAVER-HEARTBEAT-CHECKLIST.md
│   ├── MASTER-WORKFLOW.md
│   ├── SLAVER-AUTO-EXEC-GUIDE.md
│   ├── SLAVER-PR-WAIT-FLOW.md
│   ├── COMMUNICATION-PROTOCOL.md
│   └── TICKET-RESPONSIBILITIES.md
│
├── inbox/                        # 输入目录模板
│   ├── human_input.md            # 人类需求模板
│   ├── dependency-clarification.md # 依赖追问模板
│   └── human_feedback/.gitkeep
│
├── outbox/                       # 输出目录模板
│   ├── review_requests/.gitkeep
│   └── tasks/.gitkeep
│
├── tasks/                        # 任务目录模板
├── shared/                       # 共享目录模板
│   └── .state/.gitkeep
│
├── examples/                     # 快速开始示例
├── scripts/                      # 工具脚本（由根目录 scripts/ 引用）
└── .gitignore                    # Git 忽略规则
```

---

## 文件分类

详见 [`FILE-CLASSIFICATION.md`](./FILE-CLASSIFICATION.md)

### 快速参考

| 分类 | 描述 | 初始化行为 | 示例 |
|------|------|-----------|------|
| **A 类** | 运行时可变文件 | 创建空骨架 | `jira/state/ticket-index.yml` |
| **B 类** | 框架契约/规范 | 复制到项目 | `docs/*.md` |
| **C 类** | 模板文件 | 复制到项目 | `jira/templates/*.md` |
| **D 类** | 记忆加载文件 | 不复制，仅加载 | `docs/EKET-VISION.md` (框架版本) |

---

## 初始化流程

当运行 `scripts/init-project.sh <project-name> <project-root>` 时：

1. **创建目录结构** - 创建所有必需的目录
2. **复制 B 类文件** - 框架文档、规范
3. **复制 C 类文件** - 模板、Skills、Agents
4. **创建 A 类文件** - 空骨架状态文件
5. **配置 Git 仓库** - 初始化三仓库架构
6. **配置通信后端** - Redis/SQLite/文件系统

---

## 维护指南

### 添加新模板

1. 将模板文件放入相应子目录
2. 在 `FILE-CLASSIFICATION.md` 中登记
3. 确保 `init-project.sh` 包含复制逻辑

### 更新框架文档

1. 修改 `docs/` 下的对应文件
2. 更新 `EKET-VISION.md` 如需要
3. 通知现有项目用户更新（通过版本公告）

### 修改初始化行为

1. 修改 `scripts/init-project.sh`
2. 更新 `INIT-GUIDE.md`
3. 测试初始化流程

---

## 版本号

当前模板版本：**v2.1.3**  
最后更新：**2026-04-10**

---

**维护者**: EKET Framework Team
