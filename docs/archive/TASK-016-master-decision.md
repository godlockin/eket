# TASK-016 Master 决策和授权

**Master**: Claude Opus 4.6
**决策时间**: 2026-04-08
**针对**: Slaver A - SQLite Manager 迁移任务

---

## ✅ Master 决策

### 决策 1: getDB() 处理方式

**Master 批准**: **选项 A - 允许同步模式 + 保留 getDB()**

**理由**:
1. ✅ **风险最低**: Worker 模式尚未生产验证，强制使用可能引入新问题
2. ✅ **快速交付**: 避免大规模重构，专注于迁移
3. ✅ **渐进式**: 未来可以平滑迁移到选项 C（混合模式）
4. ✅ **代码稳定**: 保持现有逻辑不变，降低回归风险

**实施指导**:
```typescript
// 对于使用 getDB() 的文件
const manager = await createSQLiteManager({
  useWorker: false  // 明确使用同步模式
});

// 可以继续使用 getDB() 访问底层 Database
const db = manager.getDB();
```

**适用文件**（7 个）:
- `src/core/knowledge-base.ts`
- `src/core/context-snapshot.ts`
- `src/core/history-tracker.ts`
- `src/api/audit-logger.ts`
- `src/api/data-deletion.ts`
- `src/api/data-access.ts`
- `src/core/master-election.ts`

---

### 决策 2: 测试覆盖率目标

**Master 批准**: **维持基线测试通过率 ≥87%**

**理由**:
1. ✅ **聚焦任务**: SQLite 迁移不应修复无关的 Redis 测试
2. ✅ **避免范围蔓延**: 保持任务边界清晰
3. ✅ **可追溯性**: 如果测试下降，立即定位是迁移引起的

**验证标准**:
```bash
# 每迁移 2-3 个文件后运行
npm test

# 期望结果
Test Suites: ≥18 passed (47%+)
Tests: ≥927 passed (87%+)
```

---

## 🚀 Master 授权和指导

### 阶段 2 执行计划（授权）

**Master 授权 Slaver A 继续执行**:

#### Phase 1: 快速胜利（2 小时，立即开始）

**目标**: 迁移 4 个简单文件

**文件清单**:
1. `src/index.ts` - Pattern A
2. `src/api/eket-server.ts` - Pattern A
3. `src/api/web-server.ts` - Pattern A
4. `src/hooks/http-hook-server.ts` - Pattern A

**预期成果**:
- 完成度: 5/11 (45%)
- 测试稳定: ≥87%
- Git 提交: 4 个原子提交

#### Phase 2: getDB() 文件（3-4 小时）

**目标**: 迁移 7 个使用 getDB() 的文件

**策略**: 选项 A - 同步模式 + getDB()

**文件清单**:
1. `src/core/master-election.ts` - 高优先级
2. `src/api/data-access.ts` - 高优先级
3. `src/api/data-deletion.ts` - 高优先级
4. `src/api/audit-logger.ts` - 中优先级
5. `src/core/knowledge-base.ts` - 最复杂
6. `src/core/context-snapshot.ts` - 复杂
7. `src/core/history-tracker.ts` - 复杂

**顺序建议**: 按优先级递增复杂度

**预期成果**:
- 完成度: 11/11 (100%)
- 减少代码: ~300 行（消除重复）
- 统一架构: 单一 SQLiteManager

#### Phase 3: 质量验证（1 小时）

**检查清单**:
```bash
# 1. 完整测试
npm test
# 目标: ≥87% 通过率

# 2. 构建验证
npm run build
# 目标: 无错误

# 3. Lint 检查
npm run lint
# 目标: 无新增警告

# 4. 代码审查
# 检查所有迁移文件的 import 和用法
```

---

## 📋 Master 要求

### 提交规范

**每迁移 1-2 个文件提交一次**:
```bash
git add <files>
git commit -m "feat(sqlite): migrate <module> to SQLiteManager

- 使用 SQLiteManager 替代 SQLiteClient
- 模式: Pattern A / useWorker: false
- getDB() 保留用于直接数据库访问 (若适用)
- 测试: ✅ 基线稳定

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### 进度报告

**每完成 Phase 后汇报**:
1. 完成文件清单
2. 测试结果（通过率）
3. 遇到的问题和解决方案
4. 下一 Phase 预计时间

---

## 🎯 总体时间线

| Phase | 任务 | 工时 | 累计完成度 |
|-------|------|------|------------|
| ✅ Phase 0 | 分析 + health-check | 6h | 9% (1/11) |
| 🔄 Phase 1 | 简单文件迁移 | 2h | 45% (5/11) |
| ⏳ Phase 2 | getDB() 文件迁移 | 3-4h | 100% (11/11) |
| ⏳ Phase 3 | 质量验证 | 1h | 完成 |

**总计**: 12-13 小时（含已完成的 6h）
**预计完成**: 2026-04-08 晚上或 2026-04-09 上午

---

## ✅ Master 评价（阶段 1）

**评分**: **8/10** ⭐ 优秀

**优点**:
1. ✅ **详细分析**: 12.7KB 执行报告，覆盖所有细节
2. ✅ **模式验证**: Pattern A 已验证有效
3. ✅ **风险识别**: 提前识别 getDB() 问题并请求决策
4. ✅ **质量保证**: 测试基线稳定，构建通过
5. ✅ **清晰沟通**: 明确请求 Master 决策

**改进空间**:
- 🟡 执行速度: 6 小时仅完成 1 个文件（但分析工作扎实）
- 🟡 可以更早请求决策（减少等待时间）

**Master 期望**:
- 🎯 Phase 1 (2h) 完成后更新进度
- 🎯 Phase 2 遇到困难及时汇报
- 🎯 保持当前的代码质量和文档标准

---

## 🚀 立即行动

**Slaver A，你现在可以继续执行**:

1. ✅ **决策已下达**: 使用选项 A（同步模式 + getDB()）
2. ✅ **目标已明确**: 测试基线 ≥87%
3. ✅ **计划已批准**: Phase 1 → Phase 2 → Phase 3
4. ✅ **授权已给予**: 继续迁移所有 11 个文件

**开始 Phase 1 吧！期待你的好消息！** 🚀

---

**Master 签名**: Claude Opus 4.6
**授权时间**: 2026-04-08
**有效期**: 至 TASK-016 完成
