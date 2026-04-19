# 多智能体协作 — 实战经验教训

**创建时间**: 2026-04-15
**来源**: EKET Round 2 (2026-04-07)、Round 3 (2026-04-08)、Subagent Group (2026-04-02)
**适用范围**: Master-Slaver 架构的多智能体协作项目

---

## 新增条目格式

新增经验时，统一使用以下结构：

```markdown
### X.Y 标题

**问题**：什么情况下会遇到这个问题？

**规则**：应该怎么做（一句话结论优先）。

**反例**：<!-- 可选 -->常见的错误模式。

**数据支撑**：<!-- 可选 -->量化数据、执行记录出处。
```

---

## 目录

1. [任务分配原则](#task-allocation)
2. [并行执行的效率与风险](#parallel-execution)
3. [环境依赖问题的处理策略](#env-dependency)
4. [Master 的协调职责](#master-coordination)
5. [Slaver 执行质量差异管理](#slaver-quality)
6. [预估工时偏差规律](#time-estimation)
7. [大规模 Subagent 组织经验](#large-scale)
8. [失败模式与应对策略](#failure-patterns)

---

## 1. 任务分配原则 {#task-allocation}

### 成功模式

**专注单一领域**：每个 Slaver 专注一个领域（测试修复、性能验证、SQLite 迁移、文档维护），产出质量远高于杂而多的分配方式。

**任务规模适中**：Round 2 经验显示，2~4 小时内可完成的任务是最优规模。太小（<30分钟）失去并行价值，太大（>8小时）需要拆分。

**设立独立文档 Agent**：Round 2 创新点——专门分配一个 Slaver 负责文档，产出质量和连贯性显著高于让各个 Slaver 各自写文档。

### 任务分配 checklist（分配前确认）
- [ ] 任务边界是否清晰？（没有歧义地带）
- [ ] 任务间的依赖是否排清？（并行任务不得有隐式依赖）
- [ ] 每个 Slaver 需要的环境/权限是否已准备好？
- [ ] 预估时长是否合理？（参考 §6 偏差规律）

---

## 2. 并行执行的效率与风险 {#parallel-execution}

### 效率上限

| 规模 | 实测效率 | 来源 |
|------|---------|------|
| 5 Slavers 并行 | 20 分钟完成预估 2~3 小时的工作 | Round 2 |
| 4 Slavers 并行 | 约 2~3 小时（其中一个受环境限制） | Round 3 |
| 16 Subagents 并行 | 修复 450+ 问题，含 35 项 P0 | Subagent Group |

**并行的核心价值**：专业化分工 × 并行时间 = 指数级效率提升。

### 并行的风险点

1. **隐式依赖冲突**：两个 Slaver 都修改了同一文件 → 合并冲突
2. **环境竞争**：多个 Slaver 同时操作 Redis/SQLite → 数据不一致
3. **任务聚焦漂移**：Slaver 互相协助对方任务，各自核心任务进度延迟（Round 3 实际发生）
4. **Linter 自动还原**：一个 Slaver 的格式化操作还原了另一个 Slaver 的手动修改

### 缓解策略

```
- 严格隔离：每个 Slaver 操作独立的文件集合
- 环境准备：开始前确认所有依赖服务运行（Redis/数据库）
- 禁止互相协助：只有 Master 可以调整 Slaver 间的协作
```

---

## 3. 环境依赖问题的处理策略 {#env-dependency}

**Round 3 典型案例**：Slaver C 负责性能验证，但 Redis 服务未运行，无法执行实际基准测试。

### 处理决策树

```
检测到环境依赖缺失
    ↓
能否 30 分钟内解决？
  ├── 能 → 先解决环境，再执行任务
  └── 不能 → 上报 Master
           ↓
           Master 决策：
             ├── 切换到降级模式（如理论分析替代实测）
             ├── 推迟该任务到下一 Round
             └── 让其他 Slaver 帮忙准备环境
```

**降级执行原则**：实测 > 基于日志的分析 > 代码静态分析 > 理论推演
- 降级执行时必须明确标注"降级模式"，产出物注明"待实测验证"
- 降级产出不能视为完整验收，必须在后续补全

### 常见环境依赖清单（启动前确认）

| 服务 | 检查命令 | 常见缺失场景 |
|------|---------|------------|
| Redis | `redis-cli ping` | 性能测试、消息队列测试 |
| Node.js 版本 | `node --version` | ESM 模块路径问题 |
| npm 依赖 | `npm ci` / `npm install` | 构建失败 |
| 环境变量 | `cat .env` | API 调用失败 |

---

## 4. Master 的协调职责 {#master-coordination}

### Master 的核心价值

Master 不是"分任务的人"，而是**消除阻塞的人**。

**Round 3 Master 正确行为示例**：
- Slaver C 被 Redis 阻塞 → Master 立即决策切换降级模式
- Slaver A 协助测试修复（偏离主任务）→ Master 识别并在下一 Round 重新聚焦

### Master 心跳检查（等待期间的主动工作）

Master 不是被动等待 PR，而是主动执行：
1. **同步/修正 roadmap** — 对齐当前进度，识别风险项
2. **规划下阶段任务** — 创建下一 Sprint 规划草案
3. **拆解新需求** — 将宏观需求拆解为 Ticket 级别
4. **标记 Ticket 优先级和依赖** — 识别关键路径
5. **预初始化 Slaver 团队** — 确保充足的可领取任务

**Master 红线**：禁止亲手写任何代码（业务/配置/测试都不行），禁止审查自己实质参与的任务。

---

## 5. Slaver 执行质量差异管理 {#slaver-quality}

### 质量评分基准

Round 3 Master 评分示例（供参考）：

| Slaver | 结果 | 评分 | 原因 |
|--------|------|------|------|
| Slaver B（测试修复） | ⭐ 优秀 | 9/10 | 显著提升测试质量，核心目标完成 |
| Slaver A（SQLite 迁移） | 🟡 计划完成 | 7/10 | 遇到 Linter 阻塞，完成部分 |
| Slaver C（性能验证） | ⚠️ 受限完成 | 6/10 | 环境限制，降级到理论分析 |
| Slaver E（文档归档） | 🟡 部分完成 | 7/10 | 跨分支问题，文档未全部归档 |

### 质量差异的处理原则

1. **不因环境原因惩罚 Slaver**：Redis 不可用是 Master 的准备失误，不是 Slaver 的执行失误
2. **区分"完成度"和"质量"**：核心功能完成度 vs 代码质量 vs 测试覆盖度 → 分开评估
3. **未完成任务的归属**：剩余工作记录到下一 Round，不堆积在当前 Ticket

---

## 6. 预估工时偏差规律 {#time-estimation}

| 场景 | 预估 | 实际 | 偏差比 |
|------|------|------|--------|
| Round 2（5 Slavers 并行） | 2~3 小时 | 20 分钟 | 6~9 倍高估 |
| Round 3（4 Slavers 并行） | ~2 小时 | ~2~3 小时 | 基本准确（含阻塞） |

**规律总结**：
- AI 并行执行**大幅压缩时间**，但有环境依赖时可能出现长阻塞
- 预估工时应基于**串行时间 ÷ 并行因子**（并行因子通常 2~5，受依赖约束）
- 包含"环境准备"时间的任务，实际时间是预估的 1.5~2 倍

---

## 7. 大规模 Subagent 组织经验 {#large-scale}

*来源：Subagent Group 修复行动（16 个 Subagent 并行，修复 450+ 问题）*

### 组织结构

```
Master（协调）
├── Expert Review Group（27 个领域专家，纯评审）
└── Fix Group（16 个专项修复 Subagent，纯执行）
    ├── 安全类（3 个）
    ├── 架构类（2 个）
    ├── 代码质量类（3 个）
    ├── 文档类（1 个）
    └── 基础设施类（7 个）
```

### 大规模并行的特殊规则

1. **评审与执行分离**：评审阶段和修复阶段完全分开，不得同步进行
2. **修复领域不重叠**：每个 Subagent 有明确的文件/模块范围，禁止越界
3. **进度可见性**：每个 Subagent 产出独立的完成报告，Master 通过报告汇总进度
4. **合并顺序**：依赖关系确定合并顺序（基础设施 → 核心模块 → 测试 → 文档）

---

## 8. 失败模式与应对策略 {#failure-patterns}

| 失败模式 | 触发条件 | 预防 / 恢复 |
|---------|---------|------------|
| 任务聚焦漂移 | Slaver A 协助 Slaver B，自身任务延迟 | Master 明确禁止横向协助；检测到时立即发出纠正消息 |
| Linter 自动还原 | 格式化工具在 commit hook 还原手动修改 | 提前配置 `.eslintignore` / `prettier ignore`；手动修改后立即提交 |
| 环境依赖阻塞 | Redis/DB 未就绪，Slaver 无法执行 | 启动前 `system:doctor` 检查；准备降级执行方案 |
| 分析瘫痪 | Slaver 连续读取 5+ 文件没有任何产出 | Slaver 心跳检查：连续 5 次读文件无写入 → 立即开始写或报告 BLOCKED |
| 合并冲突 | 多个 Slaver 修改同一文件 | 任务分配时划定文件范围；Master Review 阶段合并顺序控制 |
| PR 幻觉 | Slaver 声称完成但产物为空/占位符 | 4-Level Artifact Verification (L1~L4) 强制执行 |

---

**参见**：
- [DOC-DEBT-CLEANUP.md](DOC-DEBT-CLEANUP.md) — 文档债清理方法论
- [EKET-PROJECT-HYGIENE.md](EKET-PROJECT-HYGIENE.md) — EKET 特有卫生规则
- [BORROWED-WISDOM.md](BORROWED-WISDOM.md) — 完整知识库索引
- `docs/reports/ROUND3-MASTER-FINAL-REPORT.md` — Round 3 详细报告
- `docs/plans/completed/ROUND2-MASTER-FINAL-REPORT.md` — Round 2 详细报告
