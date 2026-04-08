# TASK-003: Layer 2 架构整理 - SQLite 双实现合并

**类型**: Refactor
**优先级**: P1
**状态**: in_progress
**分配给**: Slaver 3 (Backend)
**预估工时**: 7 小时（已调整）
**开始时间**: 2026-04-07

---

## 背景

目前有两个 SQLite 实现：
- `sqlite-client.ts` (同步)
- `sqlite-async-client.ts` (异步 Worker)

这导致代码重复和维护成本增加。

## 目标

统一为一个接口，内部根据配置选择同步或异步实现。

## 技术方案

### 架构设计

```typescript
// sqlite-manager.ts (新增)
export class SQLiteManager {
  private client: SQLiteClient | SQLiteAsyncClient;

  constructor(config: SQLiteConfig) {
    if (config.useWorker) {
      this.client = new SQLiteAsyncClient(config);
    } else {
      this.client = new SQLiteClient(config);
    }
  }

  // 统一接口
  async query<T>(sql: string): Promise<Result<T[]>> {
    return this.client.query<T>(sql);
  }
}
```

### 接口统一

```typescript
interface ISQLiteClient {
  query<T>(sql: string): Promise<Result<T[]>>;
  execute(sql: string): Promise<Result<void>>;
  close(): Promise<Result<void>>;
}
```

### 迁移计划

1. 创建 `sqlite-manager.ts`
2. 两个实现都实现 `ISQLiteClient` 接口
3. 逐步迁移调用方到 `SQLiteManager`
4. 保持向后兼容

## 验收标准

- [ ] 统一的 `SQLiteManager` 接口
- [ ] 同步/异步自动选择
- [ ] 所有调用方迁移完成
- [ ] 测试全部通过
- [ ] 性能无退化

## 设计文档

详细设计见：
- 📄 [架构设计文档](../../docs/architecture/TASK-003-sqlite-manager-design.md)
- 📄 [迁移计划](../../docs/architecture/TASK-003-migration-plan.md)

**关键决策**:
1. ✅ 采用**适配器模式**，最小化改动
2. ✅ 创建 `sqlite-shared.ts` 消除重复代码
3. ✅ 创建 `SyncSQLiteAdapter` 包装同步 API 为异步接口
4. ✅ 创建 `SQLiteManager` 统一管理类，支持自动降级
5. ✅ 分 4 批次迁移调用方（17 个文件）

**新增文件**:
- `node/src/core/sqlite-shared.ts` - 共享工具函数
- `node/src/core/sqlite-sync-adapter.ts` - 同步适配器
- `node/src/core/sqlite-manager.ts` - 统一管理类

**修改文件**:
- `node/src/core/sqlite-client.ts` - 使用 shared 工具
- `node/src/core/sqlite-async-client.ts` - 使用 shared 工具
- 17 个调用方文件（见迁移计划）

## 进度跟踪

### 阶段 1: 设计阶段 ✅ (已完成)

- [x] 分析现有实现
- [x] 识别所有调用方 (17 个文件)
- [x] 设计统一接口架构
- [x] 制定迁移计划
- [x] 创建架构设计文档
- [x] 创建迁移计划文档
- [x] 更新 Jira ticket

**成果**:
- 📄 架构设计文档 (6000+ 字)
- 📄 迁移计划文档 (4000+ 字)
- 📊 识别 17 个需迁移文件
- 📝 调整预估工时 4h → 7h

### 阶段 2: 实现阶段 (等待依赖)

⚠️ **阻塞原因**: 等待 TASK-001, TASK-002 完成

- [ ] 创建 `sqlite-shared.ts`
- [ ] 创建 `sqlite-sync-adapter.ts`
- [ ] 创建 `sqlite-manager.ts`
- [ ] 编写单元测试

### 阶段 3: 重构阶段 (待定)

- [ ] 重构 `sqlite-client.ts` 使用 shared
- [ ] 重构 `sqlite-async-client.ts` 使用 shared
- [ ] 更新测试

### 阶段 4: 迁移阶段 (待定)

- [ ] Batch 1: CLI 命令
- [ ] Batch 2: 核心模块 (P1)
- [ ] Batch 3: 业务模块 (P2)
- [ ] Batch 4: 其他模块 (P3)

### 阶段 5: 验证阶段 (待定)

- [ ] 所有测试通过
- [ ] 性能基准测试
- [ ] 文档更新

## 相关文件

- `node/src/core/sqlite-client.ts`
- `node/src/core/sqlite-async-client.ts`
- `node/src/core/sqlite-manager.ts` (新增)

## 依赖

- 依赖 TASK-001, TASK-002 完成（确保测试环境稳定）

---

**角色要求**: Backend
**技能要求**: TypeScript, SQLite, Worker Threads
**估算**: 4 小时
