# EKET Framework Benchmark Report

> 评测日期: 2026-05-25
> 评测版本: EKET v2.9.2 / Node.js ≥20 / Rust

---

## 1. 执行摘要

| 维度 | EKET | mini-swe-agent | 对比 |
|------|------|----------------|------|
| 代码规模 | 93K+ 行 | ~2K 行 | EKET 46x |
| 测试覆盖 | 419 tests | ~50 tests | EKET 8x |
| 架构层数 | 4 层 | 1 层 | EKET 复杂 |
| 功能范围 | 全生命周期 | 代码修复 | EKET 广泛 |

**结论**: EKET 是完整的 Master-Slaver 协作框架，mini-swe-agent 是极简代码修复 Agent。两者定位不同，但 mini-swe-agent 的极简设计理念值得借鉴。

---

## 2. 代码规模对比

### 2.1 EKET 代码统计

| 组件 | 行数 | 文件数 | 说明 |
|------|------|--------|------|
| Rust Core | 16,649 | 49 | 核心库（选举/消息/缓存） |
| Rust CLI | 10,555 | 45 | 命令行工具（41 命令） |
| Node.js | 65,702 | ~200 | Hook Server/Dashboard |
| Skills | 10,404 | ~50 | 专家组/Skill 定义 |
| **Total** | **103,310** | **~350** | |

### 2.2 mini-swe-agent 代码统计

| 组件 | 行数 | 说明 |
|------|------|------|
| Agent Core | ~150 | DefaultAgent 类 |
| Environment | ~200 | Bash 执行环境 |
| Model Interface | ~150 | LLM 调用封装 |
| Config/Utils | ~500 | 配置和工具 |
| **Total** | **~2,000** | |

### 2.3 规模差异分析

mini-swe-agent 极简的原因：
1. **单一职责**: 只做代码修复，不做协作/监控/知识库
2. **无状态 Bash**: 每步独立执行，无需维护 shell 状态
3. **依赖 LLM 能力**: 2024+ 模型能力提升，减少脚手架需求
4. **线性历史**: 所有 message 线性追加，无分支/回滚

EKET 复杂的原因：
1. **全生命周期**: 涵盖 EPIC → Ticket → 开发 → Review → 合并
2. **Master-Slaver**: 需要协调/派发/心跳/邮箱机制
3. **知识沉淀**: SQLite 存储 + FTS 搜索 + 知识图谱
4. **多层降级**: Rust → Node.js → Shell 三层保障

---

## 3. 架构对比

### 3.1 mini-swe-agent 架构

```
┌─────────────────────────────────┐
│         DefaultAgent            │
│  ┌───────────────────────────┐  │
│  │ messages: list[dict]      │  │ ← 线性历史
│  │ model: Model              │  │
│  │ env: Environment (Bash)   │  │ ← 单一执行器
│  └───────────────────────────┘  │
│                                 │
│  run() → step() → query()       │
│            ↓                    │
│       execute_actions()         │
└─────────────────────────────────┘
```

**关键设计**:
- `step()` = `query()` + `execute_actions()`
- 每个 action 通过 `subprocess.run` 独立执行
- 无持久化状态，全靠 message history

### 3.2 EKET 架构

```
┌──────────────────────────────────────────────────┐
│                    Master                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Heartbeat  │  │ Dispatcher │  │  Reviewer  │  │
│  └────────────┘  └────────────┘  └────────────┘  │
└──────────────────────────────────────────────────┘
           ↓ 消息总线 (Redis/文件)
┌──────────────────────────────────────────────────┐
│                   Slaver                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Task Claim │  │  Executor  │  │ Checkpoint │  │
│  └────────────┘  └────────────┘  └────────────┘  │
└──────────────────────────────────────────────────┘
           ↓ 知识层 (SQLite)
┌──────────────────────────────────────────────────┐
│             Knowledge/Memory                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │    FTS     │  │  TF-IDF    │  │   Graph    │  │
│  └────────────┘  └────────────┘  └────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## 4. 测试覆盖对比

### 4.1 EKET 测试结果

| 测试套件 | 通过 | 失败 | 忽略 |
|----------|------|------|------|
| eket-core | 309 | 0 | 1 |
| eket-cli | 110 | 0 | 0 |
| **Total** | **419** | **0** | **1** |

覆盖模块:
- ✅ Fingerprint（增量检测）
- ✅ Batch（批次分割）
- ✅ Gate（审查检查）
- ✅ Election（选举）
- ✅ Cache（三层缓存）
- ✅ File/Node/Edge（类型系统）

### 4.2 mini-swe-agent 测试

- 主要依赖 SWE-bench 外部评测
- 内部单元测试较少
- 通过 74% SWE-bench Verified 验证

---

## 5. 功能对比

| 功能 | EKET | mini-swe-agent |
|------|:----:|:--------------:|
| 代码修复 | ✅ | ✅ |
| Issue 解析 | ✅ | ✅ |
| 多 Agent 协作 | ✅ | ❌ |
| 任务派发 | ✅ | ❌ |
| 知识沉淀 | ✅ | ❌ |
| Checkpoint 恢复 | ✅ | ❌ |
| 专家组 | ✅ | ❌ |
| Gate Review | ✅ | ❌ |
| 增量分析 | ✅ | ❌ |
| 三层降级 | ✅ | ❌ |
| 成本追踪 | ✅ | ✅ |
| Session Replay | ❌ | ✅ |

---

## 6. 性能评估

### 6.1 理论对比

| 指标 | EKET | mini-swe-agent |
|------|------|----------------|
| 启动时间 | ~500ms（Rust CLI） | ~2s（Python） |
| 内存占用 | ~50MB | ~200MB |
| 单任务开销 | 中等（多层协调） | 低（直接执行） |
| 扩展性 | 高（Master-Slaver） | 低（单 Agent） |

### 6.2 SWE-bench 预估

基于架构分析，预估 EKET Slaver 在 SWE-bench Lite 上的表现：

| 场景 | 预估 Pass@1 | 理由 |
|------|-------------|------|
| 简单 Bug Fix | 60-70% | Rust 类型系统 + tree-sitter 分析 |
| 复杂重构 | 40-50% | 需要专家组协作 |
| 跨文件改动 | 30-40% | neighborMap 帮助但仍受限 |

**建议**: 实际 SWE-bench 评测需要专门适配器，当前架构侧重协作而非单点代码修复。

---

## 7. 借鉴建议

### 7.1 从 mini-swe-agent 借鉴

| 优先级 | 借鉴项 | EKET 落地 |
|--------|--------|-----------|
| **P0** | 极简核心 | 提取 Slaver 核心为 100 行版本 |
| **P0** | 线性历史 | 增加 trajectory 导出功能 |
| **P1** | 无状态 Bash | 可选模式：独立执行 vs 持久 shell |
| **P2** | 成本追踪 | 强化 token/cost 统计 |

### 7.2 EKET 独特优势

| 优势 | 说明 |
|------|------|
| Master-Slaver | 支持多 Agent 并行协作 |
| 知识沉淀 | SQLite + FTS 持久化经验 |
| 专家组 | 动态组建领域专家 |
| Checkpoint | 任务中断恢复 |
| 三层降级 | Rust → Node.js → Shell 保障 |

---

## 8. 行动项

### 8.1 短期 (1-2 周)

1. [ ] 提取 EKET Slaver Mini 版本（目标 500 行）
2. [ ] 增加 trajectory 导出功能
3. [ ] 实现 Agent Importance Score

### 8.2 中期 (1 月)

1. [ ] SWE-bench Lite 适配器
2. [ ] 正式 benchmark 报告
3. [ ] Session replay 功能

### 8.3 长期 (季度)

1. [ ] EKET 自有评测数据集
2. [ ] 多 Agent 协作评测框架
3. [ ] 与 AgentOps 类似的监控平台

---

## 9. 附录

### 9.1 评测环境

```
OS: macOS Darwin 25.5.0
Rust: 1.78+
Node.js: 20+
Model: Claude Opus 4
```

### 9.2 参考项目

- [SWE-bench](https://github.com/SWE-bench/SWE-bench) — 5K⭐
- [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) — 4.5K⭐
- [AgentBench](https://github.com/THUDM/AgentBench) — 3.5K⭐
- [DyLAN](https://github.com/SALT-NLP/DyLAN) — 208⭐
- [AgentOps](https://github.com/AgentOps-AI/agentops) — 5.6K⭐

---

*Report generated by EKET Master @ 2026-05-25*
