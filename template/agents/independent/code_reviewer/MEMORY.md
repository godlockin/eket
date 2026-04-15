# Code Reviewer Memory

> **自动管理说明**：此文件由 code_reviewer 在每次 PR 审查后自动更新。
> 前 200 行会在每次启动时自动注入系统提示。超出后会迁移到主题子文件（如 `anti-patterns.md`）。
> **格式约定**：每条记忆需注明关联 PR/ticket ID（或 `[seed]` 表示初始种子）和日期。

---

## Code Style Conventions（代码风格约定）

> 本项目强制执行的编码约定，违反则标记为 blocker。

### TypeScript / ESM 规范

- **[seed] 2026-04-15** — ESM 导入必须带 `.js` 扩展名：`import { x } from './module.js'`（而非 `'./module'`）。适用于 `node/src/` 目录下所有内部导入。运行时报错的根本原因之一。
- **[seed] 2026-04-15** — 项目类型为 ES Modules（`"type": "module"`），禁止使用 CommonJS `require()`，除非在 `*.cjs` 文件中（如 `jest-resolver.cjs`）。
- **[seed] 2026-04-15** — TypeScript 严格模式：避免使用 `any` 类型。如果确实需要，必须添加 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 注释并说明原因。

### 错误处理约定

- **[seed] 2026-04-15** — 所有函数必须返回 `Result<T>` 类型（`{ success: true; data: T } | { success: false; error: EketError }`），禁止直接 `throw`。
- **[seed] 2026-04-15** — 错误码必须定义在 `types/index.ts` 的 `EketErrorCode` 枚举中，禁止硬编码错误字符串。
- **[seed] 2026-04-15** — 错误输出使用 `printError({ code, message })`，不得直接 `console.error()`。

### 命名规范

- **[seed] 2026-04-15** — 函数/变量：`camelCase`；类/接口/类型别名：`PascalCase`；常量：`UPPER_SNAKE_CASE`；枚举成员：`UPPER_SNAKE_CASE`。
- **[seed] 2026-04-15** — 异步函数命名：I/O 操作加 `Async` 后缀（如 `fetchDataAsync`），或使用 `await` 时已足够清晰则无需强制。
- **[seed] 2026-04-15** — 布尔变量/参数：使用 `is`/`has`/`can`/`should` 前缀（如 `isConnected`、`hasError`）。

### 文件组织

- **[seed] 2026-04-15** — 新增命令实现在 `commands/` 目录，通过 `registerXxx` 函数导出，在 `index.ts` 中统一注册。
- **[seed] 2026-04-15** — 核心业务逻辑放在 `core/` 目录，HTTP 服务器放在 `api/` 目录，工具函数放在 `utils/` 目录。
- **[seed] 2026-04-15** — 每个文件应只导出单一主要功能（单一职责原则）。

---

## Anti-Patterns（已知反模式）

> code_reviewer 在历次 review 中发现的反模式，遇到时直接标记为 blocker 或 suggestion。

### 错误处理反模式

- **[seed] 2026-04-15** — ❌ `throw new Error("xxx")` → ✅ `return { success: false, error: { code: EketErrorCode.XXX, message: "xxx" } }`。直接抛出异常会绕过 `Result<T>` 约定，导致上层调用者无法统一处理。**blocker**
- **[seed] 2026-04-15** — ❌ `catch(e) { console.log(e) }` （吞掉错误）→ ✅ 明确处理或将错误传播给上层调用者。**blocker**
- **[seed] 2026-04-15** — ❌ `try { ... } catch { }` （空 catch）→ ✅ 至少记录日志或返回 `Result` 失败状态。**blocker**

### TypeScript 类型反模式

- **[seed] 2026-04-15** — ❌ `as any` 强制类型转换（尤其在函数参数/返回值处）→ ✅ 定义正确的类型或使用 `unknown` + 类型守卫。**blocker**
- **[seed] 2026-04-15** — ❌ `interface Foo {}` 中大量使用 `string` 而非具体联合类型/枚举 → ✅ 使用枚举或字符串字面量联合类型，提升类型安全。**suggestion**
- **[seed] 2026-04-15** — ❌ 忽略 Promise 的返回值（未 `await`，也未 `.catch()`）→ ✅ 所有 Promise 必须被处理。**blocker**

### ESM 导入反模式

- **[seed] 2026-04-15** — ❌ `import { x } from './module'`（无 `.js` 扩展名）→ ✅ `import { x } from './module.js'`。Node.js ESM 不会自动补全扩展名。**blocker**
- **[seed] 2026-04-15** — ❌ `const { x } = require('./module')` → ✅ 使用 `import { x } from './module.js'`。**blocker**

### 测试反模式

- **[seed] 2026-04-15** — ❌ 用 `jest.mock()` 替换真实服务来"通过"集成测试（无注释说明原因）→ ✅ 集成测试应测试真实集成点，或明确注释"此处 mock 的原因"。**blocker**
- **[seed] 2026-04-15** — ❌ 测试用例只测 happy path，无 error case → ✅ 每个函数至少测试 1 个失败场景（`result.success === false`）。**suggestion**
- **[seed] 2026-04-15** — ❌ 测试名称模糊（`it('works', ...)`）→ ✅ 使用描述性名称（`it('returns failure result when Redis is unreachable', ...)`）。**suggestion**

### 安全反模式

- **[seed] 2026-04-15** — ❌ 硬编码 API Key、密码、密钥（即使是测试值）→ ✅ 使用环境变量，通过 `.env.example` 提供示例。**blocker**
- **[seed] 2026-04-15** — ❌ 日志中输出敏感信息（token、password、private key）→ ✅ 脱敏后输出（如 `key.substring(0, 4) + '****'`）。**blocker**
- **[seed] 2026-04-15** — ❌ 未验证用户输入直接传入 SQL/Shell 命令 → ✅ 使用参数化查询或输入验证。**blocker**

---

## Test Coverage Requirements（测试覆盖要求）

> 各模块的测试覆盖率基线，PR 合并前必须满足。

### 整体要求

- **[seed] 2026-04-15** — 全量测试：`npm test` 必须 981/981 通过（当前基线）。新增代码不得导致已有测试失败。
- **[seed] 2026-04-15** — 新增模块：必须同步提交对应测试文件（`tests/` 目录），覆盖率不低于 80%（行覆盖率）。

### 核心模块专项要求

| 模块 | 必须测试的场景 |
|------|--------------|
| `core/circuit-breaker.ts` | closed → open → half_open 状态转换；退避重试逻辑 |
| `core/cache-layer.ts` | 缓存命中；缓存穿透保护；LRU 淘汰 |
| `core/message-queue.ts` | Redis 不可用时降级到文件队列；重试机制 |
| `core/master-election.ts` | Redis SETNX 抢占；租约续期；降级到 SQLite |
| `core/connection-manager.ts` | 四级降级链路（Remote Redis → Local Redis → SQLite → File） |
| `api/` HTTP 服务器 | 认证中间件；路由 404；错误响应格式 |

### 测试文件命名约定

- **[seed] 2026-04-15** — 单元测试：`tests/<module-name>.test.ts`（与 `src/` 目录结构对应）
- **[seed] 2026-04-15** — 集成测试：`tests/integration/<feature>.test.ts`
- **[seed] 2026-04-15** — API 测试：`tests/api/<route>.test.ts`

---

## Review History Index（审查历史索引）

> 超出 200 行时，code_reviewer 会将此段内容迁移到 `review-history.md` 子文件。

| PR/Ticket | 决定 | 日期 | 关键 Blocker |
|-----------|------|------|-------------|
| （首次审查后自动填充） | | | |
