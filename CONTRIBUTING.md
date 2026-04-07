# EKET Framework 贡献指南

## 📁 文件分类：框架代码 vs 运行时数据

### 重要原则

**EKET 框架仓库** 只应包含框架本身的代码，不应包含运行时生成的用户数据。

---

## ✅ 应该提交的文件（框架改进）

### 1. 框架核心代码
```
node/src/**/*.ts              ✅ 源代码
node/tests/**/*.test.ts       ✅ 测试代码
node/package.json             ✅ 依赖配置
node/tsconfig.json            ✅ TypeScript 配置
node/jest.config.js           ✅ Jest 配置
```

### 2. 框架文档
```
docs/                         ✅ 框架文档
├── architecture/             ✅ 架构设计
├── api/                      ✅ API 文档
├── guides/                   ✅ 使用指南
└── bug-fixes/                ✅ Bug 修复记录

CHANGELOG.md                  ✅ 变更日志
README.md                     ✅ 项目说明
CONTRIBUTING.md               ✅ 贡献指南（本文件）
CLAUDE.md                     ✅ AI 指令文档
```

### 3. 框架模板（供用户使用）
```
template/                     ✅ 用户项目模板
├── .claude/commands/         ✅ EKET 命令脚本
├── .eket/IDENTITY.md         ✅ 身份模板
├── CLAUDE.md                 ✅ 用户指南模板
├── inbox/.gitkeep            ✅ 目录占位符
└── outbox/.gitkeep           ✅ 目录占位符
```

### 4. 框架脚本
```
scripts/                      ✅ 框架工具脚本
├── init.sh                   ✅ 初始化脚本
├── init-project.sh           ✅ 项目创建脚本
└── docker-redis.sh           ✅ Docker 辅助脚本

lib/adapters/                 ✅ 适配器脚本
```

---

## ❌ 不应提交的文件（运行时数据）

### 1. 用户项目数据（EKET 运行时）
```
inbox/human_input.md          ❌ 用户需求输入
inbox/human_feedback/         ❌ 用户反馈记录
outbox/                       ❌ 输出结果
jira/tickets/*.md             ❌ 运行时任务票
confluence/                   ❌ 运行时文档（非模板）
code_repo/                    ❌ 运行时代码仓库
```

### 2. 实例状态和数据
```
.eket/state/                  ❌ 实例状态
.eket/logs/                   ❌ 运行日志
.eket/memory/                 ❌ 记忆数据
.eket/instances/              ❌ 实例注册
.eket/data/                   ❌ 数据文件
```

### 3. 编译和临时文件
```
node/dist/                    ❌ 编译输出
node/coverage/                ❌ 测试覆盖率
node/node_modules/            ❌ 依赖包
node/.eket/                   ❌ 测试运行时数据
*.log                         ❌ 日志文件
*.tmp                         ❌ 临时文件
```

---

## 🎯 EKET 自举场景的特殊说明

当使用 EKET 框架优化 EKET 框架本身时：

### 运行时生成的文件（不提交）
```
inbox/human_input.md          ❌ 自举任务的需求描述
jira/tickets/TASK-*.md        ❌ 自举任务票
.eket/state/instance_config.yml  ❌ Master/Slaver 实例配置
```

### Slaver Agent 的代码修改（应提交）
```
node/src/types/index.ts       ✅ 添加错误码枚举
node/src/core/*.ts            ✅ 核心模块改进
node/tests/**/*.test.ts       ✅ 测试修复
docs/bug-fixes/*.md           ✅ 修复文档
```

---

## 🔧 正确的提交流程

### 步骤 1: 检查修改
```bash
# 查看所有修改
git status

# 查看具体修改内容
git diff node/src/
```

### 步骤 2: 只添加框架改进
```bash
# ✅ 正确：只提交框架代码改进
git add node/src/types/index.ts
git add node/src/core/sqlite-async-client.ts
git add node/tests/core/sqlite-async-client.test.ts
git add docs/bug-fixes/2026-04-07-bug-fixes-report.md

# ❌ 错误：不要提交运行时数据
# git add inbox/human_input.md          # 不要这样做！
# git add jira/tickets/                 # 不要这样做！
# git add .eket/state/                  # 不要这样做！
```

### 步骤 3: 创建规范的提交
```bash
git commit -m "fix: 修复 SQLite Worker dbPath 参数失效 (BUG-001)

- 添加 SQLITE_DBPATH_NOT_SET 到错误码枚举
- 修改 sqlite-async-client.ts 使用枚举而非字符串
- 提升类型安全性

Co-Authored-By: Slaver Agent <slaver@eket.ai>
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### 步骤 4: 推送到远程
```bash
git push origin main
```

---

## 📊 验证 .gitignore 是否正确

### 测试命令
```bash
# 检查特定文件是否被忽略
git check-ignore -v inbox/human_input.md
git check-ignore -v jira/tickets/TASK-001.md
git check-ignore -v .eket/state/instance_config.yml

# 查看被忽略的文件
git status --ignored
```

### 预期输出
```
.gitignore:10:inbox/human_input.md          inbox/human_input.md
.gitignore:13:jira/tickets/                 jira/tickets/TASK-001.md
.gitignore:2:.eket/state/                   .eket/state/instance_config.yml
```

---

## 🤝 贡献 EKET 框架的建议

### 1. 创建 Feature Branch
```bash
git checkout -b feature/TASK-001-fix-http-hook-server
```

### 2. 进行修改
- 只修改框架代码
- 添加测试
- 更新文档

### 3. 自测
```bash
cd node
npm run build      # 编译通过
npm test          # 测试通过
npm run lint      # 代码规范通过
```

### 4. 提交 PR
创建 Pull Request，描述：
- 修复的问题
- 修改的方案
- 测试验证
- 相关 Issue/Task

---

## ⚠️ 常见错误

### 错误 1: 提交了运行时数据
```bash
# 错误示例
git add inbox/ jira/ .eket/state/
```
**后果**: 框架仓库被污染，用户数据泄露

### 错误 2: 提交了编译产物
```bash
# 错误示例
git add node/dist/ node/coverage/
```
**后果**: 仓库体积膨胀，不必要的冲突

### 错误 3: 忘记更新文档
```bash
# 修改了代码但没有更新文档
git add node/src/core/new-feature.ts
# 忘记更新 docs/ 和 CHANGELOG.md
```
**后果**: 文档与代码不同步

---

## 🎓 最佳实践

### 1. Commit Message 规范
使用 Conventional Commits：
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

类型：
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

### 2. 小步提交
- 一个 commit 只做一件事
- commit 之间保持独立
- 每个 commit 都应该可以编译和测试

### 3. 代码审查
- 所有 PR 需要审查
- 至少一个 Approver
- 确保测试通过

---

## 📞 获取帮助

- 文档: `docs/`
- Issue: GitHub Issues
- 讨论: GitHub Discussions

---

**维护者**: EKET Framework Team
**最后更新**: 2026-04-07
