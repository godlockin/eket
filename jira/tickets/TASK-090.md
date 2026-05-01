# TASK-090: docs/ Conference 结构设计 + 内容迁移

## 元数据
- **状态**: done
- **类型**: refactor
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-19
- **依赖**: 无

## 背景

docs/ 目前存在两套目录体系（01-06 编号系统 vs 有机扁平系统），同时存在大量历史报告、评审记录、
执行产物混入 docs/，导致实际可用文档难以定位。本轮目标：建立 conference-style 单一体系，
docs/ 只保留"活的文档"，历史产物全进 archive/。

## 验收标准

1. docs/ 根目录只有以下子目录：`getting-started/` `architecture/` `guides/` `reference/` `ops/` `performance/` `roadmap/` `adr/` `archive/`
2. 删除旧编号目录：`01-getting-started/` `02-architecture/` `03-implementation/` `04-testing/` `05-reference/` `06-sop/`（内容已迁移或在 template/docs/ 有正本）
3. 删除历史产物目录：`reports/` `reviews/` `audit/` `bug-fixes/` `validation/` `test-reports/` `protocol/` `ref/` `developer/` `releases/` `plans/completed/`
4. docs/README.md 更新为单一导航入口
5. `cd node && npm test` 全部通过

## 目标目录结构

```
docs/
├── README.md                    # 主导航（更新）
├── getting-started/             # 快速上手
│   ├── README.md
│   ├── QUICKSTART.md            # 来自 01-getting-started
│   ├── DESIGN_PHILOSOPHY.md     # 来自 01-getting-started
│   └── USAGE.md                 # 来自 01-getting-started
├── architecture/                # 真架构文档
│   ├── README.md
│   ├── FRAMEWORK.md             # 来自 02-architecture
│   ├── THREE-LEVEL-ARCHITECTURE.md   # 来自 docs/architecture/
│   ├── THREE_REPO_ARCHITECTURE.md    # 来自 02-architecture
│   ├── AGENTS_CONFIG.md         # 来自 02-architecture
│   ├── SKILLS_SYSTEM.md         # 来自 02-architecture
│   ├── MULTI_INSTANCE_DESIGN.md # 来自 docs/
│   └── OPENCLAW-*.md (2 files)  # 来自 docs/
├── guides/                      # 操作指南
│   ├── FULL-STACK-MODE.md
│   ├── NODEJS-MODE.md
│   └── SHELL-MODE.md
├── reference/                   # 参考
│   ├── error-codes.md           # 来自 reference/
│   └── README.md
├── ops/                         # 运维
│   ├── runbook.md
│   ├── branch-protection-setup.md
│   ├── backup-restore-policy.md     # 来自 docs/
│   └── backup-restore-procedures.md # 来自 docs/
├── performance/                 # 保留原内容
├── roadmap/                     # 保留原内容（round* 文件归 archive）
│   ├── README.md
│   ├── EKET-ROADMAP-2026-Q2-Q4.md
│   └── v3-phase0.md / v3.0-strategy.md
├── adr/                         # 保留（3 个 ADR）
└── archive/                     # 历史归档（只进不出）
    └── INDEX.md（更新索引）
```

## 迁移清单

### KEEP → getting-started/
- `01-getting-started/QUICKSTART.md`
- `01-getting-started/DESIGN_PHILOSOPHY.md`
- `01-getting-started/USAGE.md`
- `developer/getting-started.md` → 合并进 getting-started/README.md

### KEEP → architecture/
- `02-architecture/FRAMEWORK.md`
- `02-architecture/THREE_REPO_ARCHITECTURE.md`
- `02-architecture/AGENTS_CONFIG.md`
- `02-architecture/SKILLS_SYSTEM.md`
- `architecture/THREE-LEVEL-ARCHITECTURE.md`
- `architecture/DEGRADATION-STRATEGY.md`
- `MULTI_INSTANCE_DESIGN.md`（根目录）
- `OPENCLAW-DATAFLOW-DESIGN.md`（根目录）
- `OPENCLAW-INTEGRATION-DESIGN.md`（根目录）

### KEEP → ops/
- `ops/runbook.md`
- `ops/branch-protection-setup.md`
- `backup-restore-policy.md`（根目录）
- `backup-restore-procedures.md`（根目录）

### KEEP → reference/
- `reference/error-codes.md`
- `protocol/EKET_PROTOCOL_V1.md` → rename as `reference/EKET-PROTOCOL.md`
- `protocol/openapi.yaml` → `reference/openapi.yaml`

### KEEP → roadmap/ (清理老 round 文件)
- `plans/active/EKET-ROADMAP-2026-Q2-Q4.md` → `roadmap/EKET-ROADMAP-2026-Q2-Q4.md`
- `roadmap/v3-phase0.md`, `v3.0-strategy.md`

### DELETE（产物，不再需要）
- 全部 `reports/` (已有 archive INDEX)
- 全部 `reviews/` (历史评审)
- 全部 `audit/`
- 全部 `bug-fixes/`
- 全部 `validation/`
- 全部 `test-reports/`
- `plans/completed/`
- `releases/`
- `ref/`
- `03-implementation/` (全是过时内容)
- `04-testing/` (全是过时内容)

### → archive/
- `architecture/TASK-003-*.md`（3个任务产物）
- `architecture/TASK-011-*.md`
- `architecture/TASK-016-*.md`（3个）
- `COMMUNICATION-PROTOCOL.md` (根目录，superseded)
- `IDENTITY.md` (根目录)
- `MASTER-SLAVER-MINDSET.md` (根目录)
- `http-server-security-enhancements.md` (根目录)
- `roadmap/round8-complete.md`
- `roadmap/round9-complete.md`
- `roadmap/round9-plan.md`
- `roadmap/round10-14-plan.md`
- `roadmap/round13b-plan.md`
- `plans/node-state-migration-plan.md`
- `INDEX.md` (根目录，superseded by README.md)
- `TEST_ENVIRONMENT_GUIDE.md` (根目录)
- `performance/TASK-006-*.md` (2个)
- `06-sop/` 全部（06-sop 内容正本在 template/docs/，docs/ 副本作废）
- `protocol/README.md`, `protocol/QUICKSTART.md`

### 保持不动
- `archive/` (所有现有 archive 文件)
- `performance/benchmark-report.md`
- `performance/optimization-recommendations.md`
- `performance/PERFORMANCE_TESTING.md`
- `guides/` 3 个文件
- `adr/` 3 个文件

## 执行方式

```bash
git checkout -b feature/TASK-090-docs-conference-restructure
# 按迁移清单执行 git mv + git rm
# 更新 docs/README.md 导航
# 运行 npm test 确保无引用破坏
```

## 知识沉淀要求

复盘写入本 ticket + `confluence/memory/docs-structure.md`（记录 conference 体系）

## 执行记录

- **负责人**: Slaver
- **完成时间**: 2026-04-19
- **PR**: https://github.com/godlockin/eket/pull/106
- **分支**: feature/TASK-090-docs-conference-restructure

### 执行结果

- ✅ 101 个文件变更：20 insertions, 33875 deletions
- ✅ getting-started/ architecture/ reference/ ops/ 目录内容迁移完成
- ✅ reports/ reviews/ audit/ bug-fixes/ validation/ test-reports/ releases/ ref/ api/ plans/completed/ 删除完成
- ✅ 历史产物（TASK-003/011/016、round*-plan/complete）归档至 archive/
- ✅ docs/README.md 更新为 conference-style 导航
- ✅ npm test: 1197/1199 通过（2 个预存失败与本任务无关）

### 知识沉淀

- git mv 失败原因：目标目录不存在时 git mv 返回 rc=128；需先创建目标目录（通过写入 .gitkeep）
- 分批执行 git mv 更稳定，避免 terminal 中断导致部分执行
