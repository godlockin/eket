# Utils Module API Documentation

## 概述

Utils 模块提供 EKET 框架的基础设施工具函数，包括错误处理、配置验证、加密、进程管理、日志记录等。

## 主要职责

- **错误处理与日志**：统一错误格式、结构化日志
- **配置管理**：验证、加密、合并配置
- **进程生命周期**：优雅退出、资源清理
- **文件操作**：安全读写、原子更新
- **加密与安全**：敏感数据加密、环境变量验证

---

## 核心工具

### error-handler.ts

**职责**：
- 统一错误报告格式
- 结构化错误上下文
- 颜色化终端输出
- 解决方案建议

**主要 API**：

#### `printError(context: ErrorContext): void`

打印格式化错误信息（包含错误码、原因、解决方案）。

**参数**：
```typescript
interface ErrorContext {
  code: string;              // 错误码（如 'AGENT_NOT_FOUND'）
  message: string;           // 错误描述
  details?: Record<string, unknown>; // 附加上下文
  causes?: string[];         // 可能原因列表
  solutions?: string[];      // 解决方案列表
  quickFix?: string;         // 一键修复命令
  docLink?: string;          // 文档链接
  command?: string;          // 触发错误的命令
  severity?: 'info' | 'warning' | 'error' | 'critical';
}
```

**使用示例**：
```typescript
import { printError } from '../utils/error-handler.js';

printError({
  code: 'REDIS_UNAVAILABLE',
  message: 'Failed to connect to Redis',
  details: { host: 'localhost', port: 6379 },
  causes: [
    'Redis server not running',
    'Firewall blocking port 6379',
    'Invalid credentials'
  ],
  solutions: [
    'Start Redis: redis-server',
    'Check firewall: sudo ufw allow 6379',
    'Verify REDIS_PASSWORD in .env'
  ],
  quickFix: 'redis-server &',
  docLink: 'https://eket.dev/docs/redis-setup',
  severity: 'critical'
});
```

**输出格式**：
```
❌ [REDIS_UNAVAILABLE] Failed to connect to Redis

📋 Details:
   host: localhost
   port: 6379

🔍 Possible causes:
   - Redis server not running
   - Firewall blocking port 6379
   - Invalid credentials

💡 Suggested solutions:
   1. Start Redis: redis-server
   2. Check firewall: sudo ufw allow 6379
   3. Verify REDIS_PASSWORD in .env

⚡ Quick fix: redis-server &

📖 Documentation: https://eket.dev/docs/redis-setup
```

#### `logSuccess(message: string): void`

打印成功信息（绿色 checkmark）。

```typescript
import { logSuccess } from '../utils/error-handler.js';

logSuccess('Task TASK-001 claimed successfully');
// ✅ Task TASK-001 claimed successfully
```

#### `logWarning(message: string): void`

打印警告信息（黄色警告符号）。

```typescript
import { logWarning } from '../utils/error-handler.js';

logWarning('Redis unavailable, falling back to in-memory mode');
// ⚠️  Redis unavailable, falling back to in-memory mode
```

---

### config-validator.ts

**职责**：
- 验证 `config.yml` 结构
- 必填字段检查
- 类型验证
- 默认值填充

**主要 API**：

#### `validateConfig(config: unknown): Result<Config>`

验证配置文件（返回 `Result<Config>` 而非抛出异常）。

```typescript
import { validateConfig } from '../utils/config-validator.js';

const result = validateConfig(yamlConfig);

if (result.success) {
  console.log('Config is valid:', result.data);
} else {
  console.error('Config errors:', result.error);
}
```

**验证规则**：
- `projectRoot`: 必填，绝对路径
- `role`: 必填，enum `['master', 'slaver']`
- `redis.enabled`: boolean
- `sqlite.path`: 相对路径，默认 `.eket/state/eket.db`
- `agentPool.healthCheckInterval`: 正整数，默认 60000（ms）

---

### encryption.ts

**职责**：
- 敏感数据加密/解密（AES-256-GCM）
- 环境变量安全读取
- 密钥管理（自动生成 + 持久化）

**主要 API**：

#### `encrypt(plaintext: string, key?: string): string`

加密字符串（返回 Base64 格式）。

```typescript
import { encrypt, decrypt } from '../utils/encryption.js';

const encrypted = encrypt('my-api-key');
// Output: "iv:ciphertext:authTag" (Base64 encoded)

const decrypted = decrypt(encrypted);
// Output: "my-api-key"
```

#### `getEncryptionKey(): string`

获取或生成加密密钥（存储在 `.eket/state/.key`）。

```typescript
import { getEncryptionKey } from '../utils/encryption.js';

const key = getEncryptionKey();
// Auto-generated 32-byte hex key
```

#### `safeEnv(key: string, required?: boolean): string | undefined`

安全读取环境变量（自动解密 `ENC:` 前缀值）。

```typescript
import { safeEnv } from '../utils/encryption.js';

// .env:
// REDIS_PASSWORD=ENC:abc123...

const password = safeEnv('REDIS_PASSWORD', true);
// Automatically decrypted

// Missing required env
const missing = safeEnv('MISSING_KEY', true);
// Throws: "Required env var MISSING_KEY not found"
```

---

### process-cleanup.ts

**职责**：
- 优雅关闭（SIGINT/SIGTERM 处理）
- 资源清理（关闭数据库连接、Redis、HTTP 服务器）
- 清理 worktree（可选保留）
- 进程锁管理（防止重复启动）

**主要 API**：

#### `registerCleanupHandler(handler: () => Promise<void>): void`

注册清理回调（进程退出时执行）。

```typescript
import { registerCleanupHandler } from '../utils/process-cleanup.js';

registerCleanupHandler(async () => {
  console.log('Closing Redis connection...');
  await redis.quit();
  console.log('Cleanup完成');
});

// Ctrl+C 时自动触发
```

#### `findProjectRoot(): string`

查找项目根目录（包含 `.eket/config.yml`）。

```typescript
import { findProjectRoot } from '../utils/process-cleanup.js';

const root = findProjectRoot();
// /Users/user/projects/my-eket-project
```

#### `acquireProcessLock(lockFile: string): boolean`

获取进程锁（防止同一 Agent 重复启动）。

```typescript
import { acquireProcessLock } from '../utils/process-cleanup.js';

const acquired = acquireProcessLock('.eket/state/master.lock');

if (!acquired) {
  console.error('Master already running');
  process.exit(1);
}
```

---

### execFileNoThrow.ts

**职责**：
- 安全执行外部命令（不抛异常）
- 超时控制
- stdio 捕获
- 退出码检查

**主要 API**：

#### `execFileNoThrow(command: string, args: string[], options?): Promise<ExecResult>`

执行命令（返回 `{ success, stdout, stderr, exitCode }`）。

```typescript
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

const result = await execFileNoThrow('git', ['status', '--short'], {
  cwd: projectRoot,
  timeout: 5000
});

if (result.success) {
  console.log('Git output:', result.stdout);
} else {
  console.error('Git failed:', result.stderr, `(exit ${result.exitCode})`);
}
```

**返回类型**：
```typescript
interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
}
```

---

### completion.ts

**职责**：
- Shell 命令补全（bash/zsh）
- 自动补全 ticket ID
- 子命令补全

**使用示例**：
```bash
# 安装补全脚本
eket completion --install

# 使用补全
eket task:claim TASK-<TAB>
# 自动补全可用 ticket ID
```

---

## 工具函数（小型辅助）

### `retry(fn, options)`

重试函数（指数退避）。

```typescript
import { retry } from '../utils/retry.js';

const result = await retry(
  () => fetch('https://api.example.com/data'),
  {
    retries: 3,
    delay: 1000,      // 初始延迟 1 秒
    backoff: 2,       // 指数退避倍数
    timeout: 30000    // 总超时 30 秒
  }
);
```

### `debounce(fn, delay)`

防抖函数。

```typescript
import { debounce } from '../utils/debounce.js';

const handleInput = debounce((value: string) => {
  console.log('Searching:', value);
}, 300);

input.addEventListener('input', (e) => handleInput(e.target.value));
```

### `deepMerge(target, source)`

深度合并对象（用于配置合并）。

```typescript
import { deepMerge } from '../utils/deep-merge.js';

const defaults = { redis: { host: 'localhost', port: 6379 } };
const userConfig = { redis: { port: 6380 } };

const merged = deepMerge(defaults, userConfig);
// { redis: { host: 'localhost', port: 6380 } }
```

---

## 测试工具

### `mockConfig(overrides?)`

生成测试用配置对象。

```typescript
import { mockConfig } from '../utils/test-helpers.js';

const config = mockConfig({
  role: 'slaver',
  agentPool: { maxCapacity: 5 }
});
```

### `createTempDir()`

创建临时目录（测试后自动清理）。

```typescript
import { createTempDir } from '../utils/test-helpers.js';

const tmpDir = await createTempDir();
// /tmp/eket-test-abc123

// 测试代码...

// 自动清理（通过 registerCleanupHandler）
```

---

## 日志工具

### `logger.ts`

结构化日志（支持不同级别 + JSON 输出）。

```typescript
import { logger } from '../utils/logger.js';

logger.info('Task claimed', { ticketId: 'TASK-001', agent: 'slaver-001' });
logger.warn('Redis connection slow', { latency: 500 });
logger.error('Failed to load ticket', { error: err.message });

// JSON 模式
logger.setFormat('json');
logger.info('Task claimed', { ticketId: 'TASK-001' });
// {"level":"info","message":"Task claimed","ticketId":"TASK-001","timestamp":"2026-05-10T12:00:00.000Z"}
```

---

## 错误码索引

| 错误码 | 描述 | 快速修复 |
|--------|------|---------|
| `CONFIG_INVALID` | config.yml 格式错误 | `eket config:validate` |
| `REDIS_UNAVAILABLE` | Redis 连接失败 | `redis-server &` |
| `SQLITE_LOCKED` | SQLite 数据库锁定 | 关闭其他 EKET 进程 |
| `WORKTREE_CONFLICT` | 分支名冲突 | 使用不同分支名 |
| `ENV_MISSING` | 缺少必需环境变量 | 检查 `.env` 文件 |
| `PERMISSION_DENIED` | 文件权限不足 | `chmod +x <file>` |

---

## 性能优化建议

- **批量操作**：使用 `execFileNoThrow` 的 `batch` 选项执行多个命令
- **缓存**：频繁读取的配置使用 `lru-cache`
- **懒加载**：动态 `import()` 延迟加载工具函数
- **并行执行**：使用 `Promise.all()` 而非串行 `await`

---

## 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| 2.1 | 2026-05 | 加密模块支持 AES-256-GCM |
| 2.0 | 2026-04 | 进程清理自动注册 |
| 1.5 | 2026-03 | 错误处理支持 quick fix |
| 1.0 | 2026-02 | 初始版本 |

---

**更多信息**：参见 [TypeDoc 自动生成文档](./index.html)
