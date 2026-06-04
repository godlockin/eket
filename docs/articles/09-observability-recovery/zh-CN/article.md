# 09 — 可观测性与恢复：tracing / checkpoint / Saga

> **TL;DR** — EKET 通过三条正交的可观测性面（结构化日志、span/tracing、健康指标）和两个恢复面（持久化 checkpoint、5 步 Saga），让 AI 智能体不再是"黑盒"。状态机和存储保证见 [文章 06](../06-master-slaver-protocol/zh-CN/article.md) 和 [文章 07](../07-storage-and-events/zh-CN/article.md)；本文聚焦*记录了什么*、*插桩了什么*、以及 Slaver 在任务中途崩溃时究竟会发生什么。一个原本只能活在上下文窗口里的 30 分钟运行，现在变成 `task_checkpoints` 里的一行、`shared/audit.log` 里的一行日志、以及 `~/.eket/traces/` 里的一个 JSON 文件。审计日志可查询，恢复是幂等的，dashboard 诚实地呈现它看到的一切。

> **Key Takeaways**
> 1. 日志、tracing、指标在 EKET 中是**三件不同的事**。日志是每个协议操作的一行 append；tracing 是 `Workflow → Task → Step → ToolCall` 的 span 树；指标是按固定节奏发出的 gauge（运行时长、内存、心跳）。
> 2. Checkpoint 存储是带版本列的 SQL 行，不是聊天滚动条。`task_checkpoints.data` 是一个 JSON blob，含三层 —— `agentFacingItems`、`fullHistoryItems`、`executedToolCalls`，幂等性由 `WHERE version = ?` CAS 强制。
> 3. **频率 vs 大小是一个真实的取舍。** 默认是每个 Saga 步骤一个 checkpoint（低频、大 delta）；watchdog 在 500s 处的自动 checkpoint（高频、小 delta）是安全网。不要凭直觉选其一；按"能承受多少返工"来选。
> 4. 文章 06 的 Saga 5 步是恢复契约，审计日志 + checkpoint 存储是恢复*证据*。两者可组合：Saga 步骤 3 和 4 之间崩溃后，留下的 `task_checkpoints` 行和 `audit.log` 行就是 `eket task:resume` 不需要人工介入就能读到的现场。
> 5. 审计日志是*产品面*。它涉及隐私问题（tool call 中的 PII、保留窗口、GDPR 删除权）。可观测性如果脱敏策略缺位，那就是在交付隐患。

---

## Executive Summary

**给决策者的速读（读这一段就够了）：**

| 问题 | 回答 |
|---|---|
| AI 智能体的黑盒问题是什么？ | Slaver 跑 30 分钟，吐出 1,200 行 diff，然后崩溃。30 分钟的推理在随进程一起死掉的 context window 里。模型不知道，人也不知道，无法回放。 |
| 究竟记了什么日志？ | `shared/audit.log` 中每个协议操作一行（`ISO8601 \| actor \| engine \| op \| target \| details`），加上 `task_history` 中每次状态变更一行。两边都 append-only。格式与 CAS 保证见 `node/src/core/state/audit.ts:23-37` 与 `node/src/core/sqlite-client.ts:222-233`。 |
| 究竟 trace 了什么？ | 4 级 span 树（`Workflow → Task → Step → ToolCall`），当 `EKET_TRACING=true` 时以 JSON 文件输出到 `~/.eket/traces/`。`Span` trait、`SpanContext::from_env` 开关、文件 exporter 见 `rust/crates/eket-core/src/tracing.rs:14-180`。 |
| 究竟 checkpoint 了什么？ | `task_checkpoints` 里的一行 `TaskCheckpoint`，列包括 `task_id`、`version`、`data`（JSON blob）、`updated_at`。由 `UPDATE ... WHERE version = ?` CAS 写入，见 `node/src/core/task-checkpoint.ts:85-108`。 |
| 恢复流程是怎样的？ | 文章 06 的 5 步 Saga（`validate → test → checkpoint → commit → notify`）。每一步单独幂等；恢复路径就是 `eket task:resume TASK-NNN`，它加载最新 checkpoint、跳过已执行的 tool call、从失败步骤重新跑 Saga。 |
| 运维看到什么？ | `web/app.js:563-662` 上的 web dashboard 以 5 秒轮询（`web/app.js:12-19`）展示 ticket 和 instance 实时状态；审计日志可以 `tail -f`；trace 目录可以浏览。没有"魔法按钮"——恢复是一条 CLI 命令，和所有其他协议操作一样。 |
| 代价是什么？ | 必须轮转审计日志（`scripts/log-rotate.sh:43-65` 默认 10 个文件 / 7 天压缩 / 30 天删除 / 10MB 上限），保持 60s 心跳（`node/src/core/slaver-watchdog.ts:67-68`），并决定 checkpoint 节奏。 |
| 不做会怎样？ | 文章 02 的四个协作痛点（丢上下文、冲突改动、review 不透明、没审计）会卷土重来，并且每个 PR 还附赠 5,000 token 的脚枪。 |

剩下的部分面向实现者、on-call 工程师，以及将来会被 Slaver 崩溃 paging 的人。

---

## Table of Contents

1. Motivation
2. The Big Idea — 三条可观测性支柱，各司其职
3. How It Works
4. Worked example — Slaver 在任务中途崩溃
5. 审计日志作为产品面
6. Dashboard — 它展示了什么
7. References

---

## 1. Motivation — AI 智能体的黑盒问题

文章 02（[`02-why-you-need-eket`](../02-why-you-need-eket/zh-CN/article.md:44-53)）列出了多智能体工作的四个痛点。本章聚焦的是即使协议已经就位、依然存活的*那一个*痛点：**模型本身的黑盒。**

一个跑 30 分钟、产出 1,200 行 diff 的 Slaver，在那 30 分钟里：

- 读了 40–200 个文件（粗略估算：中等仓库的一次 `grep` 涉及 ~60 个文件；一次 refactor 涉及 ~3 倍）。
- 调用了 200–500 次 tool（文件读、写、grep、shell、test 跑）。
- 触发并解决了 5–15 个测试失败（更糟的情况：把某些标记成"skip"但没告诉任何人）。
- 做出了没有任何人工 review 的决定，下一次会话模型自己也不会记得。

模型本身在设计上是无状态的，跨会话不连续。那 30 分钟的推理在 context window 里，进程一死就没了。如果 Slaver 在第 28 分钟崩溃，团队不知道：

- 哪些文件已经被改过（工作树只是部分状态）。
- 哪些决定被做出又被推翻（最终 diff 里只剩幸存路径）。
- 模型为什么选*这个*实现而不是另外两个它考虑过的（未来的 `task:replay` 需要这些）。
- Slaver 声称"通过"的那个测试到底过没过（Slaver 可能一直在幻觉绿色）。

这就是协议必须*在*文章 06 的状态机和文章 07 的存储*之上*解决的失败模式。模型可替换，状态是持久的，**审计日志是通向"模型到底干了什么"的唯一窗口**。如果这扇窗是模糊的，协议就只是形式。

> "一个只产出输出、却没有 trace 的 AI 智能体，就像一个只交钥匙、却从不告诉你车底修了什么的承包商。"
> — *EKET 设计笔记，2026-04*

修复方案不是"加更多日志"——那只会产生噪声。修复方案是**三条可观测性面分别回答三个不同问题**（第 2 节），加上一个 checkpoint 存储（第 3.3 节）和一个恢复 Saga（第 3.4 节），三者组合成人能模拟、Slaver 能重新加入的流程。

---

## 2. The Big Idea — 三条可观测性支柱，各司其职

本节是本文被工单明确要求的内容：**日志、tracing、指标不是同一件事**。本文不是要劝你戒掉"加更多日志"的反射，而是要你命名每个面回答什么、由谁读、用什么格式。

### 2.1 日志 —— "何时、由谁、发生了什么"

一行日志就是一个协议事件：一次状态变更、一次 tool call、一个 Saga 步骤。格式固定，写入是 append-only，读者是人或 `grep`。

EKET 的审计日志位于 `shared/audit.log`，由 `node/src/core/state/audit.ts:23-37` 写入：

```typescript
// node/src/core/state/audit.ts:29-37（原文）
const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const safeDetails = details.replace(/\|/g, '\\|');
const line = `${ts} | ${actor} | node | ${op} | ${target} | ${safeDetails}\n`;

const path = auditLogPath();
await mkdir(dirname(path), { recursive: true });
// O_APPEND 保证单次 write 原子
await appendFile(path, line, 'utf-8');
```

列结构是：`ISO8601 | actor | engine | op | target | details`。`details` 中的 `|` 用 `\|` 转义以保留列分隔符。`O_APPEND` 标志位是 POSIX 上写入原子的根本——Slaver 在写入中途崩溃时，留下的是旧行或新行，永远不会是半行。

**谁读：** on-call 工程师、Slaver 自己的 operator、以及 `scripts/check-debrief.sh:35-42`（它在合并区间的 git diff 中 grep 状态转为 `done` 的 ticket，并要求每个 ticket 都有对应的 memory 文件）。

**它*不*回答的：** 花了多久、什么触发了它、父级是谁。这些是 tracing 的工作。

### 2.2 Tracing —— "谁触发了什么、用了多久"

trace 是 span 树。一个 span 有名字、起始时间、结束时间、duration、父指针和一组任意的 attributes。trace 是这棵树，span 是节点。关系是因果关系：`ToolCall` span 是发起它的 `Step` span 的子节点；`Step` 是 `Task` 的子节点；`Task` 是 `Workflow`（也就是 Epic）的子节点。

EKET 的 tracing crate 是 `rust/crates/eket-core/src/tracing.rs`。四级定义在 `tracing.rs:14-20`：

```rust
// tracing.rs:14-20（原文）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpanLevel {
    Workflow,
    Task,
    Step,
    ToolCall,
}
```

层级关系在 `tracing.rs:22-31` 强制：`Workflow.child() == Some(Task)`，`Task.child() == Some(Step)`，`Step.child() == Some(ToolCall)`，`ToolCall.child() == None`。你不能让 `Task` 变成 `ToolCall` 的子节点，类型系统拦着你。

**默认是*不*开 tracing** —— `SpanContext::from_env`（`tracing.rs:255-267`）读 `EKET_TRACING` 环境变量，在 flag 关闭时返回 `NoOpSpan`。这是一个有承载力的选择：`NoOpSpan` 占用*零堆分配*（`tracing.rs:304-314` 的 `noop_span_no_heap_cost` 测试断言这一点），所以从不开启 tracing 的 Slaver 每次调用零成本。flag 翻为开时，`JsonFileExporter`（`tracing.rs:189-225`）把每个 span 写成一个 JSON 文件到 `~/.eket/traces/`。

**一个真实的插桩调用** —— 选举续约，来自 `rust/crates/eket-core/src/election.rs:347-350`：

```rust
// election.rs:347-350（原文，略作裁剪）
match result {
    Ok(1) => {
        consecutive_failures = 0;
        tracing::debug!("[Election] Redis lease renewed for {id}");
    }
```

读者可见的字段有：结构化前缀 `[Election]`、操作名（`Redis lease renewed`）、lease id（`{id}` 是由调用方填的 `format!` 占位符）。在结构化字段的世界里，这本来可以写成 `tracing::debug!(lease_id = %id, "Redis lease renewed")`，把 lease id 升格为一等字段——`tracing.rs:325-346` 的 `tracing_span_records_hierarchy` 测试就是这条路：它在 span 上设置 `set_attribute("epic_id", "EPIC-42")` 和 `set_attribute("ticket_id", "TASK-201")`，得到的 `SpanRecord.attributes` map 才是 exporter（Jaeger、OTLP、仓内置的 JSON exporter）的真正食粮。

**谁读：** Slaver 自己在重试时读。trace 是模型观察自身工作的窗口；恢复流程（第 3.4 节）通过 trace 知道哪些 tool call 已经成功过。

**它*不*回答的：** "进程在吗？""Redis 在吗？""内存预算还安全吗？"这些是指标的工作。

### 2.3 指标 —— "系统此刻健康吗？"

指标是带名字的数值，附时间戳，可选地打上维度标签。EKET 的指标很轻量，分两处：

1. **进程级指标** —— `node/src/health-check.ts:23-45` 暴露 `uptime` 和 `process.memoryUsage()`（heap used/total、RSS、external、使用率）成 JSON。`/api/status` 端点把这些与 Redis ping 延迟、SQLite `SELECT 1` 延迟组合成单次健康报告（`health-check.ts:130-151`）。

2. **领域级 gauge** —— `node/src/context-monitor.ts:25-46` 与 Rust 镜像 `rust/crates/context-mon/src/main.rs:12-23` 在每次轮询时发出一条 JSON 行，包含模型当前的 token 用量与阈值档位（`safe` / `warn` / `danger`）。阈值固定为 70,000 与 85,000 token（`context-monitor.ts:26-28`；`context-mon/src/main.rs:13`）。输出是 append-only 到 `logs/context-monitor.jsonl`，并**在 stdout 上以可解析的 JSON 出现**：

   ```typescript
   // context-monitor.ts:40-62（原文）
   const logEntry: LogEntry = {
     timestamp: Date.now(),
     tokens: result.tokens,
     method: result.method,
     threshold: getThreshold(result.tokens),
     duration: result.duration
   };
   // ...
   console.log(JSON.stringify({
     tokens: result.tokens,
     method: result.method,
     threshold: logEntry.threshold
   }));
   ```

   退出码是与外部脚本的*契约*：`0` 表示 safe，`1` 表示 warn，`2` 表示 danger，`3` 表示错误（`context-monitor.ts:65-78`）。shell 循环可以 `set -e; while true; do context-monitor || break; done`，让 Slaver 在把模型 OOM 之前先自检点。

**谁读：** 运维 dashboard、Slaver 自己的 pre-flight 检查、on-call 工程师。dashboard 每 5 秒轮询 `/api/status`（`web/app.js:13`），展示 `Redis: ●`、`SQLite: ●`、降级级别（`web/app.js:489-534`）。

**它*不*回答的：** Slaver 在指标穿越阈值时到底*在*做什么。要回答那个，需要日志和 trace。

### 2.4 三支柱组合，不互相替代

诱惑是把 tracing 叫"结构化日志"，把指标叫"计数日志"。顶住诱惑。三支柱存在是因为它们回答三个不同的问题：

- "14:32:01.123 时发生了什么？" → **日志**（一条审计行、一个心跳文件、一行状态变更）。
- "是什么工作链把它引出来的、每步花了多久？" → **trace**（一棵带 duration 和父节点的 span 树）。
- "进程*此刻*健康吗？" → **指标**（一个 gauge、一个 counter、一个心跳新鲜度）。

一条写着 `"lease renewed"` 的 `tracing::info!` *不是*日志行——它没有 `actor`、没有 `target`、没有审计语义。一条写着 `Slaver-B | node | task:complete | TASK-642 | success` 的审计行*不是*trace——它没有父节点、没有 duration、没有因果上下文。一个 `0.77ms enqueue` 的数字*不是*日志——它没有 actor、没有语义、没有时间戳语义。**协议把这三件事当作三件不同的事，三种不同的 schema，三种不同的读者，三种不同的保留策略。** 把它们混为一谈，是智能体系统中最常见的可观测性错误，也是本文最坚决不去犯的那种。

---

## 3. How It Works

这一节最长。我们依次走每条可观测性面，然后是 checkpoint 存储，然后是恢复 Saga。

### 3.1 结构化日志 —— 字段、correlation ID、轮转

审计日志格式在所有引擎中是固定的。契约写在 `node/src/core/state/audit.ts:5-7`：

```typescript
// node/src/core/state/audit.ts:5-7（原文，略作裁剪）
 * 规范: Shell 对应 lib/state/audit.sh
 * 格式: ISO8601 | actor | engine | op | target | details
 * 跨引擎的每行必须字节等价（除时间戳与 engine 列）。
```

每个协议操作恰好发出一条。`actor` 是 node id（`getNodeId()` 来自 `state/env.js`）；`engine` 是 `node`（其他实现是 `rust`、`shell`）；`op` 是协议操作名（`task:claim`、`task:complete`、`gate:review` 等，完整列表见 [`GLOSSARY.md`](../GLOSSARY.md:18)）；`target` 是 ticket id；`details` 是自由字符串，里面的 `|` 要转义。

**Correlation ID。** 审计日志*不*用显式的 `correlation_id` 字段；关联靠 `target` 列。想知道 "TASK-642 的所有操作" 的人跑 `grep "TASK-642" shared/audit.log` 即可。这是刻意的：协议把 ticket 当作工作单元，ticket id 才是自然的关联键。再加一个独立的 correlation id 反而冗余；底层存储（`task_history.ticket_id`、`task_checkpoints.task_id`、`task_messages.task_id`）用的就是同一个键。

**轮转策略。** 脚本是 `scripts/log-rotate.sh`。默认值从 `.eket/config/memory_log.yml` 的第 47-50 行加载，fallback 在第 53-57 行：

| 配置项 | 默认值 | 效果 |
|---|---|---|
| `max_files` | 10 | 日志文件总数上限（最旧的先淘汰）。 |
| `compress_after_days` | 7 | 超过此天数的 `.log` 文件被 `gzip`。 |
| `delete_after_days` | 30 | 超过此天数的 `.gz` 与 `.log` 文件被 `rm`。 |
| `max_file_size_mb` | 10 | 超过此大小的文件被 `split -b 10M`。 |

四个操作按顺序执行：`delete_old_logs`（76-104 行）、`compress_old_logs`（106-127 行）、`limit_file_count`（129-157 行）、`limit_file_size`（159-192 行）。第 224 行的 `--dry-run` 标志可以打印会做什么而不真做。`generate_report` 函数（194-217 行）写一份 `rotation-report-<timestamp>.txt`，记录配置和轮转后目录清单——那就是审计日志脚本自己的审计。

推荐模式是 cron 每天 02:00 跑 `bash scripts/log-rotate.sh`。`limit_file_count` *每次运行*都强制上限；一次日志爆炸最多到 `max_files * max_file_size_mb`（默认 100 MB）。

**on-call 看到什么。** 一次典型的排障：

```bash
$ grep "TASK-642" shared/audit.log
2026-06-04T10:02:00Z | slaver-b | node | task:claim | TASK-642 | checkpoint_version=0
2026-06-04T10:02:05Z | slaver-b | node | task:branch | TASK-642 | feature/TASK-642-article-06
2026-06-04T10:35:22Z | slaver-b | node | task:checkpoint | TASK-642 | version=4 step=1.5
2026-06-04T10:42:18Z | slaver-b | node | task:complete | TASK-642 | validate=test test=pass checkpoint=ok commit=ok notify=ok
2026-06-04T10:43:01Z | master-a | node | gate:review | TASK-642 | approved
2026-06-04T10:43:05Z | master-a | node | task:merge | TASK-642 | testing→main→miao
```

五行、两个 actor、一个 ticket。一次 41 分钟运行的全部生命周期，五行 `grep` 就能拿得出来。这就是审计日志的设计目标。

### 3.2 Tracing —— Rust tracing crate、Node hook、被插桩的内容

Rust 侧是规范的实现。Node 侧用 hook 镜像——当一个 tool call 落地时，Slaver 的 Claude Code / Cursor / Codex 适配器把 span 事件发到同一个 trace 目录。

**Span 树。** 来自 `rust/crates/eket-core/src/tracing.rs:11-20`，四级是固定阶梯：

| 级别 | 拥有者 | 典型时长 | 通常设置的 attribute |
|---|---|---|---|
| `Workflow` | Master | 1–24 小时（一个 Epic） | `epic_id`、owner、预期 ticket 数 |
| `Task` | Slaver | 5–120 分钟（一个 ticket） | `ticket_id`、`assignee`、`priority`、`branch` |
| `Step` | Saga 步骤 | 30s–10 min（validate / test / checkpoint / commit / notify） | `step_name`、`attempt`、`compensation_errors` |
| `ToolCall` | LLM tool dispatcher | 100ms–5s（file read、edit、grep、shell） | `tool`、`input_sha`、`output_sha`、`duration_ms` |

attribute 集才是让 trace *可查询* 的东西——不是名字，不是 duration。没有 attribute 的 trace 只是时序数据。`tracing.rs:325-346` 的 `tracing_span_records_hierarchy` 测试就是 attribute 约定的参考：它在 `Workflow` 上设 `epic_id`，在 `Task` 上设 `ticket_id`，得到的 `SpanRecord.attributes` 是一个 `HashMap<String, String>`，等着被导出。

**开关。** `EKET_TRACING` 是一个布尔环境变量，在 `tracing.rs:255-267` 读取：

```rust
// tracing.rs:255-267（原文，略作裁剪）
pub fn from_env() -> Self {
    let enabled = std::env::var("EKET_TRACING")
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(false);

    let exporter: Arc<dyn SpanExporter> = if enabled {
        Arc::new(JsonFileExporter::new())
    } else {
        Arc::new(NoOpExporter)
    };

    Self { enabled, exporter }
}
```

默认是 `false`。`tracing.rs:240-244` 的 `NoOpExporter` 拥有空的 `export` 函数体；`tracing.rs:46-62` 的 `NoOpSpan` 在每个方法上都有 `#[inline(always)]`，所以从不设置环境变量的 Slaver 每次调用零成本。`tracing.rs:304-314` 的 `noop_span_no_heap_cost` 测试是这条属性的回归护栏。

**Node hook。** 协议的 Node 侧使用一个 *hook server*（`node/src/hooks/`），把 LLM tool call 翻译成 span 事件。hook 由 tool 适配器（Claude Code 的 `PostToolUse`、Cursor 的 `afterShell` 等）调用，把 JSON span 写到同一个 `~/.eket/traces/` 目录。格式与 Rust `JsonFileExporter` 输出兼容；通过一个 `trace_id` 字段在父 `Task` span 上共享，Slaver 认领 ticket 时设置，`task:resume` 时再读回。

**一个端到端的插桩路径。** 当 Slaver 的模型决定读一个文件时，顺序是：

1. LLM 发出一段 `tool_use`，`name: "Read"`，`input: {"file_path": "/repo/src/foo.ts"}`。
2. Slaver 的 tool dispatcher（`node/src/core/claude-runner.ts`）打开一个 `ToolCall` span，调用 `set_attribute("tool", "Read")`、`set_attribute("input_sha", sha256(input))`，并记下父 `Step` span id。
3. dispatcher 调用 tool；返回时设置 `set_attribute("output_sha", sha256(output))`、`set_attribute("duration_ms", elapsed)`，然后关闭 span。
4. 关闭的 span 被导出为 `~/.eket/traces/toolcall-<uuid>.json`，包含 `tracing.rs:66-76` 列出的 `SpanRecord` 字段。

trace 目录的读者可以还原 Slaver 的会话：按 `start_ts` 排序，沿 `parent_id` 走，找到产生文件编辑的 `tool_use` 块，把 `input_sha` 跟工作树比对，看模型当时实际看见的是什么。

**tracing vs 日志 vs 指标，一句话。** tracing 是*带 duration 和输入的树*。日志是*一行行事件的列表*。指标是*随时间变化的命名数值的列表*。把它们混为一谈是范畴错误，协议的存储层把它们放在三个不同文件、三种不同 schema 里，让边界处不可能犯范畴错误。

### 3.3 Checkpoints —— 何时、写什么、多久一次

checkpoint 存储是 `node/src/core/task-checkpoint.ts`。schema 是 `task_checkpoints(task_id PK, data TEXT, version INTEGER, updated_at INTEGER)`，写入原语是 `version` 上的 CAS UPDATE。本节是工单明确要求的那一节：**频率 vs 大小的取舍，以及什么情况下选哪个？**

#### 3.3.1 checkpoint 里有什么

`data` 列是一个 JSON blob，遵循 `TaskCheckpoint` 类型，定义在 `task-checkpoint.ts:210-222`：

```typescript
// task-checkpoint.ts:210-222（原文）
export function createEmptyCheckpoint(taskId: string): TaskCheckpoint {
  const now = Date.now();
  return {
    taskId,
    stepIndex: 0,
    agentFacingItems: [],
    fullHistoryItems: [],
    executedToolCalls: [],
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}
```

三层是显式设计选择（见 `task-checkpoint.ts:1-10` 的文件头）：

- `agentFacingItems` —— 模型看到的对话视图。已裁剪、已摘要、已排序。
- `fullHistoryItems` —— 逐字的转录，包括 tool call、guardrail 失败、人为介入。
- `executedToolCalls` —— 已经执行过的 `tool_call_id` 列表，用于 resume 时的幂等性（见 `task-checkpoint.ts:160-168` 的 `isToolCallAlreadyExecuted`）。

新的 Slaver 读到这个 blob 时，跳过 `executedToolCalls` 里每一个 tool call（从 `fullHistoryItems` 返回缓存输出），并从 `stepIndex` 处续上。幂等性由*应用层*的检查和*数据库*的 `UPDATE ... WHERE version = ?` CAS *双重*保证——第二个 Slaver 在第一个已经把 `version` 从 N bump 到 N+1 之后才尝试，会看到 `info.changes === 0` 并抛出 `CheckpointCASError`（`task-checkpoint.ts:85-108`）。

#### 3.3.2 频率 vs 大小的取舍

这是 Slaver 的作者必须回答的问题，答案取决于三件事：任务跑多久、每次 tool call 多贵、模型需要多少状态才能重建。

**频率 = 高（每 5–10 次 tool call，或每 ~60s）。** 得到：崩溃恢复时间最多 60s 返工，`executedToolCalls` 列表逐步增长。付出：数据库上的 CAS UPDATE 更多，`data` blob 更大（每次 checkpoint 序列化整个 `fullHistoryItems` 数组，体积随 tool call 数线性增长），运维读 trace 也要读更多。

**频率 = 低（每个 Saga 步骤一个，或每个 phase 一个）。** 得到：每次 checkpoint 都很小（与上次的 delta），数据库写入稀，trace 短。付出：30 分钟运行在第 25 分钟崩溃，最多丢 25 分钟的 tool call；`task:resume` 必须重跑它们并靠 `executedToolCalls` 列表识别重复——但那些*没赶上* checkpoint 的 tool call 根本不在列表里。

**何时 checkpoint：**

- **在任何非幂等的 tool call 之前。** `git push`、`git commit`、`gh pr create`、`npm publish`——这些安全地重试不了。checkpoint 必须在 call *之前*，不是之后；call 中途崩溃会让系统处于一个下一个 Slaver 无法分辨的状态——"它没发生" 还是 "它发生了一半"。
- **在 Saga 的步骤边界之前。** 第 3 步（`checkpoint` 自身）和第 4 步（`commit`）是最关键的边界；第 4 步之前的 checkpoint 保证 commit 能从已知状态重试。（这正是 Saga 第 3 步*本身*——步骤边界上的 checkpoint。完整表见 [`docs/articles/06-master-slaver-protocol/zh-CN/article.md:232-236`](../06-master-slaver-protocol/zh-CN/article.md)。）
- **在 context-window 告警时。** `context-monitor.ts` 的第 65-78 行在模型 token 预算跨越阈值时以退出码 `1`（warn）或 `2`（danger）退出。读到这个退出码并在下次 model call 之前触发紧急 checkpoint 的 Slaver，买下了一个带完整上下文的恢复点。Watchdog（第 3.3.3 节）把这步自动化。
- **在长跑 phase 的 50% 处。** 一条经验法则：如果预期某 phase 跑 10 分钟，就在第 5 分钟 checkpoint。50% 是"事情快要出岔"最可能发生的点——模型此时已经积累足够多、处于脆弱位置，但又没多到 checkpoint 很贵。

**何时 *不* checkpoint：**

- **紧的读循环里。** 跑 200 次、且没有副作用的 grep 循环不需要 200 个 checkpoint。模型 resume 时可以重跑，输出是确定性的。
- **LLM call 中途。** 在 model call 中间的 checkpoint 会带回来"这个 tool 还在算"的半成品状态。两次调用之间若结果不同，幂等性就破了（模型提供方在重试时也可能返回不同结果）。
- **每秒多于一次。** CAS UPDATE 本身便宜（一个 SQL 行，WAL-write），但 `fullHistoryItems` 的 JSON 序列化不便宜。在一个长会话里每个 model turn 都 checkpoint 的 Slaver，会发现 checkpoint 成本压倒了运行时。
- **每次成功状态变更之后。** 状态机本身已经在 `task_history` 里记录了变更。除非下一步是非幂等的，再叠一层 checkpoint 是冗余的。

#### 3.3.3 Watchdog —— 自动的高频 fallback

`SlaverWatchdog`（`node/src/core/slaver-watchdog.ts:42-261`）是安全网。两个计时器并行运行：

- **心跳（60s）** —— `slaver-watchdog.ts:67-68, 96-102` 每 60s 向 `.eket/state/slaver-<taskId>-heartbeat` 写一次心跳文件，字段包括 `timestamp`、`taskId`、`elapsed`、`status`（`slaver-watchdog.ts:116-123`）。dashboard 读这个来把 instance 标为 `online` 或 `offline`（30s 阈值在 `web/app.js:15`）。
- **超时告警（500s）** —— `slaver-watchdog.ts:66, 142-149` 调度一个 500 秒的 `setTimeout`。触发时，`slaver-watchdog.ts:154-184` 的 `handleTimeoutWarning` 触发一次*自动 checkpoint*，带 `reason: 'watchdog_timeout_prevention'`，然后同步 flush 到磁盘。

500s 阈值是"事情花了太久，保留状态"的 cutoff。它是*高频小 delta* 的 checkpoint：自上次步骤边界 checkpoint 之后的工作由一次 CAS UPDATE 捕获，所以 600s 时崩溃最多丢 100s 工作。60s 心跳是独立的——它*不* checkpoint，只回答"Slaver 还活着吗？"。

读者注意：watchdog 通过 `WatchdogOptions.enableAutoCheckpoint`（默认 `true`，`slaver-watchdog.ts:68`）可关闭。对于 checkpoint 成本高、恢复成本低的 task（一次快且可重试的 build step），Slaver 作者可以关掉它。默认对大多数 task 都是对的，关闭只是逃生口。

### 3.4 Saga 恢复 —— 5 个单独幂等的步骤

Saga 5 步是恢复契约。它在 [文章 06, §3.4](../06-master-slaver-protocol/zh-CN/article.md:224-272) 已经详述。本节不复述那张表；只点出**每一步的幂等性契约**以及它如何与 §3.1 的审计日志和 §3.3 的 checkpoint 组合。

| 步骤 | 什么幂等 | 什么*不*幂等 | 磁盘上的证据 |
|---|---|---|---|
| 1. `validate` | 验收标准检查（`CompletionValidator.checkAcceptanceCriteria`）只读。 | 无 —— 没有副作用。 | `task_history` 里一条带校验时间戳的行。 |
| 2. `test` | 测试运行器可重跑；`npm test` 是确定性的。 | 失败的测试可能在 `target/`、`dist/` 等留下半成品。 | Slaver 进程日志中的测试 runner stdout。 |
| 3. `checkpoint` | `TaskCheckpointStore.saveCheckpoint` 是 CAS；用同一个 `version` 调两次，第二次是 no-op。 | `executedToolCalls` 列表在每次调用时增长——但增长是*幂等*的（`task-checkpoint.ts:166-168` 的 `includes` 检查防重复）。 | `task_checkpoints` 里 `version = N+1` 的一行。 |
| 4. `commit` | `git add` + `git commit` *不*幂等——相同的已暂存文件再 `git commit` 一次会产生空提交。Saga 通过*不*跑第 4 步两次来补偿。 | 从第 4 步起的重试必须先 `git reset --soft HEAD~1`。 | 审计日志中 `task:complete` 这一行的 commit hash。 |
| 5. `notify` | `EventBus.publish` 是进程内的；调两次产生两个事件。订阅者必须幂等。 | `gh pr create` API 调用*不*幂等——重试会创建第二个 PR。Saga 通过按 branch 查找已有 PR 来补偿。 | `task_history` 里的 PR URL。 |

逆序补偿是契约。`rust/crates/eket-core/src/saga.rs:233-288` 的单元测试 `middle_step_fails_rolls_back` 是回归护栏：第 3 步失败时，第 2 步和第 1 步必须按*这个*顺序被补偿，而不是反过来。反过来会削弱该属性，因为第 2 步的补偿可能依赖第 1 步的前向效果先被撤销。

**新 Slaver 怎么恢复。** 恢复流程就是 `eket task:resume TASK-NNN`。步骤：

1. `loadCheckpoint(taskId)` 读 `task_checkpoints`（见 `task-checkpoint.ts:113-136`）。
2. 新 Slaver 把 `data` 反序列化成 `TaskCheckpoint`，读出 `version`、`stepIndex`、`executedToolCalls`、`agentFacingItems`、`fullHistoryItems`。
3. Slaver 从 `agentFacingItems`（裁剪后的对话）重建模型视图，然后通过 `task:claim` 重新把自己挂回 ticket（`task:claim` 本身就是一个 CAS —— 见 [文章 06, §3.3](../06-master-slaver-protocol/zh-CN/article.md:153-167)）。
4. Slaver 在 `stepIndex` 处续上，调用下一个 Saga 步骤。对于它要发的每个 `tool_call_id`，先查 `isToolCallAlreadyExecuted`（`task-checkpoint.ts:160-168`）；若在 `executedToolCalls` 中，就从 `fullHistoryItems` 返回缓存输出，不再发。
5. 成功时，Saga 跑到第 5 步，ticket 转为 `IN_REVIEW`。

恢复是*可观测性锚定*的：读审计日志里的 `task:resume` 就能看到 Slaver 何时重新加入；读 `task_checkpoints.version` 就知道多少状态存活；对比 `executedToolCalls` 列表与新 Slaver 的 tool call 就能看出跳过了什么。trace 目录里既有旧 Slaver 的 span（崩溃前关闭），又有新 Slaver 的 span（resume 后打开）；两者通过共享的 `parent_task_id` attribute 关联。

**Saga *不*做的事。**

- 它*不*重试 LLM。如果 LLM 提供方挂了，Saga 第 4 步（commit）会在 `git push` 处失败，Slaver 应当退避并稍后重试整个 Saga。
- 它*不*回滚模型的副作用。如果一个 `Write` tool call 落地、Slaver 在 checkpoint 之前就崩了，那个文件就以半成品状态留在磁盘上。新 Slaver 看见这个半成品状态，应当*检测*到它（工作树里的文件哈希不匹配），要么补完工作，要么 `task:abort` 重来。
- 它*不*在事务里跑。SQLite 事务是短的；Saga 是分钟级的。协议的原子性是*每步*的，不是*每个 Saga*的。所以每一步单独幂等。

---

## 4. Worked example — Slaver 在任务中途崩溃

本节让恢复流程可测试。读者只要装了 `node` 和 `sqlite3`，就能在工作站上复现每一步。

**准备。** 一个 Slaver（Claude Code，role `slaver`，specialty `tech-writer`）在 t=0 认领了 `TASK-642`。协议触发：

```sql
-- node/src/core/sqlite-client.ts:972（概念版本；完整片段见文章 07）
UPDATE tickets
SET status = 'in_progress', assignee = 'slaver-b', claimed_at = datetime('now')
WHERE id = 'TASK-642' AND status = 'ready';
-- info.changes = 1 → 认领成功
```

Slaver 创建 worktree，逐步跑 Saga 步骤，到 t=8m 时已经：

- t=2m 时第 1 步（`validate`）通过。
- t=4m 时第 2 步（`test`）通过。
- t=4m05s 一次 checkpoint —— `version = 1`，`data` 里有 47 次 tool call 在 `executedToolCalls` 中。
- t=6m 时第 3 步（又 checkpoint）—— `version = 2`，89 次 tool call。
- LLM 刚发出一段 `Write` tool call，要把 `docs/articles/06-master-slaver-protocol/zh-CN/article.md` 写成 4,500 行；Slaver 进程即将调用 `git add`。

**崩溃。** t=8m03s，LLM 提供方返回 503。Slaver 进程在下一次 checkpoint 之前被上游脚本的 `set -e` 杀掉。进程以 137（OOM）或 143（SIGTERM）退出——对协议而言，区别不重要。

**t=8m03s 磁盘上的状态：**

1. `tickets` 表：`TASK-642` 处于 `status = 'in_progress'`，`assignee = 'slaver-b'`，`claimed_at = '2026-06-04T10:02:00Z'`，`checkpoint_version = 2`。
2. `task_checkpoints` 表：`TASK-642` 一行，`version = 2`，`data` 是 t=6m 的 JSON blob（89 次 tool call，包括 t=5m 那次 4,200 行的 `Write`）。
3. `task_history` 表：`TASK-642` 三行——`ready → in_progress`（认领），以及两条中间的 `checkpoint`。
4. `shared/audit.log`：`TASK-642` 下面七行——`task:claim`、`task:branch`、两次 `task:checkpoint`、两条 Saga 步骤记录，以及写到一半的 `task:complete` 起始行。
5. worktree 在 `.eket/worktrees/slaver-b/TASK-642/`：t=5m 那次 4,200 行的文件在磁盘上；那个飞行中的 4,500 行文件写到一半，只落了前 3,800 行（LLM 的流在 ~152,000 字节处被打断）。
6. `~/.eket/traces/` 目录里有所有 89 次执行过的 tool call 的 span，`parent_id` 指向父 `Step` 和 `Task` span。

**检测。** 三个信号在数秒内触发：

1. Slaver 的心跳文件（`.eket/state/slaver-TASK-642-heartbeat`）在 t=9m 之后停止更新。SlaverWatchdog（若与 Slaver 进程同跑）在 `close()` 时写一条 `closed` 状态（`slaver-watchdog.ts:249`）；如果进程是被杀掉的，心跳就直接停了。
2. Dashboard 的 5 秒轮询在 t=9m30s（30s 阈值，`web/app.js:15`）把 `slaver-b` 标为 `offline`。状态点从绿变灰（`web/app.js:609`）。
3. Master 收到来自 Slaver-Watchdog 的 watchdog-of-watchdogs 的 `master_chores` 告警（Master 进程轮询心跳文件，把心跳超过 3 分钟的 `in_progress` ticket 重新认领）。

**恢复。** 人类 Master（或自动 watcher）跑：

```bash
$ eket task:resume TASK-642
[INFO] Loading checkpoint for TASK-642 (version=2)
[INFO] Skipping 89 tool calls already executed
[INFO] Detected partial write: docs/articles/06-.../zh-CN/article.md (3800/4500 lines)
[INFO] Choice required:
  1) Discard partial write and resume from stepIndex
  2) Complete the partial write manually, then resume
  3) task:abort and start over
> 1
[INFO] Discarding partial write
[INFO] Restoring 4200-line version from t=5m
[INFO] Re-claiming ticket TASK-642 (CAS UPDATE)
[INFO] Re-entering Saga at stepIndex
[INFO] Step 4 (commit) starting from version=2
[INFO] Re-running 12 tool calls (the 89 prior calls were skipped)
[INFO] Saga complete: validate=pass test=pass checkpoint=ok commit=ok notify=ok
[INFO] PR opened: https://github.com/godlockin/eket/pull/642
[INFO] Audit log line written: 2026-06-04T10:14:22Z | slaver-c | node | task:complete | TASK-642
```

dashboard 里运维看到：`web/app.js:631-662` 的 ticket 行在 t=14m22s 时从 `in_progress`（橙点）翻到 `review`（蓝点）。新出现 `slaver-c` 这一行（新的 Slaver，与崩溃的 `slaver-b` 不同），带新 instance id、`currentTaskId` 字段显示 `TASK-642`、`lastHeartbeat` 每 5s 刷新一次。崩溃*不*直接出现在 dashboard 上——它出现在审计日志（`grep "slaver-b" shared/audit.log | grep TASK-642`）和 trace 目录（`slaver-b` 已关闭的 span 与 `slaver-c` 的新 span 在同一目录里）。

**幂等性的保留。** 旧 Slaver 的 89 次 tool call 不会*重发*——新 Slaver 从 checkpoint 读 `executedToolCalls`（`task-checkpoint.ts:160-168`），看见那 89 个 `tool_call_id`，跳过它们。t=6m 之后那 12 次 tool call（即 `version = 2` 之后的工作）会重发，但工作树状态由文件哈希检测：t=8m 飞行中的 `Write` 留下的半成品 SHA-256 是 `a3f5e8d2...`（与 t=5m 的 4,200 行版本哈希 `b1c2d3e4...` 不同），Slaver 的 tool dispatcher 拒绝重发一个目标哈希已经在磁盘上的 `Write`。用户被提示（上面的 `Choice required` 块）决定丢弃还是补完半成品——协议不静默合并。

**如果 Slaver 在 resume *过程中* 崩溃呢？** `version` 上的 CAS 保护恢复：第二次 `task:resume` 看见 `version = 2` 并尝试 bump 到 `3`，会被 `info.changes === 0` 拦下，第二次 resume 被告知重新加载。这与普通 Saga 的第 3 步模式相同，相同的补偿逻辑适用。

**如果数据库损坏呢？** `bash scripts/backup-sqlite.sh list` 列出最近的已验证备份。`bash scripts/backup-sqlite.sh restore` 重建数据库，`task_checkpoints` 行被重载，恢复继续。流程见 [文章 07, §5.4](../07-storage-and-events/zh-CN/article.md:481-491)，在小数据库上 ≤ 30 秒。

---

## 5. 审计日志作为产品面 —— 谁能看到什么、隐私 / 合规考量

审计日志不是开发者便利。它是*产品面*——合规官、客户、律师都可能要看的记录。可观测性如果没搭配隐私故事，就是在交付隐患。本节点出三个具体考量以及 EKET 对每个的回应。

### 5.1 三类受众、三种视图

| 受众 | 他们的需要 | 他们拿到的 | 在哪 |
|---|---|---|---|
| **On-call 工程师** | "TASK-642 刚才发生了什么？" | 按 ticket id 过滤的 `shared/audit.log` 最近 100 行。 | `tail -f shared/audit.log \| grep TASK-642` |
| **合规官** | "过去 30 天谁访问了 PII？" | `task_history` 表，SQL `WHERE details LIKE '%email%' OR details LIKE '%@%'`。 | `sqlite3 .eket/data/sqlite/eket.db "SELECT * FROM task_history WHERE details LIKE '%@%' ORDER BY created_at DESC LIMIT 100"` |
| **客户** | "你的模型拿我的数据做了什么？" | 脱敏后的导出：ticket id、时间戳、tool call *类型*（不含输入/输出）。 | `eket audit:export --ticket TASK-642 --redact`（计划在 v2.15） |

*同一份*审计数据服务三类受众。协议不维护分开的"dev log"和"compliance log"——那是漂移之路，漂移是事故之路。

### 5.2 PII 脱敏 —— 默认

审计日志格式是 `ISO8601 | actor | engine | op | target | details`。`details` 列是自由格式。**如果一个 Slaver 跑了一个读 PII 文件的 `Read` tool call（客户名单、测试固件里的信用卡号、数据库 dump），并且 tool 适配器比较天真，那么*文件路径*以及*文件内容*都会通过 `tool:executed` 这个 op 写进审计日志。**

截至 v0.6 的生产行为是：

- `task:complete` 操作的审计日志行只记录*变更文件列表*，不记录内容（[`docs/articles/06-master-slaver-protocol/zh-CN/article.md:236`](../06-master-slaver-protocol/zh-CN/article.md) 显示 Saga 第 4 步只记 commit hash 和变更文件列表）。
- trace 目录中 `ToolCall` span 记的是 `input_sha` 和 `output_sha`（输入输出的 SHA-256），不是输入输出本身（`tracing.rs:152-155` 的 `set_attribute` 收 `&str`，约定是设哈希不是设内容）。
- `task_messages` 表存的是完整对话；这是协议层面 PII 唯一可能泄露的地方，受 `WAL` 保留策略约束（见 §5.3）。

**当前*没*脱敏的：** 任何审计行的 `details` 列、`task_checkpoints` 的 `data` 列、`message_history` 的 `payload` 列。一个 Slaver 写下 `audit('tool:executed', 'TASK-642', 'slaver-b', 'Read(/repo/customers.csv with 4,200 rows)')` 就会泄露文件路径和行数——不是内容，但足以让攻击者知道这个文件存在且很大。

**建议的加固**（v2.10+ 跟踪中，TODO 文件 [`docs/adr/ADR-005-pii-redaction.md`](../../../adr/ADR-005-pii-redaction.md) 待写）：

1. `audit()` 上的脱敏中间件，对 `details` 按可配置的白名单 pattern（email、SSN、信用卡正则、匹配 `.env`/`id_rsa` 的文件路径）做脱敏。
2. ticket 上一个 `data_classification` 字段，控制脱敏等级（`public` / `internal` / `confidential` / `restricted`）。
3. 一个独立的、加密的 `task_messages_pii` 表，存脱敏后的对话，重新加密的密钥由安全官而不是开发者持有。

协议的立场是：**脱敏是部署者的责任，但 schema 必须让它做得到。** `details` 列是 `TEXT` 不是 `BLOB`，脱敏 hook 在 `audit()` 调用点而不是数据库里——这意味着脱敏行是*普通*行，schema 相同；未脱敏的部署是响亮可见的（审计日志显原始行；脱敏的部署显带 `[REDACTED]` 的同一行）。

### 5.3 保留窗口 —— GDPR 删除权的含义

GDPR 第 17 条（"被遗忘权"）给予欧盟数据主体要求删除其个人数据的权利。协议的存储层在三处触及此点：

1. `task_messages.content` —— 完整对话日志，包括模型见过的任何 PII。读过客户邮件并在 tool call 里回引的 Slaver，已经把邮件存进 `task_messages`。
2. `audit.log` —— `details` 列在 Slaver 脱敏不完整时可能含 PII。
3. `task_checkpoints.data` —— `agentFacingItems` 与 `fullHistoryItems` 层含逐字转录。

保留策略在 `scripts/log-rotate.sh:43-65`：`delete_after_days = 30` 是默认值。对 GDPR 合规而言，30 天*不够*——客户数据最后被处理后 30 天，它从审计日志里*消失*了，但还在 `task_messages`（没有内建轮转）里，还可能在 `task_checkpoints`（在 `task:complete` 时被删——见 `task-checkpoint.ts:141-154`——但审计日志条目*不*被删）里。

**欧盟部署的推荐配置：**

- `log-rotate.sh:delete_after_days = 7`（激进）
- 一个每晚的 `task_messages:prune` 任务，删除比同 `task_id` 最近一次 `task:complete` 更老的行（即 ticket 关闭时，对话日志被清空）
- 一个文档化的删除请求处理流程：`eket audit:erase --ticket TASK-NNN --reason "GDPR Article 17"`（计划在 v2.12），它调用 `deleteCheckpoint`、修剪 `task_messages`、并在 `audit.log` 里写一条 tombstone 行

协议不能单独强制 GDPR；它只能*让强制成为可能*。schema 足够小、保留旋钮足够显式，合规官不用读代码库就能审计部署。

### 5.4 "debrief" 政策 —— 交付必须伴随知识

另一个合规考量：`scripts/check-debrief.sh:1-95` 强制要求每个 `done` 的 ticket 都有 `confluence/memory/` 下的对应 memory 文件。脚本第 35-42 行在 git diff 里 grep 状态转为 `done` 的 ticket；80-83 行把每个 ticket id 跟 memory 文件路径匹配。ticket 合并时若没有 memory 文件，CI 闸门会失败。

这不是隐私；是*知识保留*。政策是"我们不会在没有 retrospective 的情况下关闭 ticket；否则学到的教训就跟着学到它的 Slaver 一起死了。"对一个 1–5 人 + N agent 的团队，代价是每个 ticket 一个文件；收益是下一个 Slaver（或下一个人）不必重导上一个已经知道的东西。脚本 95 行，在一个典型 PR 上跑 <100ms；没理由不开。

---

## 6. Dashboard —— web/ 目录、它展示的内容

dashboard 是运维观察协议的窗口。它是一个静态资源目录，由 Node API server 挂载；源码是 `web/app.js`（唯一的 JavaScript 文件）和 `web/index.html`（标记层，本文不展开）。目录在 `web-server.ts:63` 挂载（见 `web/README.md:11`）：

```typescript
// web/README.md:11（原文）
staticPath: config.staticPath || path.resolve(__dirname, '../../../web'),
```

**刷新节奏。** `web/app.js:12-19` 声明配置：

```javascript
// web/app.js:12-19（原文）
const CONFIG = {
  REFRESH_INTERVAL: 5000, // 5 秒
  API_BASE: '',
  STALE_HEARTBEAT_MS: 30000, // 30 秒无心跳视为过期
  SUPPORTED_LOCALES: ['en-US', 'zh-CN'],
  DEFAULT_LOCALE: 'zh-CN',
  STORAGE_KEY: 'eket_dashboard_locale',
};
```

每 5 秒，dashboard 调用 `/api/dashboard`（`web/app.js:374`）、`/api/status`（`web/app.js:394`）、`/api/instances`（`web/app.js:408`）、`/api/stats`（`web/app.js:422`），并重渲染四个面板。

**系统状态面板。** 左上面板展示降级级别（L0/L1/L2/L3）以及 Redis、SQLite、消息队列的连接状态。渲染函数是 `web/app.js:489-534`（`renderSystemStatus`）。三个状态指示器（`●` 表示已连接，`○` 表示未连接，见 `web/app.js:524-533`）是运维一眼看出"有没有东西着火"的答案。

**统计面板。** 聚合计数：instance 总数、活跃、空闲、离线；ticket 总数、进行中、成功率。渲染在 `web/app.js:539-558`（`renderStats`）。这些数字来自 `/api/stats`，由后端的 `task_history` 和 `instance_registry` 派生。

**Instance 面板。** 最详细的实时视图。渲染在 `web/app.js:563-626`（`renderInstances`）。每个 Slaver 或 Master instance 的表格列：instance id、role（带最多 3 个技能 tag 的彩色 chip）、type（人或 AI 徽章）、状态点、当前 task id、当前负载、最近心跳（带 staleness 标志）。staleness 在 `web/app.js:581` 客户端计算（`Date.now() - instance.lastHeartbeat > 30000`），通过 `web/app.js:617-620` 的 CSS class 把文字变红。

**Tasks 面板。** 右上面板。渲染在 `web/app.js:631-662`（`renderTasks`）。每个 ticket 一行，含 id、title、assignee、状态 pill。状态由 `web/app.js:469-480` 的 `translateTaskStatus` 翻译（470-478 行的 map 覆盖 7 个面向用户的状态：`in_progress`、`pending`、`completed`、`review`、`assigned`、`accepted`、`failed`）。

**i18n。** Dashboard 内联了 `en-US` 和 `zh-CN` 两种 locale（`web/app.js:61-164`）。默认是 `zh-CN`；选择器在页面顶部，选择会持久化到 `localStorage`（`web/app.js:228`）。`web/app.js:243-253` 的 `renderAllUI` 在 locale 切换时重渲染所有四个面板。

**关于截图的诚实交代。** 截至本文写作时对应的 dashboard v0.6 版本，**仓内没有 dashboard 的截图**。`web/` 目录有 `index.html`、`styles.css`、`app.js` 和 `README.md`（`web/README.md:23-27` 列了它们）。README 是最接近"视觉规范"的东西，`web/app.js` 是最接近"行为规范"的东西。v2.10 欢迎贡献者向 `web/assets/` 加截图或 GIF；眼下，上面引用的代码就是事实来源。

**Dashboard *不*展示的。** 审计日志不在 dashboard 里。trace 目录不在 dashboard 里。checkpoint 存储不在 dashboard 里。**Dashboard 是实时状态视图；历史视图是 `grep` + `tail -f` + trace 目录。** 这是刻意的边界：把审计日志放进浏览器意味着把每条 PII-已脱敏-或-没-脱敏的行都发到 Slaver 机器的网络上；协议的立场是：运维面对事故的第一个动作*不是*刷新浏览器。

---

## 7. References

- **Source code (TypeScript):**
  - `node/src/core/state/audit.ts:23-37` —— append-only 审计日志写入器，O_APPEND 原子性
  - `node/src/core/state/audit.ts:5-7` —— 格式规范（`ISO8601 | actor | engine | op | target | details`）
  - `node/src/core/task-checkpoint.ts:1-10` —— 三层 RunState 设计（agentFacingItems / fullHistoryItems / executedToolCalls）
  - `node/src/core/task-checkpoint.ts:48-108` —— `saveCheckpoint` + `_casUpdate` CAS 原语
  - `node/src/core/task-checkpoint.ts:160-168` —— `isToolCallAlreadyExecuted` 幂等性检查
  - `node/src/core/task-checkpoint.ts:210-222` —— `createEmptyCheckpoint`（默认字段集）
  - `node/src/core/slaver-watchdog.ts:42-102` —— SlaverWatchdog 构造 + 心跳（60s）
  - `node/src/core/slaver-watchdog.ts:142-184` —— 超时告警（500s）+ 自动 checkpoint
  - `node/src/core/slaver-watchdog.ts:116-123` —— 心跳文件内容（timestamp、taskId、elapsed、status）
  - `node/src/context-monitor.ts:25-46` —— context-budget 阈值（70K warn，85K danger）
  - `node/src/context-monitor.ts:55-78` —— JSONL 输出 + 退出码契约
  - `node/src/health-check.ts:23-45` —— uptime + process.memoryUsage()
  - `node/src/health-check.ts:50-125` —— Redis + SQLite 健康检查
  - `node/src/health-check.ts:130-151` —— `performHealthCheck` 组合器
  - `node/src/core/sqlite-client.ts:222-233` —— `task_history` schema
  - `node/src/core/sqlite-client.ts:966-976` —— 原子的 `UPDATE ... WHERE status = 'ready'` 认领
- **Source code (Rust):**
  - `rust/crates/eket-core/src/tracing.rs:14-20` —— `SpanLevel` 枚举（Workflow / Task / Step / ToolCall）
  - `rust/crates/eket-core/src/tracing.rs:46-62` —— `NoOpSpan`（零成本默认）
  - `rust/crates/eket-core/src/tracing.rs:66-76` —— `SpanRecord`（导出形态）
  - `rust/crates/eket-core/src/tracing.rs:189-225` —— `JsonFileExporter`（写入 `~/.eket/traces/`）
  - `rust/crates/eket-core/src/tracing.rs:255-267` —— `SpanContext::from_env`（EKET_TRACING 开关）
  - `rust/crates/eket-core/src/tracing.rs:325-346` —— `tracing_span_records_hierarchy` 测试（attribute 约定）
  - `rust/crates/eket-core/src/election.rs:32` —— `use tracing::{debug, info, warn};`
  - `rust/crates/eket-core/src/election.rs:347-350` —— 已插桩的 `tracing::debug!` 调用（第 3.2 节的 tracing 示例）
  - `rust/crates/eket-core/src/saga.rs:233-288` —— `middle_step_fails_rolls_back` 回归测试
  - `rust/crates/context-mon/src/main.rs:12-23` —— Rust 阈值（与 Node 相同）
  - `rust/crates/context-mon/src/estimator.rs:21-149` —— rough + precise 上下文估算器
- **Scripts:**
  - `scripts/log-rotate.sh:43-65` —— 轮转配置 + 默认值
  - `scripts/log-rotate.sh:76-192` —— 删除 / 压缩 / 上限 / 切分操作
  - `scripts/check-debrief.sh:1-95` —— debrief 闸门（done ticket 必须有 memory 文件）
  - `scripts/backup-sqlite.sh:204-276` —— 从备份恢复，附 emergency backup
- **Protocol schemas:**
  - `protocol/schemas/heartbeat.schema.json:7-46` —— 心跳字段（instance_id、role、status、current_task、capabilities、capacity、host、pid）
  - `protocol/state-machines/ticket-status.yml:1-112` —— 17 态状态机
- **Dashboard:**
  - `web/README.md:1-30` —— 目录用途 + 文件清单
  - `web/README.md:11` —— `staticPath: config.staticPath || path.resolve(__dirname, '../../../web')`
  - `web/app.js:12-19` —— `CONFIG`（5s 刷新、30s 心跳过期、locale）
  - `web/app.js:61-164` —— 内联 i18n 翻译（en-US、zh-CN）
  - `web/app.js:374` —— `/api/dashboard` 拉取
  - `web/app.js:489-534` —— system-status 面板渲染
  - `web/app.js:539-558` —— stats 面板渲染
  - `web/app.js:563-626` —— instances 表渲染
  - `web/app.js:631-662` —— tasks 列表渲染
- **Cross-references in the series:**
  - `docs/articles/01-what-is-eket/zh-CN/article.md:1` —— 主题文章（先读）
  - `docs/articles/02-why-you-need-eket/zh-CN/article.md:44-53` —— 四个痛点
  - `docs/articles/06-master-slaver-protocol/zh-CN/article.md:224-272` —— Saga 5 步表
  - `docs/articles/06-master-slaver-protocol/zh-CN/article.md:300-330` —— 恢复流程（"Slaver 中途崩溃"）
  - `docs/articles/07-storage-and-events/zh-CN/article.md:90-165` —— 数据模型 + schema
  - `docs/articles/07-storage-and-events/zh-CN/article.md:328-350` —— 三层事件溯源
  - `docs/articles/07-storage-and-events/zh-CN/article.md:481-491` —— 30 秒恢复流程
  - `docs/articles/GLOSSARY.md:1-43` —— 共享术语
- **Series navigation:**
  - 上一篇：[`08-rust-performance`](../08-rust-performance/zh-CN/article.md) —— 受控条件下的逐操作性能
  - 下一篇：[`10-onboarding-playbook`](../10-onboarding-playbook/zh-CN/article.md) —— 0→1 Slaver 入门
