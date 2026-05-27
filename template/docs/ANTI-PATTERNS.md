---
title: AI Tells / Anti-Pattern 禁止列表
version: 1.0.0
last_updated: 2026-05-27
severity_levels:
  P0: 禁止提交，自动拦截
  P1: 警告，需要显式豁免
  P2: 建议修复，不阻断
---

# AI Tells / Anti-Pattern 禁止列表

> LLM 生成代码的常见"指纹"问题。所有 EKET 代码必须通过 anti-pattern 检查。

---

## 快速索引（按需查询用）

> ⚠️ **不要一次性加载全文**。根据需要 `grep` 对应分类。

| 分类 | P0 数 | P1 数 | P2 数 | grep 命令 |
|------|-------|-------|-------|-----------|
| 1. 代码风格 | 2 | 2 | 0 | `grep -A 20 "## 1\. 代码风格"` |
| 2. 错误处理 | 2 | 2 | 0 | `grep -A 30 "## 2\. 错误处理"` |
| 3. 注释 | 1 | 2 | 1 | `grep -A 25 "## 3\. 注释"` |
| 4. 类型 | 2 | 1 | 1 | `grep -A 25 "## 4\. 类型"` |
| 5. 资源管理 | 1 | 2 | 1 | `grep -A 25 "## 5\. 资源管理"` |
| 6. 命名 | 1 | 2 | 1 | `grep -A 20 "## 6\. 命名"` |
| 7. 架构 | 2 | 2 | 1 | `grep -A 30 "## 7\. 架构"` |
| 8. Imports | 1 | 1 | 1 | `grep -A 20 "## 8\. Imports"` |
| 9. 测试 | 1 | 2 | 1 | `grep -A 25 "## 9\. 测试"` |
| 10. 性能 | 2 | 2 | 0 | `grep -A 25 "## 10\. 性能"` |

**总计**: P0=15, P1=18, P2=7 (共 40 条)

---

## 严重程度说明

| 级别 | 标记 | 处理 |
|------|------|------|
| P0 | :red_circle: | 禁止提交，CI 自动拦截 |
| P1 | :yellow_circle: | 警告，需 `[APPROVED OVERRIDE]` 豁免 |
| P2 | :large_blue_circle: | 建议修复，PR Review 指出 |

---

## 1. 代码风格 Anti-Patterns

### 1.1 :red_circle: P0 Em-dash 滥用

LLM 偏爱 em-dash (---)，人类几乎不用。

```typescript
// BAD
const description = "This feature --- designed for scale --- handles millions of requests";

// GOOD
const description = "This feature, designed for scale, handles millions of requests";
```

### 1.2 :red_circle: P0 LLM 口头禅

LLM 特有的开场白和过渡语。

```typescript
// BAD - 注释中的 LLM 口头禅
// Let's implement the authentication logic
// Now let's add validation
// Here we handle the error case
// This is where we process the data

// GOOD - 直接描述意图
// Authentication logic
// Input validation
// Error handler
// Data processing
```

**禁止词列表**:
- "Let's" / "Now let's" / "Here we"
- "Simply" / "Just" / "Basically"
- "In order to" (用 "To" 替代)
- "It's important to note that"
- "As mentioned earlier"

### 1.3 :yellow_circle: P1 过度礼貌注释

```typescript
// BAD
// Please ensure you check the error
// Kindly handle the null case
// Thank you for using this function

// GOOD
// Error check required
// Null guard
// (无需感谢语)
```

### 1.4 :large_blue_circle: P2 冗长变量命名

LLM 倾向于过度描述的命名。

```typescript
// BAD
const userAuthenticationTokenValidationResult = validateToken(token);
const isUserCurrentlyLoggedInAndSessionValid = checkSession();

// GOOD
const tokenResult = validateToken(token);
const isLoggedIn = checkSession();
```

---

## 2. 错误处理 Anti-Patterns

### 2.1 :red_circle: P0 静默 catch

最危险的 anti-pattern，错误被吞噬。

```typescript
// BAD
try {
  await riskyOperation();
} catch {
  // 空 catch，错误消失
}

// BAD
try {
  await riskyOperation();
} catch (e) {
  console.log(e); // 仅 log，无 rethrow/处理
}

// GOOD
try {
  await riskyOperation();
} catch (e: unknown) {
  logger.error('riskyOperation failed', { error: e, context: { userId } });
  throw new ServiceError('Operation failed', { cause: e });
}
```

### 2.2 :red_circle: P0 `catch (e: any)`

绕过类型安全。

```typescript
// BAD
try {
  await fetch(url);
} catch (e: any) {
  console.log(e.message); // e.message 可能不存在
}

// GOOD
try {
  await fetch(url);
} catch (e: unknown) {
  if (e instanceof Error) {
    logger.error(e.message);
  } else {
    logger.error('Unknown error', { raw: e });
  }
}
```

### 2.3 :yellow_circle: P1 模板化错误处理

LLM 生成的通用错误处理，无实际逻辑。

```typescript
// BAD - LLM 模板
try {
  const result = await processData(input);
  return result;
} catch (error) {
  console.error('An error occurred:', error);
  throw error;
}

// GOOD - 有意义的处理
try {
  const result = await processData(input);
  return result;
} catch (e: unknown) {
  if (isRetryableError(e)) {
    return retry(() => processData(input), { maxAttempts: 3 });
  }
  throw enrichError(e, { input, operation: 'processData' });
}
```

### 2.4 :yellow_circle: P1 错误信息泄露

生产环境暴露敏感信息。

```typescript
// BAD
throw new Error(`Database connection failed: ${connectionString}`);
throw new Error(`API key invalid: ${apiKey}`);

// GOOD
throw new DatabaseError('Connection failed', { code: 'DB_CONN_001' });
logger.error('API auth failed', { keyPrefix: apiKey.slice(0, 4) });
```

---

## 3. 注释 Anti-Patterns

### 3.1 :red_circle: P0 Placeholder TODO

LLM 常留下永远不会实现的 TODO。

```typescript
// BAD
function processPayment() {
  // TODO: implement
}

function validateInput(data: unknown) {
  // TODO: Add validation logic here
  return true;
}

// GOOD - 要么实现，要么删除
function processPayment(amount: number, method: PaymentMethod): PaymentResult {
  return paymentGateway.charge(amount, method);
}

// 如果确实需要 TODO，必须带 ticket
// TODO(TASK-042): 添加信用卡验证逻辑，预计 2 小时
```

### 3.2 :red_circle: P0 过度注释

LLM 生成大量无意义注释。

```typescript
// BAD
// This function gets the user by ID
// It takes a userId parameter
// And returns the user object
async function getUserById(userId: string): Promise<User> {
  // Get the user from the database
  const user = await db.users.findOne({ id: userId });
  // Return the user
  return user;
}

// GOOD - 代码自解释，仅注释复杂逻辑
async function getUserById(userId: string): Promise<User> {
  return db.users.findOne({ id: userId });
}

// 复杂业务逻辑才需要注释
// 7 天内无活动的用户视为 inactive，需要重新验证 session
const inactiveThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
```

### 3.3 :yellow_circle: P1 重复代码的注释

```typescript
// BAD
const MAX_RETRY = 3; // Maximum number of retries is 3
const TIMEOUT = 5000; // Timeout in milliseconds (5 seconds)

// GOOD - 常量名已说明意图
const MAX_RETRY = 3;
const TIMEOUT_MS = 5000;
```

### 3.4 :large_blue_circle: P2 过时注释

注释与代码不匹配。

```typescript
// BAD
// Fetches user from cache
async function getUser(id: string) {
  return db.users.findById(id); // 实际从 DB 获取
}

// GOOD - 删除过时注释或更新
async function getUser(id: string) {
  return db.users.findById(id);
}
```

---

## 4. 类型 Anti-Patterns (EKET 核心)

### 4.1 :red_circle: P0 `any` 类型

EKET 第一铁律：`any` is a four-letter word.

```typescript
// BAD
function process(data: any): any {
  return data.map((x: any) => x.value);
}

// GOOD
interface DataItem {
  value: number;
  label: string;
}

function process(data: DataItem[]): number[] {
  return data.map(x => x.value);
}
```

### 4.2 :red_circle: P0 `@ts-ignore` / `@ts-expect-error`

绕过类型检查。

```typescript
// BAD
// @ts-ignore
const result = unsafeOperation();

// @ts-expect-error - 类型系统不对
obj.nonExistentMethod();

// GOOD - 修复类型问题
const result = safeOperation() as ExpectedType;
// 或重构代码使类型匹配
```

### 4.3 :yellow_circle: P1 隐式 `any`

未显式声明但推断为 `any`。

```typescript
// BAD
function parseConfig(input) { // input: any (隐式)
  return JSON.parse(input);
}

// GOOD
function parseConfig(input: string): Config {
  return JSON.parse(input) as Config;
}
```

### 4.4 :yellow_circle: P1 过宽泛类型

```typescript
// BAD
function handleEvent(event: object) {}
function setOptions(opts: Record<string, unknown>) {}

// GOOD
function handleEvent(event: UserEvent | SystemEvent) {}
function setOptions(opts: ServiceOptions) {}
```

---

## 5. 资源管理 Anti-Patterns (EKET 核心)

### 5.1 :red_circle: P0 资源无 TTL

缓存、连接池等必须有过期策略。

```typescript
// BAD
const cache = new Map<string, User>();

function getUser(id: string): User {
  if (!cache.has(id)) {
    cache.set(id, fetchUser(id)); // 永不过期
  }
  return cache.get(id)!;
}

// GOOD
const cache = new LRUCache<string, User>({
  max: 1000,
  ttl: 5 * 60 * 1000, // 5 分钟
});
```

### 5.2 :red_circle: P0 静默降级无标注

降级必须显式标注和监控。

```typescript
// BAD - 静默降级
async function getConfig(): Promise<Config> {
  try {
    return await fetchRemoteConfig();
  } catch {
    return defaultConfig; // 静默切换，无人知晓
  }
}

// GOOD
async function getConfig(): Promise<Config> {
  try {
    return await fetchRemoteConfig();
  } catch (e: unknown) {
    logger.warn('Remote config unavailable, using default', { error: e });
    metrics.increment('config.fallback');
    return defaultConfig; // 降级标注: 使用本地默认配置
  }
}
```

### 5.3 :yellow_circle: P1 未关闭资源

```typescript
// BAD
async function readFile(path: string) {
  const file = await fs.open(path, 'r');
  const content = await file.readFile('utf-8');
  return content; // file 未关闭
}

// GOOD
async function readFile(path: string) {
  const file = await fs.open(path, 'r');
  try {
    return await file.readFile('utf-8');
  } finally {
    await file.close();
  }
}
```

### 5.4 :yellow_circle: P1 无限重试

```typescript
// BAD
async function fetchWithRetry(url: string): Promise<Response> {
  while (true) {
    try {
      return await fetch(url);
    } catch {
      await sleep(1000); // 无限循环
    }
  }
}

// GOOD
async function fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fetch(url);
    } catch (e: unknown) {
      if (i === maxAttempts - 1) throw e;
      await sleep(Math.pow(2, i) * 1000); // 指数退避
    }
  }
  throw new Error('Unreachable');
}
```

---

## 6. 命名 Anti-Patterns

### 6.1 :yellow_circle: P1 含糊命名

```typescript
// BAD
const data = fetchData();
const result = process(data);
const temp = transform(result);
const final = validate(temp);

// GOOD
const rawOrders = fetchOrders();
const enrichedOrders = enrichWithCustomerData(rawOrders);
const formattedOrders = formatForExport(enrichedOrders);
const validOrders = validateOrderSchema(formattedOrders);
```

### 6.2 :yellow_circle: P1 匈牙利命名

```typescript
// BAD
const strUserName: string = 'alice';
const arrItems: Item[] = [];
const objConfig: Config = {};

// GOOD
const userName: string = 'alice';
const items: Item[] = [];
const config: Config = {};
```

### 6.3 :large_blue_circle: P2 无意义缩写

```typescript
// BAD
function procUsrDta(dta: unknown) {}
const cfg = loadCfg();
const btn = getBtn();

// GOOD
function processUserData(data: UserData) {}
const config = loadConfig();
const button = getButton();
```

### 6.4 :large_blue_circle: P2 布尔命名无 is/has/should

```typescript
// BAD
const active: boolean;
const permissions: boolean;
const validate: boolean;

// GOOD
const isActive: boolean;
const hasPermissions: boolean;
const shouldValidate: boolean;
```

---

## 7. 架构 Anti-Patterns

### 7.1 :red_circle: P0 硬编码密钥

```typescript
// BAD
const API_KEY = 'sk-1234567890abcdef';
const DB_PASSWORD = 'admin123';

// GOOD
const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error('API_KEY not configured');
```

### 7.2 :red_circle: P0 跨层直接调用

```typescript
// BAD - Controller 直接访问 DB
class UserController {
  async getUser(req: Request) {
    const user = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    return user;
  }
}

// GOOD - 分层架构
class UserController {
  constructor(private userService: UserService) {}

  async getUser(req: Request) {
    return this.userService.findById(req.params.id);
  }
}
```

### 7.3 :yellow_circle: P1 God Object

```typescript
// BAD
class Application {
  async handleRequest() {}
  async connectDatabase() {}
  async sendEmail() {}
  async processPayment() {}
  async generateReport() {}
  // ... 50+ 方法
}

// GOOD - 单一职责
class RequestHandler {}
class DatabaseConnection {}
class EmailService {}
class PaymentProcessor {}
class ReportGenerator {}
```

### 7.4 :yellow_circle: P1 循环依赖

```typescript
// BAD
// a.ts
import { B } from './b';
export class A { b = new B(); }

// b.ts
import { A } from './a';
export class B { a = new A(); } // 循环

// GOOD - 依赖注入或事件
// a.ts
export class A {
  constructor(private deps: { onEvent: (data: Data) => void }) {}
}
```

### 7.5 :large_blue_circle: P2 过度抽象

LLM 倾向于过度工程化。

```typescript
// BAD - 一个简单操作的过度抽象
interface IUserFetcherFactory {
  createFetcher(): IUserFetcher;
}

class UserFetcherFactoryImpl implements IUserFetcherFactory {
  createFetcher(): IUserFetcher {
    return new UserFetcherImpl(new UserRepositoryAdapter(new DatabaseConnector()));
  }
}

// GOOD - 简单直接
async function getUser(id: string): Promise<User> {
  return db.users.findById(id);
}
```

---

## 8. 导入 Anti-Patterns

### 8.1 :red_circle: P0 未使用的 import

```typescript
// BAD
import { map, filter, reduce, flatMap, groupBy } from 'lodash';

function process(items: Item[]) {
  return items.filter(x => x.active); // 只用了 filter
}

// GOOD
import { filter } from 'lodash';
// 或使用原生
function process(items: Item[]) {
  return items.filter(x => x.active);
}
```

### 8.2 :yellow_circle: P1 通配符导入

```typescript
// BAD
import * as utils from './utils';
utils.formatDate();
utils.parseJSON();

// GOOD
import { formatDate, parseJSON } from './utils';
```

### 8.3 :yellow_circle: P1 相对路径过深

```typescript
// BAD
import { Config } from '../../../../../../../config';

// GOOD (配置 path alias)
import { Config } from '@/config';
```

---

## 9. 测试 Anti-Patterns

### 9.1 :red_circle: P0 测试 Mock 行为

```typescript
// BAD - 测试 mock 是否存在
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});

// GOOD - 测试真实行为
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});
```

### 9.2 :red_circle: P0 生产代码中的测试专用方法

```typescript
// BAD
class Session {
  // 仅测试使用的 destroy 方法
  async destroy() {
    await this._workspaceManager?.destroyWorkspace(this.id);
  }
}

// GOOD - 测试逻辑在测试工具中
// test-utils/session.ts
export async function cleanupSession(session: Session) {
  // 清理逻辑
}
```

### 9.3 :yellow_circle: P1 不完整的 Mock

```typescript
// BAD - 部分 mock
const mockResponse = {
  status: 'success',
  data: { userId: '123' }
  // 缺少 metadata 字段
};

// GOOD - 完整 mock
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: Date.now() }
};
```

### 9.4 :large_blue_circle: P2 魔法数字

```typescript
// BAD
expect(result.length).toBe(42);
expect(delay).toBe(5000);

// GOOD
const EXPECTED_ITEM_COUNT = 42;
const STANDARD_TIMEOUT_MS = 5000;
expect(result.length).toBe(EXPECTED_ITEM_COUNT);
expect(delay).toBe(STANDARD_TIMEOUT_MS);
```

---

## 10. 性能 Anti-Patterns

### 10.1 :yellow_circle: P1 循环中的 await

```typescript
// BAD - 串行执行
for (const id of userIds) {
  const user = await fetchUser(id); // N 次串行请求
  results.push(user);
}

// GOOD - 并行执行
const results = await Promise.all(
  userIds.map(id => fetchUser(id))
);
```

### 10.2 :yellow_circle: P1 N+1 查询

```typescript
// BAD
const orders = await db.orders.findAll();
for (const order of orders) {
  order.customer = await db.customers.findById(order.customerId);
}

// GOOD
const orders = await db.orders.findAll({
  include: [{ model: Customer }]
});
```

### 10.3 :yellow_circle: P1 未 memoize 的计算

```typescript
// BAD - 每次渲染都重新计算
function Component({ items }) {
  const filtered = items.filter(x => x.active).map(x => transform(x));
  return <List items={filtered} />;
}

// GOOD
function Component({ items }) {
  const filtered = useMemo(
    () => items.filter(x => x.active).map(x => transform(x)),
    [items]
  );
  return <List items={filtered} />;
}
```

### 10.4 :large_blue_circle: P2 不必要的深拷贝

```typescript
// BAD
const copy = JSON.parse(JSON.stringify(obj)); // 慢且丢失类型

// GOOD
const copy = structuredClone(obj);
// 或针对性浅拷贝
const copy = { ...obj, nested: { ...obj.nested } };
```

---

## 检测与修复

### 自动检测

```bash
# 运行 anti-pattern 检测器
npm run lint:anti-patterns

# 仅检测 P0 级别
npm run lint:anti-patterns -- --severity=P0

# 生成报告
npm run lint:anti-patterns -- --report
```

### 豁免格式

当必须豁免时，使用标准注释：

```typescript
// [APPROVED OVERRIDE] P1: 静默降级
// 原因: 健康检查端口扫描，预期失败不需要日志
// 批准者: master
// 日期: 2026-05-27
try {
  await checkPort(port);
} catch {
  return false;
}
```

### CI 集成

```yaml
# .github/workflows/anti-pattern.yml
- name: Anti-Pattern Check
  run: npm run lint:anti-patterns -- --severity=P0 --fail-on-error
```

---

## 快速参考

| 类别 | P0 (禁止) | P1 (警告) | P2 (建议) |
|------|-----------|-----------|-----------|
| 风格 | em-dash, LLM 口头禅 | 过度礼貌 | 冗长命名 |
| 错误 | 静默 catch, any catch | 模板化处理, 信息泄露 | - |
| 注释 | TODO 占位, 过度注释 | 重复注释 | 过时注释 |
| 类型 | any, @ts-ignore | 隐式 any, 过宽类型 | - |
| 资源 | 无 TTL, 静默降级 | 未关闭, 无限重试 | - |
| 命名 | - | 含糊, 匈牙利 | 无意义缩写, 布尔命名 |
| 架构 | 硬编码密钥, 跨层调用 | God Object, 循环依赖 | 过度抽象 |
| 导入 | 未使用 import | 通配符, 深路径 | - |
| 测试 | 测试 mock, 测试专用方法 | 不完整 mock | 魔法数字 |
| 性能 | - | 循环 await, N+1, 无 memo | 深拷贝 |

---

> 相关文档: [SLAVER-RULES.md](SLAVER-RULES.md) | [ADVERSARIAL-REVIEW-PLAYBOOK.md](ADVERSARIAL-REVIEW-PLAYBOOK.md)
