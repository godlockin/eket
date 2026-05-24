# Requirement Analysis: EPIC-009 — EKET 高级智能、自愈与语义门禁升级

## 1. 原始诉求

> 基础专家组配合专家扩展项目来做到分角色推进，通过脚本进行项目初始化/中途接手，全局共享专家定义和skills定义，但是project by project of the three-repo architecture paradigm.
> 实现状态自愈、AI语义质量门禁阻断，AB专家组对抗评审，保证交付体系的完整性、可靠性与可执行性。

---

## 2. 受益人 × 场景矩阵

| Persona | 触发场景 | 当前痛点（证据） | 期望结果 |
|---------|---------|-----------------|---------|
| **Master (Tech Lead)** | 连线恢复时的系统状态同步 | 在网络波动或降级期间（Level 2/3），本地文件日志积压，重新连线后极易导致主数据库状态与本地漂移不一致 | SQLite 与 Redis 自动触发后台重放，毫秒级对齐离线期间产生的所有消息，自动完成状态机自愈 |
| **Slaver (Developer)** | 提交分析报告 `analysis-report.md` | 部分 Slaver 可能生成空洞、copy-paste 的分析模板以骗过传统的“字数及结构门禁”，导致开发质量大幅下降 | AI 语义门禁严苛审查分析内容与验收标准（AC）的贴合度，自动评分并熔断低劣设计方案 |
| **Git Hook (CI/CD)** | git commit 触发 pre-commit 审查 | 引入 AI 语义审查如果每次都发出 API 网络请求，将产生 2-5 秒 of 延迟，严重影响开发者本地 Git 操作的流畅度 | 采用高效的 SHA256 文件哈希缓存机制，仅在分析报告内容变更时向 AI 提问，其余情况瞬间返回，零感知延迟 |
| **DevOps / QA** | 运行全量集成测试 | 离线环境或测试环境下由于无 API Key 配置，常导致 LLM 校验流程直接报错中断测试流 | 引入鲁棒的本地测试降级机制（EKET_TEST_FALLBACK），即使离线无 API 依然能通过简单的 Heuristics 扫描，测试覆盖率 100% |

---

## 3. 验收标准

Gherkin 句式说明：Given [Context] When [Action] Then [Outcome]

**AC-1: 降级状态自动对齐与重放 (Self-Healing)**
- **Given**: 连接由 `file` 升级为 `sqlite` 或 `remote_redis`
- **When**: 触发 `ConnectionManager.tryUpgrade()` 或初始化连接
- **Then**: 扫描 `.eket/data/queue/*.msg` 与 `.json` 文件，按 timestamp 升序 chronological 排列，幂等对齐入库，最后垃圾清理删除重放后的文件

**AC-2: 核心结构与字数强约束**
- **Given**: Slaver 提交 `analysis-report.md` 触发 gate:review 审查
- **When**: 校验文件结构
- **Then**: 强校验是否包含 5 个核心二级标题（Goals、Approach、Impact、Breakdown、Risk）且总字节数必须 > 300 字节，不足者直接 veto

**AC-3: AI 语义质量评测与硬性熔断**
- **Given**: 结构校验通过，传入 AC 与分析方案
- **When**: AI 质检打分低于 70 分，或被识别为“抄袭 AC/大面积填充 TODO”
- **Then**: Git pre-commit 脚本返回 `exit 1` 物理阻断 commit 提交，输出具体 veto 缺陷和修改建议

**AC-4: SHA256 缓存流防延迟**
- **Given**: 多次执行 git commit，`analysis-report.md` 内容哈希未变
- **When**: 重复触发 gate:review
- **Then**: 瞬间读取 `.eket/state/semantic_cache.json` 缓存结果返回，零网络 API 调用

---

## 4. 非目标

- ❌ **分布式并发写锁机制**（Phase 2 实现）— 本轮仅针对单 Master-Slaver 协同场景进行 WAL 重放。
- ❌ **动态多角色算力按需 Spawn**（M2 任务 TASK-Y04 范围）— 本轮仅关注 M1 的状态自愈与语义审查。
- ❌ **AST 代码图谱 RAG 检索**（M2 任务 TASK-Y03 范围）— 属于下周的图谱建库与 FTS5 搜索开发。
- ❌ **实时 Web Dashboard 渲染**（M3 任务 TASK-Y05 范围）— Dashboard 交互拓扑在 Week 3 开发。

---

## 5. 未知与假设

| ID | 类型 | 内容 | 阻塞级别 | 解除方式 |
|---|---|---|---|---|
| U-1 | 未知 | 离线/降级消息在极高并发下并发回放是否会导致 SQLite busy 锁 | P1 | 在 SQLiteClient 读写时加入 BusyTimeout 保护，并使用单线程后台对齐 |
| U-2 | 未知 | LLM 提取 JSON 块时，由于限制返回格式损坏 | P0 | 编写非常修剪的 extractJson 方法，过滤 markdown 标记、格式化空格、剥离外部解释词 |
| A-1 | 假设 | 离线降级文件单文件 < 50KB，不会对磁盘 I/O 造成读写瓶颈 | P2 | 设定垃圾回收机制，对齐成功的 `.msg` 必须立即 unlink 删除 |
| A-2 | 假设 | 缓存并发写入不会造成文件损坏 | P0 | **重构实现**：采用 POSIX 原子级写入机制（写入临时文件 + renameSync 覆盖），防止多进程并发损坏 |

---

## 6. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解策略 |
|------|--------|------|---------|
| **LLM API 网络抖动** | H | H | ① 本地构建高度鲁棒的降级扫描过滤器（TBD/TODO 过滤及字数校验）<br>② 在检测到网络报错时自动降级到简单校验器（生产环境降级通过，保障开发不中断） |
| **多进程并发写缓存损坏** | M | M | ① 采用 POSIX 级原子写入（`.tmp` ➔ `renameSync`）保证原子完整性。<br>② 缓存操作包裹 `try-catch` 避免物理写错误阻断核心提交流。 |
| **消息重放重复消费** | M | H | ① 基于唯一 Message ID 针对 SQLite `message_history` 表执行前置 INSERT 校验。<br>② 双重过滤机制确保已重放数据绝不二次消费（幂等保障）。 |

---

## 7. 5-Why 根因分析

**现象**: 降级连线后系统数据漂移，或 Slaver 提交低劣的“AI垃圾报告”骗过结构门禁。

1. **Why 会发生状态漂移与低劣报告？** ➔ 系统在网络断开时无法实时同步状态，且传统门禁只检查结构、不关注真实语义。
2. **Why 状态无法对齐且无法检验语义？** ➔ 因为离线期间的消息未建立重放总线（WAL），且没有引入 LLM 技术总监进行语义审查。
3. **Why 没建立 WAL 与 LLM 质检员？** ➔ 之前的设计主要优化了“Happy Path”（全连线好状态），缺乏对异常/网络波动降级状态下的闭环设计。
4. **Why 缺乏降级闭环设计？** ➔ 早期系统假设网络 100% 稳定，且信任所有 Agent 都诚实执行，忽略了大规模多 Agent 并行时的作弊/不可信行为。
5. **Why 假设网络稳定与智能体可信？** ➔ **根因**：初版架构为了快速验证核心工作流，未对“物理环境降级”与“协同博弈防腐”进行深度的边界防御。

**解决方向**：Milestone 1 引入 WAL Raft 消息重放对齐（状态自愈） + AI 语义硬熔断与原子缓存门禁（协同防腐）。

---

## 8. 闸门检查结果

| 检查项 | 结果 | 说明 |
|--------|------|------|
| **Who** 受益人 | ✅ | Master / Slaver / DevOps 均有清晰痛点与期望受益（§2） |
| **What** 交付物 | ✅ | `StateReconciler`、`SemanticValidator` 以及 pre-commit Hook 门禁 |
| **Why** 痛点 | ✅ | 有明确的漂移和作弊隐患事实（§7） |
| **When** 成功判据 | ✅ | AC-1~4 均有 100% 通过的单元与集成测试用例 |
| **Why-5** 根因 | ✅ | 追溯到了设计假设层面的 Happy Path 盲区（§7） |

**闸门通过** ✅ — 可进入 Phase 2 技术实现阶段。

---

**版本**: 1.0  
**作者**: Tech Lead & PM Expert  
**创建时间**: 2026-05-24 09:30  
**状态**: `analysis_complete`
