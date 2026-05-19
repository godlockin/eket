# 项目级数据隔离设计原则

## 背景

**问题**: EKET 初期设计将部分项目数据（SQLite 数据库）存储在全局路径 `~/.eket/`，导致多项目之间数据混淆。

**影响**:
- 不同项目的任务、消息、状态互相干扰
- 无法并行运行多个独立的 EKET 项目
- 违反了"每个项目是独立宇宙"的设计原则

## 解决方案

### 核心原则

**项目级 vs 全局级明确划分**：

| 类型 | 存储位置 | 范围 | 示例 |
|------|---------|------|------|
| 项目数据 | `<项目根>/.eket/` | 单项目 | 数据库、消息队列、日志 |
| 协作体系 | `<项目根>/confluence/`, `jira/`, `shared/` | 单项目 | 任务、文档、PR 请求 |
| Agent 定义 | `~/.claude/skills/` | 全局跨项目 | 技能、能力定义 |
| 全局配置 | `~/.claude/settings.json` | 全局跨项目 | Claude Code 设置 |

### 路径修复清单

修复了 4 个文件中的全局路径引用：

```typescript
// ❌ 错误：使用全局路径
const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
return path.join(homeDir, '.eket', 'data', 'sqlite', 'eket.db');

// ✅ 正确：使用项目路径
return path.join(process.cwd(), '.eket', 'data', 'sqlite', 'eket.db');
```

修复的文件：
- `node/src/core/sqlite-shared.ts` - 数据库默认路径
- `node/src/core/sqlite-client.ts` - SQLiteClient 构造函数
- `node/src/core/sqlite-async-client.ts` - AsyncSQLiteClient 构造函数
- `node/src/commands/server-start.ts` - Server 启动命令

### 项目级目录结构

```
<项目根>/
├── .eket/                          # 项目级 EKET 数据
│   ├── config.yml                  # 项目配置
│   ├── IDENTITY.md                 # 身份卡片
│   ├── data/
│   │   ├── sqlite/eket.db         # 项目数据库 ⚠️ 关键修复点
│   │   ├── inboxes/               # Agent 邮箱
│   │   ├── queue/                 # 消息队列
│   │   └── queue-archive/         # 队列归档
│   ├── state/                      # 运行时状态
│   ├── logs/                       # 日志
│   ├── triggers/                   # 触发器
│   └── sessions/                   # 会话快照
├── confluence/                     # 知识库（项目级）
├── jira/                          # 任务管理（项目级）
└── shared/                        # 协作消息（项目级）
    └── message_queue/
        ├── inbox/                 # Master/Slaver 通信
        └── outbox/
```

## 最佳实践

### 1. 路径构建规范

```typescript
// ✅ 推荐：使用 process.cwd() 构建项目级路径
const projectPath = path.join(process.cwd(), '.eket', 'data', 'queue');

// ✅ 推荐：使用 findProjectRoot() 查找项目根
const projectRoot = findProjectRoot();
const dbPath = path.join(projectRoot, '.eket', 'data', 'sqlite', 'eket.db');

// ✅ 推荐：支持环境变量覆盖（用于测试）
const dbPath = process.env.EKET_SQLITE_PATH || getDefaultDBPath();

// ❌ 避免：使用全局 HOME 目录存储项目数据
const wrongPath = path.join(process.env.HOME, '.eket', 'data'); // 错误！
```

### 2. 检查清单

在添加新的数据存储时，问自己：

- [ ] 这个数据是项目专属的吗？→ 使用 `<项目根>/.eket/`
- [ ] 这个数据需要跨项目共享吗？→ 使用 `~/.claude/` 或明确文档说明
- [ ] 路径支持环境变量覆盖吗？→ 添加 `EKET_XXX_PATH` 环境变量
- [ ] 文档中说明了存储位置吗？→ 更新注释和文档

### 3. 代码审查要点

```bash
# 查找潜在的全局路径引用
grep -r "process.env.HOME.*\.eket" node/src/
grep -r "process.env.USERPROFILE.*\.eket" node/src/

# 应该返回空（除了 formatDBPath 等工具函数）
```

## 收益

- ✅ **多项目隔离**: 可以同时运行多个独立的 EKET 项目
- ✅ **数据安全**: 不同项目的数据不会互相污染
- ✅ **测试友好**: 测试环境可以使用独立的项目目录
- ✅ **部署灵活**: 项目可以整体打包、迁移、备份

## 相关文件

- `node/src/core/sqlite-shared.ts` - 数据库路径工具
- `node/src/core/file-queue-manager.ts` - 项目根目录查找
- `.eket/config.yml` - 项目配置示例

## 版本

- **创建时间**: 2026-05-19
- **最后更新**: 2026-05-19
- **适用版本**: EKET v2.9.0-alpha+

## 标签

`#architecture` `#data-isolation` `#project-structure` `#best-practices`
