# TASK-008: 集成测试环境改进

**负责人**: Slaver D (DevOps 专家)
**优先级**: P2
**预估工时**: 6 小时
**状态**: IN_PROGRESS
**分支**: `feature/TASK-008-test-environment`

---

## 任务状态 (Master - 2026-04-08)

**背景**: 当前测试依赖真实 Redis/SQLite，需要 mock/stub 支持提升稳定性

---

## 目标

### 1. Redis Mock 集成
**目标**: 创建功能完整的 Redis Mock

**要求**:
- [ ] 支持 `subscribe`/`publish` (Pub/Sub)
- [ ] 支持 `get`/`set`/`del` (键值操作)
- [ ] 支持 `hget`/`hset`/`hgetall` (哈希操作)
- [ ] 支持 `lpush`/`rpop`/`llen` (列表操作)
- [ ] 支持 `incr`/`decr` (计数操作)
- [ ] TTL/过期支持 (可选)

**实现**:
```typescript
// tests/helpers/redis-mock.ts
import { RedisMock } from 'ioredis-mock';

export function createRedisMock() {
  return new RedisMock({
    data: {}, // 初始数据
  });
}
```

### 2. SQLite 内存数据库
**目标**: 使用 SQLite 内存模式

**要求**:
- [ ] 内存数据库配置 (`:memory:`)
- [ ] 每个测试套件独立数据库
- [ ] beforeEach 重置数据
- [ ] afterEach 清理资源

**实现**:
```typescript
// tests/helpers/sqlite-test.ts
export function createTestSQLite() {
  return createSQLiteManager({
    dbPath: ':memory:',
    useWorker: false,
  });
}
```

### 3. Docker Compose 测试环境
**目标**: 提供可选的真实环境测试

**要求**:
- [ ] `docker-compose.test.yml` 配置
- [ ] Redis 容器
- [ ] 可选 SQLite 卷
- [ ] 一键启动/停止脚本

---

## 执行清单

### Phase 1: Redis Mock 完善 (2h)
- [ ] 检查现有 `tests/helpers/redis-mock.ts`
- [ ] 添加缺失的 API 支持
- [ ] 编写 Redis Mock 单元测试
- [ ] 文档化使用指南

### Phase 2: SQLite 内存数据库 (2h)
- [ ] 创建 `tests/helpers/sqlite-test.ts`
- [ ] 配置内存数据库
- [ ] 添加测试隔离机制
- [ ] 编写使用示例

### Phase 3: Docker Compose 环境 (1h)
- [ ] 更新 `docker-compose.test.yml`
- [ ] 添加启动脚本
- [ ] 文档化配置

### Phase 4: 测试更新 (1h)
- [ ] 更新测试导入 Redis Mock
- [ ] 更新测试使用 SQLite 内存
- [ ] 验证测试可无外部依赖运行

---

## 验收标准
- [ ] Redis Mock 功能完整
- [ ] SQLite 使用内存数据库
- [ ] 测试可并行执行
- [ ] 无外部依赖运行

---

## 参考文档
- `docs/test-reports/TASK-007-test-fix-plan.md`
- `tests/helpers/redis-mock.ts` (现有)

---

**创建日期**: 2026-04-08
**Master 分派**: 2026-04-08
