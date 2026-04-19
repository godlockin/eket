# TASK-003: SQLite 双实现合并 - 架构设计文档

**作者**: Slaver 3 (架构重构专家 - Backend)
**日期**: 2026-04-07
**状态**: 设计阶段
**优先级**: P1

---

## 一、现状分析

### 1.1 当前实现

目前存在两个独立的 SQLite 实现：

| 实现 | 文件路径 | 特点 | 接口 |
|------|---------|-----|------|
| **SQLiteClient** | `node/src/core/sqlite-client.ts` | 同步 API，基于 `better-sqlite3` | 同步方法 (Result\<T\>) |
| **AsyncSQLiteClient** | `node/src/core/sqlite-async-client.ts` | 异步 API，Worker 线程封装 | 异步方法 (Promise<Result\<T\>>) |

### 1.2 关键发现

#### ✅ 已有接口定义
在 `types/index.ts` 已定义 `ISQLiteClient` 接口（异步签名）：
```typescript
export interface ISQLiteClient {
  connect(): Promise<Result<void>>;
  close(): Promise<void>;
  isReady(): boolean;
  execute(sql: string, params?: unknown[]): Promise<Result<void>>;
  get(sql: string, params?: unknown[]): Promise<Result<unknown>>;
  all(sql: string, params?: unknown[]): Promise<Result<unknown[]>>;
  insertRetrospective(...): Promise<Result<number>>;
  // ... 其他业务方法
}
```

#### ✅ AsyncSQLiteClient 已实现接口
`AsyncSQLiteClient` 已经实现了 `ISQLiteClient` 接口：
```typescript
export class AsyncSQLiteClient implements ISQLiteClient { ... }
```

#### ❌ SQLiteClient 未实现接口
`SQLiteClient` 使用同步方法签名，无法直接实现 `ISQLiteClient`：
```typescript
export class SQLiteClient {
  connect(): Result<void>  // 同步
  close(): void            // 同步，无 Result
  execute(sql: string, params: unknown[]): Result<void>
  // ... 其他同步方法
}
```

### 1.3 调用方分析

通过 Grep 分析，主要调用方：
1. **master-election.ts** → 使用 `new SQLiteClient()` (同步)
2. **connection-manager.ts** → 使用 `new SQLiteClient()` (同步)
3. **CLI 命令** → 通过 `createSQLiteClient()` 工厂函数
4. **其他模块** → 大部分通过依赖注入

### 1.4 代码重复问题

两个实现中有大量重复代码：
- ✅ 相同的表结构初始化 (`initializeTables`)
- ✅ 相同的业务方法（insertRetrospective, getRetrospective 等）
- ✅ 相同的 SQL 语句
- ✅ 相同的 LIKE 转义逻辑 (`escapeLikePattern`)

---

## 二、架构设计

### 2.1 设计目标

1. **统一接口** - 对外提供单一的 `SQLiteManager`，自动选择实现
2. **向后兼容** - 保持现有 API 不变，避免大规模重构
3. **代码复用** - 消除重复代码，提升可维护性
4. **性能优化** - 根据场景自动选择同步/异步实现
5. **可测试性** - 支持依赖注入和 Mock

### 2.2 核心架构

```
┌─────────────────────────────────────────────────────────┐
│                   SQLiteManager                         │
│  (统一管理类，实现 ISQLiteClient)                          │
├─────────────────────────────────────────────────────────┤
│  - 根据配置选择 Sync/Async 实现                            │
│  - 统一接口（Promise<Result<T>>）                         │
│  - 自动降级（Async → Sync）                               │
└──────────────┬──────────────────────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌──────────────┐  ┌──────────────────┐
│ SyncAdapter  │  │ AsyncSQLiteClient│
│ (包装器)      │  │ (已实现接口)      │
├──────────────┤  ├──────────────────┤
│ 包装          │  │ Worker 线程       │
│ SQLiteClient │  │ 封装同步 API      │
│ 为异步接口    │  └──────────────────┘
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ SQLiteClient │
│ (同步实现)    │
└──────────────┘
```

### 2.3 技术方案

#### 方案 1: 适配器模式（推荐）✅

**实现步骤**:
1. 创建 `SyncSQLiteAdapter` 包装 `SQLiteClient`，转换为异步接口
2. 创建 `SQLiteManager` 统一管理类
3. 保留原有类，逐步迁移调用方

**优点**:
- ✅ 最小化改动，向后兼容
- ✅ 同步/异步实现可独立维护
- ✅ 支持运行时切换

**缺点**:
- ❌ 多一层包装，轻微性能损耗

#### 方案 2: 直接重构（备选）

**实现步骤**:
1. 修改 `SQLiteClient` 所有方法为异步
2. 删除 `AsyncSQLiteClient`
3. 统一到一个实现

**优点**:
- ✅ 架构最简洁
- ✅ 性能最优

**缺点**:
- ❌ 需要大规模修改调用方
- ❌ 破坏性变更，风险高

---

## 三、详细设计（方案 1）

### 3.1 文件结构

```
node/src/core/
├── sqlite-client.ts              # 保留，同步实现
├── sqlite-async-client.ts        # 保留，异步实现
├── sqlite-sync-adapter.ts        # 新增，同步→异步适配器
├── sqlite-manager.ts             # 新增，统一管理类
└── sqlite-shared.ts              # 新增，共享工具函数
```

### 3.2 共享工具模块

**文件**: `sqlite-shared.ts`

```typescript
/**
 * SQLite 共享工具函数
 * 抽取两个实现中的公共代码
 */
import Database from 'better-sqlite3';

/**
 * 初始化数据库表结构
 * 被 SQLiteClient 和 AsyncSQLiteClient Worker 调用
 */
export function initializeTables(db: Database.Database): void {
  db.exec(`
    -- Retrospective 主表
    CREATE TABLE IF NOT EXISTS retrospectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sprint_id TEXT NOT NULL,
      file_name TEXT UNIQUE,
      title TEXT NOT NULL,
      date TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    -- ... 其他表定义
  `);
}

/**
 * 转义 SQL LIKE 语句中的通配符
 */
export function escapeLikePattern(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * 获取默认数据库路径
 */
export function getDefaultDBPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(homeDir, '.eket', 'data', 'sqlite', 'eket.db');
}
```

### 3.3 同步适配器

**文件**: `sqlite-sync-adapter.ts`

```typescript
/**
 * 同步 SQLite 客户端适配器
 * 将 SQLiteClient 的同步 API 包装为异步接口
 */
import type { ISQLiteClient, Result } from '../types/index.js';
import { SQLiteClient } from './sqlite-client.js';

export class SyncSQLiteAdapter implements ISQLiteClient {
  private client: SQLiteClient;

  constructor(dbPath?: string) {
    this.client = new SQLiteClient(dbPath);
  }

  /**
   * 连接数据库（包装为异步）
   */
  async connect(): Promise<Result<void>> {
    return this.client.connect();
  }

  /**
   * 关闭数据库（包装为异步）
   */
  async close(): Promise<void> {
    this.client.close();
  }

  /**
   * 检查连接状态
   */
  isReady(): boolean {
    return this.client.isReady();
  }

  /**
   * 执行 SQL（包装为异步）
   */
  async execute(sql: string, params: unknown[] = []): Promise<Result<void>> {
    return this.client.execute(sql, params);
  }

  /**
   * 查询单行（包装为异步）
   */
  async get(sql: string, params: unknown[] = []): Promise<Result<unknown>> {
    return this.client.get(sql, params);
  }

  /**
   * 查询多行（包装为异步）
   */
  async all(sql: string, params: unknown[] = []): Promise<Result<unknown[]>> {
    return this.client.all(sql, params);
  }

  // ... 其他业务方法（简单包装为 async）
  async insertRetrospective(retro: {...}): Promise<Result<number>> {
    return this.client.insertRetrospective(retro);
  }

  async getRetrospective(sprintId: string): Promise<Result<unknown>> {
    return this.client.getRetrospective(sprintId);
  }

  // ... 其他方法类似
}
```

### 3.4 统一管理类

**文件**: `sqlite-manager.ts`

```typescript
/**
 * SQLite Manager - 统一 SQLite 客户端管理
 * 根据配置自动选择同步或异步实现
 */
import type { ISQLiteClient, Result } from '../types/index.js';
import { SyncSQLiteAdapter } from './sqlite-sync-adapter.js';
import { AsyncSQLiteClient } from './sqlite-async-client.js';

export interface SQLiteManagerConfig {
  dbPath?: string;
  /** 是否使用 Worker 异步实现（默认 false，使用同步） */
  useWorker?: boolean;
  /** 是否启用自动降级（Worker 失败时降级到同步） */
  autoFallback?: boolean;
}

export class SQLiteManager implements ISQLiteClient {
  private client: ISQLiteClient;
  private config: SQLiteManagerConfig;
  private usingWorker: boolean;

  constructor(config: SQLiteManagerConfig = {}) {
    this.config = {
      useWorker: false,
      autoFallback: true,
      ...config,
    };

    // 根据配置选择实现
    if (this.config.useWorker) {
      this.client = new AsyncSQLiteClient(this.config.dbPath);
      this.usingWorker = true;
    } else {
      this.client = new SyncSQLiteAdapter(this.config.dbPath);
      this.usingWorker = false;
    }
  }

  /**
   * 连接数据库（带自动降级）
   */
  async connect(): Promise<Result<void>> {
    const result = await this.client.connect();

    // 如果 Worker 失败且启用自动降级，切换到同步实现
    if (!result.success && this.config.autoFallback && this.usingWorker) {
      console.warn('[SQLiteManager] Worker failed, falling back to sync implementation');
      this.client = new SyncSQLiteAdapter(this.config.dbPath);
      this.usingWorker = false;
      return this.client.connect();
    }

    return result;
  }

  async close(): Promise<void> {
    return this.client.close();
  }

  isReady(): boolean {
    return this.client.isReady();
  }

  /**
   * 获取底层实现类型（用于调试）
   */
  getImplementationType(): 'sync' | 'async' {
    return this.usingWorker ? 'async' : 'sync';
  }

  // === 代理所有业务方法 ===

  async execute(sql: string, params?: unknown[]): Promise<Result<void>> {
    return this.client.execute(sql, params);
  }

  async get(sql: string, params?: unknown[]): Promise<Result<unknown>> {
    return this.client.get(sql, params);
  }

  async all(sql: string, params?: unknown[]): Promise<Result<unknown[]>> {
    return this.client.all(sql, params);
  }

  async insertRetrospective(retro: {
    sprintId: string;
    fileName: string;
    title: string;
    date: string;
  }): Promise<Result<number>> {
    return this.client.insertRetrospective(retro);
  }

  async getRetrospective(sprintId: string): Promise<Result<unknown>> {
    return this.client.getRetrospective(sprintId);
  }

  async listRetrospectives(): Promise<Result<unknown[]>> {
    return this.client.listRetrospectives();
  }

  async insertRetroContent(content: {
    retroId: number;
    category: string;
    content: string;
    createdBy?: string;
  }): Promise<Result<number>> {
    return this.client.insertRetroContent(content);
  }

  async getRetroContentByCategory(retroId: number, category: string): Promise<Result<unknown[]>> {
    return this.client.getRetroContentByCategory(retroId, category);
  }

  async searchRetrospectives(keyword: string): Promise<Result<unknown[]>> {
    return this.client.searchRetrospectives(keyword);
  }

  async generateReport(): Promise<Result<{
    totalRetrospectives: number;
    totalSprints: number;
    totalItems: number;
    byCategory: Array<{ category: string; count: number }>;
  }>> {
    return this.client.generateReport();
  }
}

/**
 * 工厂函数 - 推荐使用
 */
export function createSQLiteManager(config?: SQLiteManagerConfig): SQLiteManager {
  return new SQLiteManager(config);
}
```

### 3.5 配置管理

在 `config/app-config.ts` 添加配置项：

```typescript
export interface AppConfig {
  // ... 现有配置
  sqlite: {
    dbPath?: string;
    useWorker: boolean;          // 新增：是否使用 Worker
    autoFallback: boolean;       // 新增：是否自动降级
    workerTimeout: number;       // 新增：Worker 超时（ms）
  };
}

export const defaultConfig: AppConfig = {
  // ... 现有默认值
  sqlite: {
    useWorker: false,            // 默认使用同步实现
    autoFallback: true,          // 默认启用自动降级
    workerTimeout: 30000,        // 30s 超时
  },
};
```

---

## 四、迁移计划

### 4.1 阶段 1: 创建新模块（不影响现有代码）

**任务**:
1. ✅ 创建 `sqlite-shared.ts`（共享工具）
2. ✅ 创建 `sqlite-sync-adapter.ts`（同步适配器）
3. ✅ 创建 `sqlite-manager.ts`（统一管理类）
4. ✅ 添加单元测试

**验收**:
- [ ] 所有测试通过
- [ ] 不影响现有代码运行

### 4.2 阶段 2: 重构现有实现（消除重复代码）

**任务**:
1. ✅ 修改 `SQLiteClient` 使用 `sqlite-shared.ts` 工具函数
2. ✅ 修改 `AsyncSQLiteClient` 使用 `sqlite-shared.ts` 工具函数
3. ✅ 更新测试

**验收**:
- [ ] 代码行数减少 30%+
- [ ] 所有测试通过
- [ ] 行为保持不变

### 4.3 阶段 3: 迁移调用方（逐步替换）

**优先级排序**:

| 优先级 | 模块 | 复杂度 | 说明 |
|-------|------|-------|------|
| P0 | CLI 命令 | 低 | 替换工厂函数即可 |
| P1 | DI 容器 | 中 | 修改依赖注入配置 |
| P2 | connection-manager | 中 | 需要测试降级逻辑 |
| P3 | master-election | 中 | 需要测试选举逻辑 |
| P4 | 其他模块 | 低 | 通过 DI 自动生效 |

**迁移示例 - CLI 命令**:

Before:
```typescript
// commands/sqlite.ts
import { createSQLiteClient } from '../core/sqlite-client.js';

const client = createSQLiteClient();
```

After:
```typescript
// commands/sqlite.ts
import { createSQLiteManager } from '../core/sqlite-manager.js';

const client = createSQLiteManager({
  useWorker: false  // CLI 命令使用同步实现
});
```

**迁移示例 - DI 容器**:

Before:
```typescript
// di/container.ts
import { createSQLiteClient } from '../core/sqlite-client.js';

container.register('sqliteClient', () => createSQLiteClient(), {
  singleton: true
});
```

After:
```typescript
// di/container.ts
import { createSQLiteManager } from '../core/sqlite-manager.js';
import { getConfigManager } from '../config/app-config.js';

container.register('sqliteClient', () => {
  const config = getConfigManager().get('sqlite');
  return createSQLiteManager(config);
}, { singleton: true });
```

### 4.4 阶段 4: 清理（可选，谨慎）

**任务**:
1. 🔶 标记 `createSQLiteClient()` 为 `@deprecated`
2. 🔶 添加迁移指南文档
3. ⚠️ （可选）删除直接调用的代码路径

**验收**:
- [ ] 所有调用方已迁移
- [ ] 文档更新完成
- [ ] 向后兼容性保持（建议保留旧 API 1-2 个版本）

---

## 五、测试策略

### 5.1 单元测试

**新增测试文件**:
```
node/tests/core/
├── sqlite-shared.test.ts         # 共享工具测试
├── sqlite-sync-adapter.test.ts   # 适配器测试
└── sqlite-manager.test.ts        # 管理类测试
```

**测试覆盖**:
1. ✅ `SyncSQLiteAdapter` 所有方法正确包装
2. ✅ `SQLiteManager` 同步/异步切换逻辑
3. ✅ 自动降级功能（Worker 失败 → Sync）
4. ✅ 共享工具函数（escapeLikePattern、initializeTables）
5. ✅ 配置加载和默认值

### 5.2 集成测试

**测试场景**:
1. ✅ 同步模式 - 完整 CRUD 流程
2. ✅ 异步模式 - 完整 CRUD 流程
3. ✅ 自动降级 - 模拟 Worker 失败
4. ✅ 并发操作 - 验证线程安全
5. ✅ 性能对比 - Sync vs Async

### 5.3 性能基准测试

**对比指标**:
| 操作 | SQLiteClient (同步) | AsyncSQLiteClient (Worker) | SQLiteManager (Sync) | SQLiteManager (Async) |
|------|---------------------|---------------------------|---------------------|----------------------|
| connect() | < 10ms | < 50ms | < 12ms | < 55ms |
| insert() | < 5ms | < 15ms | < 6ms | < 16ms |
| query() | < 3ms | < 12ms | < 4ms | < 13ms |
| 1000 次插入 | < 500ms | < 1000ms | < 550ms | < 1050ms |

**验收标准**:
- ✅ 适配器性能损耗 < 10%
- ✅ 自动降级耗时 < 100ms

---

## 六、风险评估

### 6.1 兼容性风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 同步→异步包装导致行为差异 | 低 | 高 | 完整的单元测试 + 对比测试 |
| Worker 失败导致服务不可用 | 中 | 高 | 自动降级机制 + 监控告警 |
| 配置错误导致性能下降 | 中 | 中 | 默认使用同步实现 |

### 6.2 性能风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 多一层包装导致性能下降 | 低 | 低 | 性能基准测试验证 |
| Worker 通信开销过大 | 中 | 中 | 仅在高并发场景启用 Worker |

### 6.3 迁移风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 调用方遗漏导致运行时错误 | 低 | 高 | Grep 全局搜索 + 类型检查 |
| 配置不一致导致行为不同 | 中 | 中 | 中心化配置管理 |

---

## 七、验收标准

### 7.1 功能验收

- [ ] `SQLiteManager` 提供统一接口
- [ ] 支持同步/异步自动选择
- [ ] 自动降级功能正常
- [ ] 所有业务方法正常工作

### 7.2 代码质量

- [ ] 代码行数减少 30%+
- [ ] 测试覆盖率 > 90%
- [ ] 无 ESLint 警告
- [ ] 所有类型定义完整

### 7.3 性能验收

- [ ] 适配器性能损耗 < 10%
- [ ] 自动降级耗时 < 100ms
- [ ] 内存占用无明显增加

### 7.4 文档验收

- [ ] API 文档更新
- [ ] 迁移指南完成
- [ ] 架构图更新

---

## 八、时间估算

| 阶段 | 任务 | 预估时间 |
|------|------|---------|
| 阶段 1 | 创建新模块 + 测试 | 1.5 小时 |
| 阶段 2 | 重构现有实现 | 1 小时 |
| 阶段 3 | 迁移调用方 | 1 小时 |
| 阶段 4 | 文档 + 清理 | 0.5 小时 |
| **总计** | | **4 小时** |

---

## 九、后续优化建议

### 9.1 短期优化（v2.1.1）

1. **性能监控** - 添加 SQLite 操作耗时统计
2. **连接池** - 支持多个 SQLite 连接复用
3. **事务支持** - 统一事务管理接口

### 9.2 长期优化（v2.2.0）

1. **读写分离** - 主从复制支持
2. **数据迁移工具** - 自动 Schema 升级
3. **备份恢复** - 自动备份和灾难恢复

---

## 十、参考资料

- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [EKET 架构文档](../architecture/)
- [TASK-003 Jira Ticket](../../jira/tickets/TASK-003.md)

---

**文档版本**: v1.0.0
**最后更新**: 2026-04-07
**作者**: Slaver 3 (Backend)
