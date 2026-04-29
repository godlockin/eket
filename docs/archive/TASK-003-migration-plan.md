# TASK-003: SQLite 双实现合并 - 调用方分析报告

**日期**: 2026-04-07
**作者**: Slaver 3 (Backend)
**目的**: 识别所有需要迁移的调用方，制定详细迁移计划

---

## 一、调用方列表（17 个文件）

### 1.1 核心模块（7 个）

| 文件 | 当前使用 | 复杂度 | 优先级 | 说明 |
|------|---------|--------|-------|------|
| `core/connection-manager.ts` | SQLiteClient | ⭐⭐⭐ | P1 | 四级降级连接，关键路径 |
| `core/master-election.ts` | SQLiteClient | ⭐⭐⭐ | P1 | 三级选举，关键路径 |
| `core/sqlite-client.ts` | - | ⭐ | P0 | 源文件，需重构使用 shared |
| `core/sqlite-async-client.ts` | - | ⭐ | P0 | 源文件，需重构使用 shared |
| `core/knowledge-base.ts` | SQLiteClient | ⭐⭐ | P2 | 知识库存储 |
| `core/history-tracker.ts` | SQLiteClient | ⭐⭐ | P2 | 历史记录 |
| `core/context-snapshot.ts` | SQLiteClient | ⭐⭐ | P2 | 上下文快照 |

### 1.2 API 服务（6 个）

| 文件 | 当前使用 | 复杂度 | 优先级 | 说明 |
|------|---------|--------|-------|------|
| `api/eket-server.ts` | SQLiteClient | ⭐⭐ | P2 | OpenCLAW Gateway |
| `api/web-server.ts` | SQLiteClient | ⭐⭐ | P2 | Web Dashboard |
| `api/data-access.ts` | SQLiteClient | ⭐⭐ | P2 | 数据访问层 |
| `api/data-deletion.ts` | SQLiteClient | ⭐ | P3 | 数据删除 |
| `api/audit-logger.ts` | SQLiteClient | ⭐ | P3 | 审计日志 |
| `api/middleware/api-key-storage.ts` | SQLiteClient | ⭐ | P3 | API Key 存储 |

### 1.3 其他模块（4 个）

| 文件 | 当前使用 | 复杂度 | 优先级 | 说明 |
|------|---------|--------|-------|------|
| `hooks/http-hook-server.ts` | SQLiteClient | ⭐ | P3 | HTTP Hook 服务 |
| `health-check.ts` | SQLiteClient | ⭐ | P3 | 健康检查 |
| `index.ts` | - | ⭐ | P0 | CLI 命令注册 |
| `types/index.ts` | - | ⭐ | P0 | 类型定义（已有接口） |

---

## 二、详细调用分析

### 2.1 P1 优先级文件

#### `core/connection-manager.ts`

**当前使用**:
```typescript
import { SQLiteClient } from './sqlite-client.js';

private sqliteClient: SQLiteClient | null = null;

private async tryConnectSqlite(): Promise<Result<void>> {
  this.sqliteClient = new SQLiteClient(this.config.sqlitePath);
  return this.sqliteClient.connect();
}
```

**迁移方案**:
```typescript
import { SQLiteManager } from './sqlite-manager.js';

private sqliteClient: SQLiteManager | null = null;

private async tryConnectSqlite(): Promise<Result<void>> {
  this.sqliteClient = new SQLiteManager({
    dbPath: this.config.sqlitePath,
    useWorker: false  // 降级场景使用同步实现
  });
  return this.sqliteClient.connect();
}
```

**风险评估**:
- ✅ 低风险 - 只需替换构造函数
- ⚠️ 需测试降级逻辑

---

#### `core/master-election.ts`

**当前使用**:
```typescript
import { SQLiteClient } from './sqlite-client.js';

private sqliteClient: SQLiteClient | null = null;

private async electWithSqlite(): Promise<Result<MasterElectionResult>> {
  this.sqliteClient = new SQLiteClient(this.config.sqlitePath);
  const connectResult = this.sqliteClient.connect();
  // ... 选举逻辑
}
```

**迁移方案**:
```typescript
import { SQLiteManager } from './sqlite-manager.js';

private sqliteClient: SQLiteManager | null = null;

private async electWithSqlite(): Promise<Result<MasterElectionResult>> {
  this.sqliteClient = new SQLiteManager({
    dbPath: this.config.sqlitePath,
    useWorker: false  // 选举场景需要同步操作
  });
  const connectResult = await this.sqliteClient.connect();
  // ... 选举逻辑
}
```

**风险评估**:
- ⚠️ 中风险 - 选举逻辑关键，需要同步行为
- ✅ 已有 `await` 处理异步

---

### 2.2 P2 优先级文件

#### `core/knowledge-base.ts`

**当前使用**:
```typescript
import { createSQLiteClient } from './sqlite-client.js';

export class KnowledgeBase {
  private sqliteClient: SQLiteClient;

  constructor(config: KnowledgeBaseConfig) {
    this.sqliteClient = createSQLiteClient(config.dbPath);
  }
}
```

**迁移方案**:
```typescript
import { createSQLiteManager } from './sqlite-manager.js';

export class KnowledgeBase {
  private sqliteClient: SQLiteManager;

  constructor(config: KnowledgeBaseConfig) {
    this.sqliteClient = createSQLiteManager({
      dbPath: config.dbPath,
      useWorker: config.useWorker ?? false
    });
  }
}
```

**风险评估**:
- ✅ 低风险 - 独立模块，影响范围小

---

#### `api/eket-server.ts`, `api/web-server.ts`

**共同模式**:
```typescript
import { createSQLiteClient } from '../core/sqlite-client.js';

// 在路由处理中
const sqliteClient = createSQLiteClient();
await sqliteClient.connect();
```

**迁移方案**:
```typescript
import { createSQLiteManager } from '../core/sqlite-manager.js';

// 在路由处理中
const sqliteClient = createSQLiteManager({
  useWorker: false  // Web API 使用同步实现
});
await sqliteClient.connect();
```

**风险评估**:
- ✅ 低风险 - 已经是异步调用
- ⚠️ 需测试 API 响应时间

---

### 2.3 P3 优先级文件

大部分为简单调用，直接替换即可：

```typescript
// Before
import { createSQLiteClient } from '../core/sqlite-client.js';
const client = createSQLiteClient();

// After
import { createSQLiteManager } from '../core/sqlite-manager.js';
const client = createSQLiteManager();
```

---

## 三、迁移步骤

### Step 1: 准备阶段（已完成）

- [x] 分析所有调用方
- [x] 评估风险和复杂度
- [x] 制定优先级

### Step 2: 创建新模块

**任务清单**:
- [ ] 创建 `core/sqlite-shared.ts`
- [ ] 创建 `core/sqlite-sync-adapter.ts`
- [ ] 创建 `core/sqlite-manager.ts`
- [ ] 编写单元测试

**验收标准**:
- [ ] 所有新模块测试通过
- [ ] 不影响现有代码

### Step 3: 重构现有实现

**任务清单**:
- [ ] 修改 `core/sqlite-client.ts` 使用 `sqlite-shared.ts`
- [ ] 修改 `core/sqlite-async-client.ts` 使用 `sqlite-shared.ts`
- [ ] 更新相关测试

**验收标准**:
- [ ] 代码行数减少 30%+
- [ ] 所有测试通过
- [ ] 行为保持不变

### Step 4: 迁移调用方（分批进行）

#### Batch 1: CLI 命令 (index.ts)

**目标文件**: `index.ts`

**修改内容**:
- 替换所有 `createSQLiteClient()` 为 `createSQLiteManager()`
- 更新类型声明

**测试**:
```bash
npm run build
node dist/index.js sqlite:check
node dist/index.js sqlite:list-retros
```

---

#### Batch 2: 核心模块 (P1)

**目标文件**:
1. `core/connection-manager.ts`
2. `core/master-election.ts`

**测试**:
```bash
npm test -- --testPathPattern=connection-manager
npm test -- --testPathPattern=master-election
```

---

#### Batch 3: 业务模块 (P2)

**目标文件**:
1. `core/knowledge-base.ts`
2. `core/history-tracker.ts`
3. `core/context-snapshot.ts`
4. `api/eket-server.ts`
5. `api/web-server.ts`
6. `api/data-access.ts`

**测试**:
```bash
npm test -- --testPathPattern=knowledge-base
npm test -- --testPathPattern=api
```

---

#### Batch 4: 其他模块 (P3)

**目标文件**:
1. `api/data-deletion.ts`
2. `api/audit-logger.ts`
3. `api/middleware/api-key-storage.ts`
4. `hooks/http-hook-server.ts`
5. `health-check.ts`

**测试**:
```bash
npm test
```

---

### Step 5: 更新配置和文档

**任务清单**:
- [ ] 更新 `config/app-config.ts`
- [ ] 更新 `CLAUDE.md`
- [ ] 创建迁移指南
- [ ] 更新 API 文档

---

## 四、回滚计划

如果迁移过程中发现问题，可以快速回滚：

### 回滚策略

1. **保留旧 API** - 在 1-2 个版本内保持 `createSQLiteClient()` 可用
2. **Git 分支隔离** - 每个批次在独立分支开发
3. **渐进式迁移** - 按优先级逐步迁移，不全量替换

### 回滚命令

```bash
# 回滚到迁移前状态
git checkout feature/TASK-003-sqlite-manager -- node/src/core/
git checkout feature/TASK-003-sqlite-manager -- node/src/api/

# 或回滚整个分支
git reset --hard origin/testing
```

---

## 五、验证清单

### 5.1 功能验证

每个批次迁移后需验证：

- [ ] 单元测试全部通过
- [ ] 集成测试全部通过
- [ ] 手动运行 CLI 命令验证
- [ ] 启动 Web Dashboard 验证
- [ ] 启动 OpenCLAW Gateway 验证

### 5.2 性能验证

- [ ] SQLite 操作耗时无明显增加
- [ ] 内存占用无明显增加
- [ ] API 响应时间无退化

### 5.3 兼容性验证

- [ ] 现有配置文件兼容
- [ ] 现有数据库文件兼容
- [ ] 跨平台兼容性（Linux/macOS/Windows）

---

## 六、风险矩阵

| 文件 | 风险等级 | 影响范围 | 缓解措施 |
|------|---------|---------|---------|
| connection-manager.ts | 🔴 高 | 全局 | 完整测试 + 自动降级 |
| master-election.ts | 🔴 高 | 全局 | 完整测试 + 同步模式 |
| knowledge-base.ts | 🟡 中 | 局部 | 单元测试 |
| api/*.ts | 🟡 中 | 局部 | API 测试 |
| 其他 | 🟢 低 | 局部 | 常规测试 |

---

## 七、时间估算（详细）

| 任务 | 预估时间 | 依赖 |
|------|---------|------|
| 创建 sqlite-shared.ts | 0.5h | - |
| 创建 sqlite-sync-adapter.ts | 0.5h | sqlite-shared.ts |
| 创建 sqlite-manager.ts | 0.5h | sqlite-sync-adapter.ts |
| 编写测试 | 1h | 以上全部 |
| 重构现有实现 | 1h | sqlite-shared.ts |
| 迁移 Batch 1 (CLI) | 0.5h | sqlite-manager.ts |
| 迁移 Batch 2 (核心) | 1h | Batch 1 |
| 迁移 Batch 3 (业务) | 1h | Batch 2 |
| 迁移 Batch 4 (其他) | 0.5h | Batch 3 |
| 文档更新 | 0.5h | 以上全部 |
| **总计** | **7h** | |

**注**: 原计划 4h，考虑测试和验证后调整为 7h

---

## 八、依赖关系图

```
┌─────────────────────────────────────────────────────────┐
│                    调用方依赖图                          │
└─────────────────────────────────────────────────────────┘

sqlite-shared.ts
    ├─→ sqlite-client.ts (重构)
    └─→ sqlite-async-client.ts (重构)

sqlite-sync-adapter.ts (依赖 sqlite-client.ts)
    │
    └─→ sqlite-manager.ts
            │
            ├─→ index.ts (CLI)
            ├─→ connection-manager.ts
            ├─→ master-election.ts
            ├─→ knowledge-base.ts
            ├─→ history-tracker.ts
            ├─→ context-snapshot.ts
            ├─→ api/*.ts
            ├─→ hooks/http-hook-server.ts
            └─→ health-check.ts
```

---

## 九、后续跟踪

### 9.1 监控指标

迁移后需持续监控：

1. **错误率** - SQLite 操作失败率
2. **性能** - P95 / P99 延迟
3. **降级次数** - Worker → Sync 降级频率

### 9.2 反馈收集

- [ ] 开发者反馈（API 易用性）
- [ ] 生产环境监控数据
- [ ] 性能基准测试结果

---

**文档版本**: v1.0.0
**最后更新**: 2026-04-07
**作者**: Slaver 3 (Backend)
