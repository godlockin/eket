# CLI 交互用户体验审查报告

**审查对象**: EKET Framework CLI v0.7.3
**审查日期**: 2026-04-01
**审查员**: AI UX Expert
**审查范围**: Node.js CLI 命令、Shell 启动脚本、错误消息、帮助系统

---

## 执行摘要

本次审查覆盖了 EKET Framework 的 CLI 交互体验，包括 10+ 个命令模块、混合适配器、错误处理系统和帮助文档。整体架构设计合理，但存在多个影响用户体验的问题，需要优先级修复。

**总体评分**: 6.5/10

| 维度 | 评分 | 说明 |
|------|------|------|
| 命令一致性 | 7/10 | 大部分遵循 verb:noun，但存在混用 |
| 错误消息 | 5/10 | 技术化严重，缺乏可操作指引 |
| 进度反馈 | 6/10 | 基础反馈存在，缺少进度条/Spinner |
| 帮助文档 | 7/10 | 有基本 --help，但缺少示例 |
| 默认值 | 8/10 | 大部分合理 |
| 配置复杂度 | 5/10 | 配置项分散，>7 个临界点 |
| 学习曲线 | 6/10 | 新手引导不足 |

---

## 1. CLI 命令一致性评估

### 现状分析

**良好实践**：
- 大部分命令采用 `verb:noun` 格式（符合 Unix 传统）
- 使用 Commander.js 提供统一的参数解析

```typescript
// 一致性好
'redis:check', 'redis:list-slavers'
'sqlite:check', 'sqlite:list-retros', 'sqlite:search', 'sqlite:report'
'alerts:status', 'alerts:acknowledge', 'alerts:resolve'
'heartbeat:start', 'heartbeat:status'
'pool:status', 'pool:select'
'web:dashboard'
'dependency:analyze'
```

**不一致问题**：

| 问题 | 位置 | 建议 |
|------|------|------|
| `start:instance` vs `/eket-start` | CLI vs Shell 脚本 | 统一为 `instance:start` 或 `start` |
| `mq:test` | node/src/index.ts | 改为 `message:test` 或 `queue:test` |
| `doctor` | node/src/index.ts | 改为 `system:doctor` 或 `diagnose` |
| `check` | node/src/index.ts | 改为 `system:check` 或 `check:modules` |
| `init` vs `init-wizard` | 命令命名 | 统一为 `project:init` |

### 命令分类混乱

当前命令没有清晰的分组，用户难以记忆：

```
Redis 命令：redis:*, sqlite:*          → 按技术分
告警命令：alerts:*                     → 按功能分
心跳命令：heartbeat:*                  → 按机制分
Pool 命令：pool:*                      → 按组件分
网关命令：gateway:*, hooks:*           → 按集成分
```

**建议采用分层命名**：
```
system:check, system:doctor, system:info
data:redis:check, data:sqlite:check, data:redis:list
collab:alerts:status, collab:heartbeat:start
agent:pool:status, agent:pool:select, agent:start
web:dashboard:start, web:hooks:start
```

---

## 2. 错误消息评估

### 当前问题

**P0 - 技术化严重，用户无法理解**：

```typescript
// 当前实现 - 不友好
console.error('错误：未找到 EKET 项目');
console.error('错误：未找到项目配置');
console.error('连接注册表失败:', connectResult.error.message);
```

**问题分析**：
1. 只告诉用户"是什么错了"，不告诉"如何修复"
2. 没有提供上下文信息
3. 没有建议的下一步行动

### 错误消息对比

| 当前消息 | 问题 | 建议改进 |
|----------|------|----------|
| `错误：未找到 EKET 项目` | 无上下文，无解决方案 | `错误：当前目录不是 EKET 项目\n\n可能原因:\n  - 你在错误的目录中运行命令\n  - 项目尚未初始化\n\n解决方案:\n  1. cd 到项目目录后重试\n  2. 运行 'eket-cli project:init' 初始化新项目\n\n当前目录：/path/to/current` |
| `错误：未找到项目配置` | 无文件路径，无法定位 | `错误：项目配置文件不存在\n\n缺失文件：.eket/config/config.yml\n\n可能原因:\n  - 项目初始化未完成\n  - 配置文件被误删\n\n解决方案:\n  运行 'eket-cli project:init' 重新生成配置` |
| `Redis 连接失败` | 无调试信息 | `错误：无法连接 Redis\n\n配置信息:\n  主机：localhost:6379\n  数据库：0\n\n可能原因:\n  - Redis 服务未启动\n  - 防火墙阻止连接\n  - 配置错误\n\n解决方案:\n  1. 检查 Redis 状态：systemctl status redis\n  2. 测试连接：redis-cli ping\n  3. 修改配置：export EKET_REDIS_HOST=<your-redis>\n\n调试命令：eket-cli redis:check` |

### 错误码系统 - 设计良好但未充分利用

```typescript
// types/index.ts - 有良好的错误码定义
export enum EketErrorCode {
  REDIS_NOT_CONNECTED = 'REDIS_NOT_CONNECTED',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  // ... 40+ 错误码
}
```

**问题**：错误码定义完整，但实际使用时没有附带：
- 错误码本身（便于搜索文档）
- 相关上下文
- 建议的修复步骤

### 改进建议模板

```typescript
// 建议的错误处理模式
interface UserFriendlyError {
  code: string;           // 错误码，便于搜索
  summary: string;        // 一句话总结
  context: {              // 相关上下文
    currentDir: string;
    configPath: string;
    attemptedAction: string;
  };
  causes: string[];       // 可能原因列表
  solutions: string[];    // 建议解决方案
  documentation?: string; // 相关文档链接
}

function printError(error: UserFriendlyError): void {
  console.error(chalk.red(`\n❌ ${error.summary}\n`));
  console.error(chalk.yellow('错误码:'), error.code);

  if (Object.keys(error.context).length > 0) {
    console.error(chalk.blue('\n上下文:'));
    Object.entries(error.context).forEach(([k, v]) => {
      console.error(`  ${k}: ${v}`);
    });
  }

  console.error(chalk.yellow('\n可能原因:'));
  error.causes.forEach((cause, i) => {
    console.error(`  ${i + 1}. ${cause}`);
  });

  console.error(chalk.green('\n建议操作:'));
  error.solutions.forEach((solution, i) => {
    console.error(`  ${i + 1}. ${solution}`);
  });

  if (error.documentation) {
    console.error(chalk.cyan(`\n文档：${error.documentation}`));
  }

  console.error('');
}
```

---

## 3. 进度反馈评估

### 当前状态

**有基本反馈**：
```typescript
console.log('正在构建依赖图...');
console.log('加载任务列表...');
console.log('获取 Instance 列表...');
console.log('✓ 已加载 10 个任务');
```

**缺失内容**：

| 缺失项 | 影响 | 场景示例 |
|--------|------|----------|
| 进度条 | 长时间操作无预期 | 初始化三仓库克隆 |
| Spinner | 不知道是否卡住 | Redis 连接尝试 |
| 预估时间 | 无法规划等待 | 大量任务分析 |
| 阶段性反馈 | 不知道进展 | 多步骤初始化向导 |
| 可中断提示 | 不知道如何取消 | 长运行命令 |

### 改进建议

**1. 添加 Spinner（使用 cli-spinners 或类似库）**：
```typescript
// 当前
console.log('正在启动 Web 服务器...');

// 改进
const spinner = ora('正在启动 Web 服务器...').start();
try {
  await server.start();
  spinner.succeed('Web 服务器已启动');
} catch (err) {
  spinner.fail(`启动失败：${err.message}`);
}
```

**2. 添加进度条（用于多步骤操作）**：
```typescript
// 初始化向导场景
const steps = [
  '收集项目信息',
  '配置 Git 仓库',
  '配置 Redis/SQLite',
  '创建目录结构',
  '生成配置文件',
];

const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
bar.start(steps.length, 0);

for (let i = 0; i < steps.length; i++) {
  bar.update(i + 1);
  console.log(`\n步骤 ${i + 1}/${steps.length}: ${steps[i]}`);
  await executeStep(i);
}

bar.stop();
```

**3. 显示可中断提示**：
```typescript
console.log('按 Ctrl+C 可随时中断...\n');
```

---

## 4. 帮助文档可用性评估

### 当前状态

**基本 --help 已实现**：
```typescript
program
  .name(pkg.name)
  .version(pkg.version)
  .description(pkg.description);
```

**hybrid-adapter.sh 有帮助**：
```bash
$ ./lib/adapters/hybrid-adapter.sh --help
EKET Hybrid Adapter v0.7.0

用法：$0 <command> [args...]

可用命令:

  Redis 相关 (Node.js):
    redis:check          - 检查 Redis 连接状态
    redis:list-slavers   - 列出所有活跃 Slaver
  ...
```

### 问题

| 问题 | 影响 |
|------|------|
| 缺少示例 | 用户不知道如何使用复杂命令 |
| 缺少相关命令链接 | 用户不知道下一步该用什么 |
| 缺少在线文档链接 | 无法深入学习 |
| 缺少交互式帮助 | 新手无法探索 |

### 改进建议

**1. 添加示例到 --help**：
```typescript
program
  .command('dependency:analyze')
  .description('分析任务依赖关系')
  .option('-p, --project-root <path>', '项目根目录', process.cwd())
  .option('--mermaid', '输出 Mermaid 格式图表')
  .option('--critical-path', '分析关键路径')
  .option('--check-cycles', '检测循环依赖')
  .addHelpText('after', `
示例:
  $ eket-cli dependency:analyze                    # 基础分析
  $ eket-cli dependency:analyze --mermaid          # 输出 Mermaid 图表
  $ eket-cli dependency:analyze --critical-path    # 分析关键路径
  $ eket-cli dependency:analyze --check-cycles     # 检测循环依赖

相关命令:
  $ eket-cli recommend                             # 智能任务推荐
  $ eket-cli alerts:status                         # 查看告警状态

文档:
  https://eket.dev/docs/dependency-analysis
`);
```

**2. 添加交互式探索命令**：
```typescript
program
  .command('help:explore')
  .description('交互式探索可用命令')
  .action(() => {
    // 使用 Inquirer.js 创建交互式菜单
    console.log('EKET CLI 命令浏览器');
    console.log('选择一个类别:');
    console.log('  1. 系统管理 (system:*)');
    console.log('  2. 数据管理 (data:*)');
    console.log('  3. 协作工具 (collab:*)');
    console.log('  4. Agent 管理 (agent:*)');
    console.log('  5. Web 服务 (web:*)');
    // ...
  });
```

---

## 5. 默认值合理性评估

### 良好实践

| 配置项 | 默认值 | 评价 |
|--------|--------|------|
| Redis Host | localhost | 合理，适合本地开发 |
| Redis Port | 6379 | 标准端口 |
| Web Dashboard Port | 3000 | 常见开发端口 |
| Hook Server Port | 8899 | 不冲突的高端口 |
| Heartbeat Interval | 10000ms | 合理间隔 |

### 问题

| 问题 | 位置 | 建议 |
|------|------|------|
| 项目路径默认值 | `project:init -p` 默认 process.cwd() | 应检测当前是否为空目录 |
| API Gateway 端口 | 8080 可能已被占用 | 尝试 8080→8081→8082 自动递增 |
| 初始化向导默认值 | 组织名称默认 'my-org' | 应从 Git 配置或系统用户名推断 |

### 配置项数量问题

**init-wizard.ts** 要求用户配置：

```
1. 项目名称
2. 组织名称
3. Confluence URL + Branch + Auth (4 项)
4. Jira URL + Branch + Auth (4 项)
5. CodeRepo URL + Branch + Auth (4 项)
6. Redis Enabled + Host + Port + Password + DB (5 项)
7. SQLite Enabled + Path (2 项)

总计：22+ 配置项，远超 7 个认知上限
```

**建议采用渐进式配置**：
```
Phase 1 - 最小可用配置（3 项）:
  - 项目名称
  - Git 平台选择（GitHub/GitLab/Gitee）
  - 是否使用 Redis（是/否）

Phase 2 - 可选增强:
  - 详细的仓库配置
  - 认证配置
  - 高级选项
```

---

## 6. 配置复杂度评估

### 当前问题

**环境变量分散**：
```bash
# Redis 相关
EKET_REDIS_HOST
EKET_REDIS_PORT
EKET_REDIS_PASSWORD

# OpenCLAW 相关
EKET_OPENCLAW_ENABLED
EKET_OPENCLAW_MODE
EKET_OPENCLAW_GATEWAY_PORT
EKET_OPENCLAW_GATEWAY_HOST
EKET_OPENCLAW_AUTH_TYPE
EKET_OPENCLAW_API_KEY_ENV
EKET_OPENCLAW_MQ_TYPE
EKET_OPENCLAW_MQ_HOST
EKET_OPENCLAW_MQ_PORT
EKET_OPENCLAW_MQ_PASSWORD
EKET_OPENCLAW_AUTO_SPAWN
EKET_OPENCLAW_MAX_CONCURRENT
EKET_OPENCLAW_IDLE_TIMEOUT

# Hook 相关
EKET_HOOK_SECRET

# 其他
OPENCLAW_API_KEY
```

**总计 20+ 环境变量，无文档说明优先级**

### 建议

**1. 创建配置分组文档**：
```markdown
## 必需配置（启动前必须设置）
- EKET_REDIS_HOST=localhost
- EKET_REDIS_PORT=6379

## 推荐配置（生产环境建议设置）
- EKET_HOOK_SECRET=<random-32-chars>
- OPENCLAW_API_KEY=<random-32-chars>

## 高级配置（有特殊需求时修改）
- EKET_OPENCLAW_* 系列配置
```

**2. 提供配置生成工具**：
```bash
# 生成安全配置
$ eket-cli config:generate --production

# 输出：
# 已生成 .env.production:
# - EKET_HOOK_SECRET=已生成随机值
# - OPENCLAW_API_KEY=已生成随机值
# - 其他配置已设置安全默认值
```

---

## 7. 学习曲线分析

### 新用户路径问题

**当前新用户旅程**：
```
1. 安装/克隆项目
2. ??? （缺少快速开始指南）
3. 运行 /eket-start
4. 看到错误 "未找到 EKET 项目"
5. ??? （不知道下一步）
```

**问题**：
1. 没有明确的 "5 分钟快速开始"
2. 错误信息不引导用户到文档
3. 没有交互式教程

### 建议

**1. 添加快速开始向导**：
```bash
$ eket-cli quickstart

欢迎使用 EKET Framework!

这是你第一次运行吗？ [Y/n]
> Y

太好了！让我帮你快速上手...

步骤 1/4: 创建新项目目录
项目名称：my-awesome-project
目录：/Users/chenchen/projects/my-awesome-project [回车确认]

步骤 2/4: 初始化项目结构
✓ 创建目录结构
✓ 生成配置文件
✓ 初始化 Git 仓库

步骤 3/4: 配置数据连接
使用 Redis 吗？ [Y/n] (推荐，用于多实例协作)
> Y
Redis 主机：localhost [回车确认]

步骤 4/4: 启动第一个 Instance
✓ 配置完成！

现在运行：cd my-awesome-project && /eket-start
```

**2. 添加交互式教程命令**：
```bash
$ eket-cli tutorial

选择一个教程:
1. 5 分钟快速开始
2. 创建你的第一个任务
3. 配置多实例协作
4. 使用 Web Dashboard
5. 集成 OpenCLAW
```

---

## 发现的问题

### P0 - 阻塞用户体验

1. **错误消息无操作指引**
   - 用户看到错误后不知道如何解决
   - 导致新手放弃使用

2. **缺少快速开始指南**
   - 新用户不知道第一步做什么
   - 学习曲线陡峭

3. **配置项超过认知上限**
   - 22+ 配置项同时出现
   - 用户被配置吓退

### P1 - 高影响问题

4. **命令命名不一致**
   - `start:instance` vs `/eket-start`
   - `doctor` vs `system:doctor`
   - 用户记忆负担重

5. **帮助文档缺少示例**
   - 用户不知道命令的具体用法
   - 需要反复试错

6. **长时间操作无进度反馈**
   - 初始化、分析等操作无进度指示
   - 用户不知道是否卡住

7. **环境变量无组织文档**
   - 20+ 环境变量分散
   - 不知道哪些是必需的

### P2 - 改进建议

8. **缺少交互式探索**
   - 无法浏览可用命令
   - 新手难以发现功能

9. **没有配置生成工具**
   - 安全配置（API Key、Secret）需要手动生成
   - 用户可能使用弱密钥

10. **错误码未充分利用**
    - 错误码定义完整但未在输出中显示
    - 失去文档索引价值

11. **Web Dashboard 无自动打开**
    - 启动后需要手动复制 URL 到浏览器
    - 缺少 "按 O 打开" 快捷功能

---

## 快速获胜列表（1 小时内可修复）

以下问题可以快速修复，立即提升用户体验：

| # | 问题 | 修复内容 | 影响 |
|---|------|----------|------|
| 1 | 错误消息改进 | 为 3 个最常见错误添加解决指引 | 高 |
| 2 | 添加 --help 示例 | 为 5 个核心命令添加示例文本 | 中 |
| 3 | 可中断提示 | 在长运行命令添加"按 Ctrl+C 中断" | 中 |
| 4 | 配置项分组 | 将配置分为"必需"和"可选"两组 | 高 |
| 5 | 环境变量文档 | 创建 .env.example 文件带注释 | 中 |
| 6 | 启动完成提示 | Web Dashboard 启动后显示"在浏览器打开：URL" | 低 |
| 7 | 错误码输出 | 在错误消息中显示错误码 | 中 |
| 8 | 默认值改进 | init-wizard 默认值从系统推断 | 低 |

---

## CLI 改进建议

### 短期（1-2 周）

**1. 错误消息重构**
```typescript
// 创建统一的错误打印函数
import { getErrorDocumentation } from './docs';

function printUserError(code: string, context: Record<string, string>): void {
  const doc = getErrorDocumentation(code);
  console.error(chalk.red(`\n❌ ${doc.summary}\n`));
  console.error(chalk.yellow('错误码:'), code);
  console.error(chalk.green('\n解决方案:'));
  doc.solutions.forEach((s, i) => console.error(`  ${i + 1}. ${s}`));
  console.error(chalk.cyan(`\n文档：https://eket.dev/docs/errors/${code}\n`));
}
```

**2. 命令标准化**
```typescript
// 统一命令命名
const commandMap = {
  'start:instance': 'instance:start',
  'doctor': 'system:doctor',
  'check': 'system:check',
  'init': 'project:init',
  'mq:test': 'queue:test',
};
```

**3. 添加进度反馈**
```typescript
// 使用 cli-spinners
import ora from 'ora';

async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>
): Promise<T> {
  const spinner = ora(message).start();
  try {
    const result = await fn();
    spinner.succeed();
    return result;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

// 使用
await withSpinner('正在连接 Redis...', () => redisClient.connect());
```

### 中期（1 个月）

**4. 交互式快速开始**
```typescript
import inquirer from 'inquirer';

program
  .command('quickstart')
  .description('5 分钟快速开始向导')
  .action(async () => {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: '项目名称:',
        default: path.basename(process.cwd()),
      },
      {
        type: 'confirm',
        name: 'useRedis',
        message: '使用 Redis 吗？（多实例协作推荐）',
        default: true,
      },
      // ...
    ]);
    // ...
  });
```

**5. 配置生成工具**
```typescript
program
  .command('config:generate [type]')
  .description('生成配置文件')
  .option('--production', '生成生产环境配置')
  .action(async (type, options) => {
    const config = generateSecureConfig({
      production: options.production,
    });
    console.log('已生成配置:');
    console.log(config);
  });
```

### 长期（3 个月）

**6. TUI 界面（终端用户界面）**
```
┌─ EKET Dashboard ──────────────────────────────────────┐
│                                                       │
│  [1] Instance 状态              [4] 任务列表          │
│  ● master (idle)              - FEAT-101 进行中       │
│  ○ frontend_dev (busy)        - FEAT-102 待领取       │
│  ○ backend_dev (idle)         - BUG-50 待审核         │
│                                                       │
│  [2] 系统状态                 [5] 快捷操作            │
│  Redis: ● 正常                [S] 启动 Instance       │
│  SQLite: ● 正常               [C] 领取任务            │
│  Queue: ● 正常                [R] 查看报告            │
│                                                       │
│  [3] 告警 (0 活跃)                                    │
│  ✓ 无活跃告警                                         │
│                                                       │
└───────────────────────────────────────────────────────┘
  ↑↓ 导航  Enter 选择  Q 退出  ? 帮助
```

---

## 附录：错误消息模板

```typescript
// errors/user-friendly-errors.ts

export interface UserErrorDoc {
  code: string;
  summary: string;
  causes: string[];
  solutions: string[];
  documentation: string;
  relatedCommands: string[];
}

export const ERROR_DOCS: Record<string, UserErrorDoc> = {
  'PROJECT_NOT_FOUND': {
    code: 'PROJECT_NOT_FOUND',
    summary: '当前目录不是 EKET 项目',
    causes: [
      '在错误的目录中运行命令',
      '项目尚未初始化',
    ],
    solutions: [
      'cd 到项目目录后重试',
      '运行 "eket-cli project:init" 初始化新项目',
    ],
    documentation: 'https://eket.dev/docs/errors/PROJECT_NOT_FOUND',
    relatedCommands: ['project:init', 'project:info'],
  },

  'CONFIG_NOT_FOUND': {
    code: 'CONFIG_NOT_FOUND',
    summary: '项目配置文件不存在',
    causes: [
      '项目初始化未完成',
      '配置文件被误删',
    ],
    solutions: [
      '运行 "eket-cli project:init" 重新生成配置',
      '从版本控制恢复配置文件',
    ],
    documentation: 'https://eket.dev/docs/errors/CONFIG_NOT_FOUND',
    relatedCommands: ['project:init', 'config:validate'],
  },

  'REDIS_NOT_CONNECTED': {
    code: 'REDIS_NOT_CONNECTED',
    summary: '无法连接 Redis',
    causes: [
      'Redis 服务未启动',
      '防火墙阻止连接',
      '配置错误',
    ],
    solutions: [
      '检查 Redis 状态：systemctl status redis',
      '测试连接：redis-cli ping',
      '修改配置：export EKET_REDIS_HOST=<your-redis>',
    ],
    documentation: 'https://eket.dev/docs/errors/REDIS_NOT_CONNECTED',
    relatedCommands: ['data:redis:check', 'system:doctor'],
  },
};
```

---

**报告结束**

*下次审查建议：在修复上述问题后，进行 A/B 测试验证改进效果*
