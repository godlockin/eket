# EKET 优化循环设计文档

**日期**: 2026-04-06
**版本**: v2.0.0 → v2.1.0
**方法**: 分层制 × 分域并行

---

## 项目目标

**近期（本次循环）**：将 review 发现的 14 个功能性 Bug + 6 项设计问题系统性修复，使框架从「可以运行」提升到「可以信赖」。

**中期（v2.1.0）**：消除模块重复、统一接口抽象、完善模板一致性，使框架从「可以信赖」提升到「可以演进」。

**愿景**：EKET 成为 AI 智能体协作的工程化底座——任何团队可以通过 `init-project.sh` 在 10 分钟内启动一个多 Agent 协作项目，并在无人值守的情况下持续产出稳定的代码和决策记录。

---

## 评价体系

| 层次 | 指标 | 通过线 |
|------|------|--------|
| **Layer 1 Bug 修复** | 已知 Bug 修复率 | ≥ 85% |
| | `npm run build` 零编译错误 | 100% |
| | 新增测试覆盖修复点 | ≥ 70% |
| **Layer 2 架构整理** | 重复代码消除率 | ≥ 80% |
| | `EketErrorCode` 覆盖率（所有模块使用枚举而非字符串） | 100% |
| | 模板版本号一致性 | 100% |
| **Layer 3 能力提升** | 模板 Agent 工作流无歧义（无矛盾指令） | 100% |
| | `outbox/tasks/` 有 README | 100% |
| | 优化循环可重复执行（脚本幂等） | ≥ 90% |

---

## 循环架构

```
优化循环控制器（用户确认每层进入下一层）
         │
    ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
    │ Layer 1 │ --> │ Layer 2 │ --> │ Layer 3 │
    │ Bug修复 │     │架构整理 │     │能力提升 │
    └─────────┘     └─────────┘     └─────────┘

每层内部：
  域A升级Agent ──┐
                 ├──► 评判Agent ──► 通过? ──► 用户确认进下层
  域B升级Agent ──┤                    │
  域C升级Agent ──┘          不通过 ──► 定向修正轮
```

---

## Layer 1：Bug 修复

### 域 A — 外框核心（node/src/）

| # | Bug | 文件 |
|---|-----|------|
| 1 | sqlite-async-client Worker 忽略构造函数 dbPath，走环境变量；connect() 在 Worker 初始化前就 resolve | `core/sqlite-async-client.ts` |
| 2 | master-context 每次操作创建独立 Redis 连接，不走连接池 | `core/master-context.ts` |
| 3 | optimized-file-queue 校验和验证逻辑错误（含 _write_checksum 字段的对象与不含该字段的对象不同） | `core/optimized-file-queue.ts` |
| 4 | ConnectionLevel 类型三处重复定义，websocket-message-queue 语义不同 | `types/index.ts` + 相关模块 |
| 5 | master-context 使用 7 个未注册到 EketErrorCode 的 string literal 错误码 | `core/master-context.ts` + `types/index.ts` |
| 6 | hashFunction 类型拼写 'murmer3'（应为 'murmur3'） | `types/index.ts` |
| 7 | master-election.ts 本地重复声明 ElectionLevel/MasterElectionConfig/MasterElectionResult | `core/master-election.ts` |

### 域 B — 外框周边（scripts/ web/）

| # | Bug | 文件 |
|---|-----|------|
| 8 | eket-start.sh 引用 heartbeatmonitor.sh（无连字符），实际为 heartbeat-monitor.sh | `scripts/eket-start.sh` |
| 9 | start.sh 尝试启动不存在的 Python 模块，是迁移遗留僵尸脚本 | `scripts/start.sh` |
| 10 | web/app.js 请求不存在的 /locales/ 路径，i18n 全部 404 | `web/app.js` |
| 11 | init-three-repos.sh 错误提示引用过时命令格式 | `scripts/init-three-repos.sh` |

### 域 C — 模板（template/）

| # | Bug | 文件 |
|---|-----|------|
| 12 | IDENTITY.md 包含未执行的 Shell 表达式（$(date)、${ROLE}） | `template/.eket/IDENTITY.md` |
| 13 | eket-slaver-auto.sh 状态解析正则与 ticket 模板格式不匹配；优先级用 High/Low 但模板用 P0-P3 | `template/.claude/commands/eket-slaver-auto.sh` |
| 14 | eket-start.sh `-r` 参数用 $2 而非 $OPTARG | `template/.claude/commands/eket-start.sh` |
| 15 | eket-init.sh 引用 $(dirname "$0")/../../template/ 路径，复制到用户项目后失效 | `template/.claude/commands/eket-init.sh` |

---

## Layer 2：架构整理

| 域 | 工作内容 |
|----|---------|
| **域 A** | 合并 sqlite 双实现共同接口；将 OptimizedFileQueueManager 接入 message-queue 文件降级路径；删除 scripts/start.sh |
| **域 B** | 统一所有模块 EketErrorCode 使用（消灭 string literal）；修复 web-server.ts 静态路径健壮性 |
| **域 C** | 模板版本号统一到 v2.0.0；合并/厘清两个 CLAUDE.md；confluence/templates/ 通用化；占位符统一为 `{{变量名}}` |

---

## Layer 3：能力提升

| 域 | 工作内容 |
|----|---------|
| **域 A** | 补充 CLAUDE.md 分析报告步骤；补充 SYSTEM-SETTINGS.md 审批触发机制；添加 outbox/README.md、tasks/README.md |
| **域 B** | 修复 eket-init.sh 依赖检测逻辑；优先级体系统一 P0-P3；eket-slaver-auto.sh 增加 P0-P3 解析 |
| **域 C** | README.md 与 README_TEMPLATE.md 命名互换；更新过时目录结构描述；添加 Agent 快速决策树入口 |
