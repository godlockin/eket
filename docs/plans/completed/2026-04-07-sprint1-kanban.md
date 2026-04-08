# EKET Framework 任务执行看板

**日期**: 2026-04-07
**当前版本**: v2.1.0
**目标**: v2.2.0 (生产就绪)

---

## 🎯 Sprint 1: 稳定性优先 (Week 1-2)

### 📊 进度总览

```
Layer 1: Bug修复       ████████░░░░░░░░░░░░  0/15 (0%)
Layer 2: 架构整理      ░░░░░░░░░░░░░░░░░░░░  0/13 (0%)
```

**总进度**: 0/28 任务 (0%)

---

## 🔴 Layer 1: Bug 修复 (P0 - 立即执行)

### 域 A: 核心模块 (7 个 Bug)

#### 🐛 BUG-001: SQLite Worker dbPath 参数失效
**文件**: `node/src/core/sqlite-async-client.ts`
**优先级**: P0
**工作量**: 2h
**状态**: ⏳ 待开始

**问题描述**:
```typescript
// 当前: Worker 忽略构造函数参数，直接读环境变量
constructor(dbPath?: string) {
  this.worker = new Worker(/* ... */);
  // ❌ dbPath 未传递给 Worker
}
```

**修复方案**:
```typescript
// 修复: 通过 postMessage 传递配置
constructor(dbPath?: string) {
  this.worker = new Worker(/* ... */);
  this.worker.postMessage({
    type: 'init',
    config: { dbPath: dbPath || process.env.EKET_SQLITE_PATH }
  });
}
```

**验收标准**:
- [ ] Worker 正确接收 dbPath 参数
- [ ] 添加单元测试验证参数传递
- [ ] 更新 JSDoc 文档

---

#### 🐛 BUG-002: master-context Redis 连接池缺失
**文件**: `node/src/core/master-context.ts`
**优先级**: P0
**工作量**: 3h
**状态**: ⏳ 待开始

**问题描述**:
```typescript
// 当前: 每次操作创建新连接
async getTaskStatus(taskId: string) {
  const redis = createRedisClient(); // ❌ 新连接
  const result = await redis.get(`task:${taskId}`);
  await redis.quit(); // ❌ 立即关闭
  return result;
}
```

**修复方案**:
```typescript
// 修复: 使用单例连接池
class MasterContext {
  private redis: RedisClient;

  constructor() {
    this.redis = getGlobalRedisClient(); // ✅ 复用连接
  }

  async getTaskStatus(taskId: string) {
    return await this.redis.get(`task:${taskId}`);
  }
}
```

**验收标准**:
- [ ] 使用全局 Redis 连接池
- [ ] 添加连接泄漏检测测试
- [ ] 性能基准测试 (对比前后)

---

#### 🐛 BUG-003: OptimizedFileQueue 校验和逻辑错误
**文件**: `node/src/core/optimized-file-queue.ts`
**优先级**: P0
**工作量**: 4h
**状态**: ⏳ 待开始

**问题描述**:
```typescript
// 当前: 校验和字段导致对象不匹配
const obj1 = { data: "test" };
const obj2 = { data: "test", _write_checksum: "abc123" };
// ❌ obj1 !== obj2 即使数据相同
```

**修复方案**:
```typescript
// 修复: 校验和作为元数据，不影响比较
function writeToQueue(data: any) {
  const checksum = calculateChecksum(data);
  const envelope = {
    data: data,
    meta: { checksum, timestamp: Date.now() }
  };
  fs.writeFileSync(file, JSON.stringify(envelope));
}

function readFromQueue(file: string) {
  const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
  // ✅ 只返回 data，校验 meta.checksum
  return envelope.data;
}
```

**验收标准**:
- [ ] 校验和逻辑修复
- [ ] 添加数据完整性测试
- [ ] 迁移脚本处理旧格式

---

#### 🐛 BUG-004: ConnectionLevel 类型重复定义
**文件**: `node/src/types/index.ts` + 相关模块
**优先级**: P0
**工作量**: 2h
**状态**: ⏳ 待开始

**问题描述**:
```typescript
// 三处重复定义
// types/index.ts
type ConnectionLevel = 1 | 2 | 3 | 4;

// core/connection-manager.ts
type ConnectionLevel = 'remote_redis' | 'local_redis' | 'sqlite' | 'file';

// api/websocket-message-queue.ts
type ConnectionLevel = 'ws' | 'http' | 'file';
```

**修复方案**:
```typescript
// types/index.ts - 统一定义
export enum ConnectionLevel {
  REMOTE_REDIS = 1,
  LOCAL_REDIS = 2,
  SQLITE = 3,
  FILE = 4
}

export enum WebSocketLevel {
  WS = 1,
  HTTP = 2,
  FILE = 3
}

// 所有模块使用枚举
import { ConnectionLevel } from '../types/index.js';
```

**验收标准**:
- [ ] 删除重复定义
- [ ] 统一使用枚举
- [ ] 全局搜索确认无遗漏

---

#### 🐛 BUG-005: 未注册的错误码字符串
**文件**: `node/src/core/master-context.ts`
**优先级**: P0
**工作量**: 1h
**状态**: ⏳ 待开始

**问题描述**:
```typescript
// 当前: 使用字符串 literal
return createResult(false, {
  code: 'MASTER_NOT_FOUND', // ❌ 未在 EketErrorCode 注册
  message: 'Master not found'
});
```

**修复方案**:
```typescript
// 1. 添加到 EketErrorCode 枚举
export enum EketErrorCode {
  // ...
  MASTER_NOT_FOUND = 'MASTER_NOT_FOUND',
  MASTER_ELECTION_FAILED = 'MASTER_ELECTION_FAILED',
  // ... 其他 7 个错误码
}

// 2. 使用枚举
return createResult(false, {
  code: EketErrorCode.MASTER_NOT_FOUND,
  message: 'Master not found'
});
```

**验收标准**:
- [ ] 7 个错误码全部注册到枚举
- [ ] 使用 TypeScript strict 检查
- [ ] 添加错误码文档

---

#### 🐛 BUG-006: hashFunction 拼写错误
**文件**: `node/src/types/index.ts`
**优先级**: P0
**工作量**: 0.5h
**状态**: ⏳ 待开始

**问题描述**:
```typescript
export type HashFunction = 'md5' | 'sha256' | 'murmer3'; // ❌ 拼写错误
```

**修复方案**:
```typescript
export type HashFunction = 'md5' | 'sha256' | 'murmur3'; // ✅ 正确拼写
```

**验收标准**:
- [ ] 修复拼写
- [ ] 搜索所有使用处并更新
- [ ] 添加测试覆盖所有算法

---

#### 🐛 BUG-007: master-election 类型重复声明
**文件**: `node/src/core/master-election.ts`
**优先级**: P0
**工作量**: 1h
**状态**: ⏳ 待开始

**问题描述**:
```typescript
// 文件内部重复声明，应从 types/index.ts 导入
type ElectionLevel = 'redis' | 'sqlite' | 'file';
interface MasterElectionConfig { /* ... */ }
interface MasterElectionResult { /* ... */ }
```

**修复方案**:
```typescript
// 移动到 types/index.ts
import {
  ElectionLevel,
  MasterElectionConfig,
  MasterElectionResult
} from '../types/index.js';
```

**验收标准**:
- [ ] 删除本地声明
- [ ] 从 types 导入
- [ ] 确保类型一致

---

### 域 B: 脚本与周边 (4 个 Bug)

#### 🐛 BUG-008: eket-start.sh 脚本名称错误
**文件**: `scripts/eket-start.sh`
**优先级**: P1
**工作量**: 0.5h
**状态**: ⏳ 待开始

**问题描述**:
```bash
# 引用错误的脚本名
source ./heartbeatmonitor.sh  # ❌ 实际文件是 heartbeat-monitor.sh
```

**修复方案**:
```bash
source ./heartbeat-monitor.sh  # ✅ 正确文件名
```

---

#### 🐛 BUG-009: start.sh 僵尸脚本
**文件**: `scripts/start.sh`
**优先级**: P1
**工作量**: 0.5h
**状态**: ⏳ 待开始

**问题描述**:
- 脚本尝试启动不存在的 Python 模块
- 是迁移遗留的僵尸脚本

**修复方案**:
- 删除 `scripts/start.sh`
- 更新文档移除引用

---

#### 🐛 BUG-010: web/app.js i18n 路径 404
**文件**: `web/app.js`
**优先级**: P1
**工作量**: 1h
**状态**: ⏳ 待开始

**问题描述**:
```javascript
// 请求不存在的路径
fetch('/locales/en.json') // ❌ 404
```

**修复方案**:
```javascript
// 修正路径或创建文件
fetch('/i18n/locales/en.json') // ✅ 正确路径
```

---

#### 🐛 BUG-011: init-three-repos.sh 错误提示过时
**文件**: `scripts/init-three-repos.sh`
**优先级**: P1
**工作量**: 0.5h
**状态**: ⏳ 待开始

**问题描述**:
- 错误提示引用过时的命令格式

**修复方案**:
- 更新错误提示文本
- 与最新文档保持一致

---

### 域 C: 模板 (4 个 Bug)

#### 🐛 BUG-012: IDENTITY.md Shell 表达式未执行
**文件**: `template/.eket/IDENTITY.md`
**优先级**: P1
**工作量**: 0.5h
**状态**: ⏳ 待开始

**问题描述**:
```markdown
创建时间: $(date)      # ❌ 未执行
角色: ${ROLE}           # ❌ 未替换
```

**修复方案**:
```bash
# init 脚本中执行替换
sed -i "s/\$(date)/$(date)/g" .eket/IDENTITY.md
sed -i "s/\${ROLE}/$ROLE/g" .eket/IDENTITY.md
```

---

#### 🐛 BUG-013: eket-slaver-auto.sh 状态解析不匹配
**文件**: `template/.claude/commands/eket-slaver-auto.sh`
**优先级**: P1
**工作量**: 2h
**状态**: ⏳ 待开始

**问题描述**:
- 状态解析正则与 ticket 模板格式不匹配
- 优先级用 High/Low 但模板用 P0-P3

**修复方案**:
- 统一优先级格式为 P0-P3
- 更新正则匹配逻辑

---

#### 🐛 BUG-014: eket-start.sh -r 参数错误
**文件**: `template/.claude/commands/eket-start.sh`
**优先级**: P1
**工作量**: 0.5h
**状态**: ⏳ 待开始

**问题描述**:
```bash
while getopts "r:" opt; do
  case $opt in
    r) ROLE=$2 ;;  # ❌ 应该用 $OPTARG
  esac
done
```

**修复方案**:
```bash
r) ROLE=$OPTARG ;;  # ✅ 正确用法
```

---

#### 🐛 BUG-015: eket-init.sh 路径失效
**文件**: `template/.claude/commands/eket-init.sh`
**优先级**: P1
**工作量**: 1h
**状态**: ⏳ 待开始

**问题描述**:
```bash
# 引用模板目录的相对路径，复制到用户项目后失效
TEMPLATE_DIR="$(dirname "$0")/../../template/"
```

**修复方案**:
```bash
# 使用环境变量或配置文件
EKET_TEMPLATE_DIR="${EKET_TEMPLATE_DIR:-/usr/local/share/eket/template}"
```

---

## 📈 Layer 1 进度跟踪

| 域 | 已完成 | 进行中 | 待开始 | 总计 |
|----|--------|--------|--------|------|
| 域 A (核心) | 0 | 0 | 7 | 7 |
| 域 B (周边) | 0 | 0 | 4 | 4 |
| 域 C (模板) | 0 | 0 | 4 | 4 |
| **总计** | **0** | **0** | **15** | **15** |

---

## 🚀 并行执行计划

### Round 1: Bug 修复 (并行 3 个 Agent)

**Agent 1 - 核心模块组**:
- BUG-001: SQLite Worker (2h)
- BUG-002: Redis 连接池 (3h)
- BUG-003: 校验和逻辑 (4h)
- **小计**: 9h

**Agent 2 - 类型系统组**:
- BUG-004: ConnectionLevel (2h)
- BUG-005: 错误码注册 (1h)
- BUG-006: 拼写错误 (0.5h)
- BUG-007: 类型重复 (1h)
- **小计**: 4.5h

**Agent 3 - 脚本模板组**:
- BUG-008 ~ BUG-015 (所有脚本和模板 Bug)
- **小计**: 6h

**并行执行时间**: max(9h, 4.5h, 6h) = **9 小时**
**顺序执行时间**: 20 小时
**提速比**: 2.2x

---

## ✅ 验收清单 (Layer 1)

### 代码质量
- [ ] `npm run build` 零错误
- [ ] `npm test` 全部通过
- [ ] ESLint 零警告
- [ ] TypeScript strict 模式通过

### 测试覆盖
- [ ] 每个 Bug 修复添加测试用例
- [ ] 回归测试通过
- [ ] 代码覆盖率 ≥ 60%

### 文档更新
- [ ] CHANGELOG.md 更新
- [ ] 错误码文档更新
- [ ] API 文档更新（如有变更）

### 版本发布
- [ ] 版本号升级到 v2.1.1
- [ ] Git tag 创建
- [ ] Release notes 发布

---

## 📋 下一步 (Layer 2 预览)

Layer 1 完成后，立即开始 Layer 2:

### 架构整理重点
1. **代码去重** (ARCH-001 ~ ARCH-004)
2. **HTTP 增强** (HTTP-001 ~ HTTP-005)
3. **模板统一** (TMPL-001 ~ TMPL-004)

### 预计时间
- 顺序执行: 33h
- 并行执行: ~14h (3 个 Agent)

---

**看板更新时间**: 2026-04-07
**下次更新**: Layer 1 完成后
