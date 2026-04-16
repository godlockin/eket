# EKET Round 3 自举系统启动计划

**Master**: Claude Opus 4.6
**日期**: 2026-04-08
**自举轮次**: Round 3
**目标版本**: v2.3.0
**模式**: 1 Master + 5 Slavers 并行协作

---

## 🎯 Round 3 目标

**核心目标**: 完成 v2.2.0 遗留任务，达成测试通过率 90-100%，验证性能优化效果

**版本定位**: v2.2.0 (质量基础) → **v2.3.0 (质量完善)** → v2.5.0 (能力扩展)

**预估时间**: 1-2 天（并行执行）

---

## 📊 Round 2 vs Round 3 对比

| 维度 | Round 2 | Round 3 (目标) |
|------|---------|----------------|
| **Slaver 数量** | 5 个 | 5 个 |
| **目标** | 质量基础建设 | 质量完善验证 |
| **代码规模** | 35,775+ 行 | 预估 5,000+ 行 |
| **测试通过率** | 41% → 47% | 47% → 90-100% |
| **性能验证** | 优化实施 | 效果验证 |
| **文档健康** | 65/100 | 85/100 |
| **用时** | 20 分钟 | 预估 2-4 小时 |

---

## 🎯 5 个 Slaver 任务分配

### TASK-009: 测试修复完善 (Slaver B - QA Specialist)

**负责人**: QA 测试专家
**优先级**: P0
**预估时间**: 3-4 小时
**目标**: 测试通过率 47% → 90%+

#### 子任务

**Task 9.1: 修复模块路径问题**
- 问题: `Cannot find module '../../../src/integration/openclaw-adapter'`
- 问题: `Cannot find module 'core/master-context'`
- 方案: 检查文件存在性，创建 stub，修复导入路径
- 预估: 1 小时

**Task 9.2: 修复 Redis 连接超时**
- 问题: `collaboration.test.ts - Exceeded timeout of 5000 ms`
- 方案: 使用已实现的 `tests/helpers/redis-mock.ts`
- 方案: 优化 CommunicationProtocol 连接逻辑
- 预估: 1 小时

**Task 9.3: 环境依赖测试改造**
- 目标: 所有测试无外部依赖运行
- 方案: 审计失败测试，使用 Mock/Stub
- 预估: 1 小时

**Task 9.4: 测试用例批量修复**
- 策略: 按模块分组（core, api, commands, integration）
- 优先: 高价值测试（集成测试、核心模块）
- 预估: 1.5 小时

#### 产出
- 修复 20+ 个测试文件
- 测试通过率达到 90%+
- 测试修复报告 `docs/test-reports/TASK-009-completion-report.md`

---

### TASK-010: 性能验证与优化 (Slaver C - Performance Engineer)

**负责人**: DevOps 性能专家
**优先级**: P0
**预估时间**: 3-4 小时
**目标**: 验证 Round 2 的 4 项性能优化效果

#### 子任务

**Task 10.1: 性能基准测试执行**
```bash
# 1. 综合性能基准
npm run bench:comprehensive

# 2. k6 压力测试 (如有)
npm run k6:test

# 3. 生成性能报告
npm run bench:report
```
- 关键指标: Redis <5ms, SQLite <10ms, 文件队列 <20ms
- 预估: 1.5 小时

**Task 10.2: 性能对比分析**
- v2.1.2 vs v2.2.0 vs v2.3.0 对比表
- 4 项优化实际效果验证:
  1. SQLite WAL 模式 (预期 +30-40%)
  2. Redis 连接池 (预期 +40%)
  3. 文件队列轮询 (预期 +50-70%)
  4. WebSocket 压缩 (预期 +150%)
- 预估: 1 小时

**Task 10.3: 性能调优（条件触发）**
- 条件: 如发现未达标指标或新优化机会
- 方案: 针对性优化，参数调整，profiling
- 预估: 1 小时

#### 产出
- 性能基准测试完整报告
- v2.1.2 vs v2.2.0 vs v2.3.0 对比表
- 性能优化验证报告 `docs/performance/TASK-010-performance-validation.md`

---

### TASK-011: SQLite Manager 完整迁移 (Slaver A - SQLite Architect)

**负责人**: Backend 架构专家
**优先级**: P1
**预估时间**: 4-5 小时
**目标**: 完成剩余 15 个文件迁移到 SQLiteManager

#### 迁移清单

**核心模块 (高优先级) - 5 个文件**
- [ ] `src/core/sqlite-client.ts` - 重构为 adapter
- [ ] `src/core/sqlite-async-client.ts` - 重构为 adapter
- [ ] `src/core/event-bus.ts`
- [ ] `src/core/workflow-engine.ts`
- [ ] `src/core/knowledge-base.ts`

**命令模块 (中优先级) - 3 个文件**
- [ ] `src/commands/sqlite.ts`
- [ ] `src/commands/instance.ts`
- [ ] `src/commands/task.ts`

**API 模块 (可选) - 2 个文件**
- [ ] `src/api/web-dashboard.ts`
- [ ] `src/api/openclaw-gateway.ts`

**工具和测试模块 - 5 个文件**
- [ ] `src/utils/sqlite-helper.ts`
- [ ] `src/utils/db-utils.ts`
- [ ] `tests/core/sqlite-*.test.ts`
- [ ] `tests/integration/sqlite-*.test.ts`
- [ ] `tests/helpers/sqlite-test.ts` (调整)

#### 策略
1. 优先迁移核心模块和命令模块（8 个文件）
2. API 模块可延后到 v2.4.0
3. 保持向后兼容（旧接口标记 @deprecated）
4. 每个模块迁移后立即运行测试

#### 产出
- 迁移 8-15 个文件到 SQLiteManager
- 代码重复消除验证报告
- 架构迁移报告 `docs/architecture/TASK-011-sqlite-migration-completion.md`

---

### TASK-012: 文档归档与维护 (Slaver E - Documentation Specialist)

**负责人**: 文档维护专家
**优先级**: P1
**预估时间**: 3-4 小时
**目标**: 文档健康评分 65/100 → 85/100

#### 子任务

**Task 12.1: 执行文档归档计划**
- 基于: `docs/audit/merge-plan.md`
- 归档 13 个过时文档到 `docs/archive/v2.x/`
- 验证归档后的文档链接完整性
- 预估: 1.5 小时

**Task 12.2: 更新需刷新文档**
- 更新 18 个需要刷新的文档
- 重点: CHANGELOG, README, 核心架构文档
- 确保版本号和示例代码最新
- 预估: 1.5 小时

**Task 12.3: .gitignore 完善**
- 新增运行时数据规则:
```gitignore
# 运行时数据 (不应提交)
node/.eket/data/
node/.eket/logs/
node/.eket/inboxes/
node/.eket/*/queue/
.eket/data/
.eket/logs/

# 测试临时文件
node/.eket/non-existent-queue/
**/test-*.db
**/test-*.json
```
- 验证现有 git 仓库无运行时数据泄漏
- 预估: 0.5 小时

**Task 12.4: 文档质量验证**
- 运行文档 lint 检查（如有工具）
- 检查断链（broken links）
- 更新文档索引 `docs/INDEX.md`
- 预估: 0.5 小时

#### 产出
- 13 个文档归档完成
- 18 个文档更新完成
- .gitignore 完善
- 文档健康评分提升报告 `docs/audit/TASK-012-documentation-health-improvement.md`

---

### TASK-013: 发布准备与协调 (Master)

**负责人**: Master (Claude Opus 4.6)
**优先级**: P0
**预估时间**: 2-3 小时
**目标**: 协调发布流程，确保 v2.3.0 质量

#### 子任务

**Task 13.1: 协调与审核**
- 监控 5 个 Slaver 进度
- 审核各 Slaver 产出质量
- 解决 Slaver 间的依赖和冲突
- 预估: 持续进行

**Task 13.2: 集成测试验证**
- 合并所有 Slaver 成果后运行完整测试
- 验证测试通过率达标 (≥90%)
- 验证性能指标达标
- 预估: 1 小时

**Task 13.3: CHANGELOG 和 Release Notes**
- 更新 `CHANGELOG.md` v2.3.0 条目
- 编写 GitHub Release Notes
- 创建 Migration Guide（如有 Breaking Changes）
- 预估: 1 小时

**Task 13.4: 版本发布**
```bash
# 1. 更新版本号
vi node/package.json  # 2.2.0 → 2.3.0

# 2. 提交和打 tag
git add -A
git commit -m "chore: release v2.3.0"
git tag -a v2.3.0 -m "Release v2.3.0 - ..."

# 3. 推送
git push origin miao
git push origin v2.3.0

# 4. GitHub Release (可选)
gh release create v2.3.0 --notes-file docs/release-notes/v2.3.0.md
```
- 预估: 0.5 小时

#### 产出
- Round 3 Master 最终审核报告
- v2.3.0 CHANGELOG
- v2.3.0 Release Notes
- Git tag v2.3.0

---

## 🚀 执行时间表

### 并行执行模式（推荐）

```
Hour 0:     Master 创建 5 个 Feature 分支和任务分配
            ├─ feature/TASK-009-test-fixes-completion
            ├─ feature/TASK-010-performance-validation
            ├─ feature/TASK-011-sqlite-migration-complete
            ├─ feature/TASK-012-documentation-health
            └─ feature/TASK-013-release-coordination

Hour 1-4:   5 个 Slaver 并行工作
            ├─ Slaver B: 修复测试 (持续进行)
            ├─ Slaver C: 性能验证 (执行基准测试)
            ├─ Slaver A: SQLite 迁移 (核心模块)
            ├─ Slaver E: 文档归档 (批量处理)
            └─ Master: 监控协调 (实时审核)

Hour 4-5:   Master 审核与合并
            - 审核各 Slaver 产出
            - 合并到 miao 分支
            - 运行完整测试验证

Hour 5-6:   发布准备
            - CHANGELOG 更新
            - Release Notes 编写
            - 版本发布

Hour 6:     🎉 v2.3.0 发布完成
```

### 顺序执行模式（备选）

```
Day 1-2:    Slaver B - 测试修复完善
Day 2-3:    Slaver C - 性能验证与优化
Day 3-4:    Slaver A - SQLite Manager 迁移
Day 4-5:    Slaver E - 文档归档与维护
Day 5-6:    Master - 发布准备与协调
```

---

## 📋 成功标准

### 必须达成 (Must Have)
- ✅ 测试通过率 ≥ 90% (套件)
- ✅ 测试用例通过率 ≥ 95%
- ✅ 性能基准测试执行完成
- ✅ 4 项性能优化效果验证
- ✅ CHANGELOG 和 Release Notes 完成
- ✅ v2.3.0 tag 创建

### 期望达成 (Should Have)
- ✅ 测试通过率 = 100%
- ✅ SQLite Manager 核心模块迁移完成 (8/15 files)
- ✅ 代码重复消除验证
- ✅ 性能指标全部达标
- ✅ 27 个文档归档/更新完成
- ✅ 文档健康评分 ≥ 85/100

### 可选达成 (Could Have)
- ✅ SQLite Manager 完整迁移 (15/15 files)
- ✅ CI/CD Pipeline 基础配置
- ✅ 性能监控 Dashboard 原型
- ✅ 社区宣传文档

---

## 🎯 预期成果

### 代码质量
- **测试通过率**: 47% → **90-100%** (+43-53%)
- **测试用例**: 75% → **95%+** (+20%)
- **代码重复**: 消除 ~300 行
- **架构统一**: SQLite 双实现 → 单一管理类

### 性能验证
- **基准测试**: 完整执行 + 报告
- **性能对比**: 3 版本对比表
- **优化验证**: 4 项优化量化效果
- **瓶颈识别**: v2.4.0 优化方向

### 文档质量
- **过时文档**: 27 个 → **0 个**
- **文档健康**: 65/100 → **85/100** (+20 分)
- **运行时数据**: 分离完成

### 发布质量
- **版本标签**: v2.3.0
- **变更记录**: 详细 CHANGELOG
- **发布说明**: GitHub Release Notes

---

## 🚨 风险与应对

### 风险 1: 测试修复复杂度高
**概率**: 中
**影响**: 高
**应对**:
- 优先修复高价值测试
- 允许部分低优先级测试延后
- 目标调整为 90% 而非 100%

### 风险 2: 性能未达预期
**概率**: 低
**影响**: 中
**应对**:
- 4 项优化已实施，风险较低
- 未达标可追加优化任务
- 性能调优可延续 v2.4.0

### 风险 3: SQLite 迁移引入回归
**概率**: 中
**影响**: 高
**应对**:
- 保持向后兼容
- 充分测试迁移功能
- 优先迁移核心模块（8 个）

### 风险 4: 时间超出预估
**概率**: 中
**影响**: 低
**应对**:
- 并行执行缩短总时间
- 允许 1-2 天延期
- 可拆分为 v2.3.0 和 v2.3.1

---

## 🎖️ 资源分配

### Agent 分配
- **Master** (1): 协调、审核、合并、发布
- **Slaver A** (1): SQLite 架构迁移
- **Slaver B** (1): 测试修复
- **Slaver C** (1): 性能验证优化
- **Slaver E** (1): 文档维护

**总计**: 5 个 Agents 并行

### 工作量估算
- **总工时**: 15-20 小时
- **并行时间**: 4-6 小时
- **顺序时间**: 5-6 天

---

## 📊 与前两轮对比

| 维度 | Round 1 | Round 2 | Round 3 (目标) |
|------|---------|---------|----------------|
| **Slaver 数量** | 4 个 | 5 个 | 5 个 |
| **用时** | 50 分钟 | 20 分钟 | 4-6 小时 |
| **代码行数** | 2,100+ | 35,775+ | 5,000+ |
| **测试提升** | +26% | +6% | +43-53% |
| **创新点** | 首次自举 | 文档 Agent | 性能验证 |
| **聚焦点** | Bug 修复 | 质量基础 | 质量完善 |

---

## 🎉 启动准备

### 前置条件 ✅
- ✅ v2.2.0 已发布
- ✅ Roadmap 已更新
- ✅ v2.3.0 迭代计划已制定
- ✅ 技术债务清晰识别
- ✅ 成功标准已定义

### 启动步骤
1. ✅ 读取本计划文档
2. ⏳ 创建 5 个 Feature 分支
3. ⏳ 创建 5 个 Jira Tickets (TASK-009 ~ TASK-013)
4. ⏳ 分配任务给 5 个 Slaver
5. ⏳ 启动并行执行
6. ⏳ Master 监控与协调

---

**Master 签名**: Claude Opus 4.6
**日期**: 2026-04-08
**版本**: Round 3 Bootstrap Plan v1.0
**状态**: ✅ **准备就绪，等待启动**

---

## 🚀 启动命令

**Master 指令**: "启动 Round 3 自举系统，按照本计划创建 5 个任务并分配给 5 个 Slaver，开始并行执行。"

**预期完成时间**: 2026-04-08 ~ 2026-04-09 (1-2 天)

**目标**: v2.3.0 质量完善版本发布 🎯
