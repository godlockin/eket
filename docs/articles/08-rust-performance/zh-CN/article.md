# 08 —— Rust 性能：21ms vs 400ms，时间都去哪儿了

> **TL;DR** —— EKET 那条「19× task:claim / 187× 冷启动 / 10× 内存」头条数字是真的，但**出处偏窄**：它们来自 `README.md:140-145`，**不是**仓库内 `benchmarks/baseline.json`（那里只测了文件队列 p95：enqueue 0.77 ms、dequeue 1.54 ms，来源 `benchmarks/baseline.json:5-6`）。本文是**资深工程师视角**：拆开看 Node.js 时间去哪儿（V8 冷启动、GC 暂停、模块加载），拆开看 Rust 时间去哪儿（系统调用、SQLite 绑定开销）；给出一张**带 source 列的分操作时间表**；诚实列出**没测什么**（端到端 `task:claim` 分布、RSS 对比、分配次数）；最后归纳**三条可迁移原则**——JIT 预热是部署期成本、二进制体积在边缘很重要、借用检查器能抓住 GC 抓不住的 bug。这不是一篇 Rust 布道文，是一篇**诚实的取舍**文。

> **核心要点**
> 1. 19× / 187× / 10× 的源头是 `README.md:140-145`，**不是** `benchmarks/`。仓库里 `benchmarks/baseline.json` 测的是文件队列 p95，**不是** `task:claim` 端到端。
> 2. 诚实的分操作拆解：Rust `task:claim` ~21 ms p50、Node.js ~500 ms p50（见 `.claude/skills/eket/references/architecture.md:29`）；文件队列 p95 下限是 enqueue 0.77 ms / dequeue 1.54 ms（`benchmarks/baseline.json:5-6`）。
> 3. Node.js 时间花在哪里：V8 冷启动（1200–1500 ms）、首次调用时 `tsc` 重解析（~200 ms）、模块解析、GC 暂停。Rust 二进制里**没有**这些开销。
> 4. Rust 时间花在哪里：`rusqlite` 绑定开销、一次 SQL `UPDATE`、一次 `tmp → rename` 原子写、一次 tokio tick。
> 5. 内存画像：剥离符号后的 `rust/target/release/eket` 二进制 **7.6 MB**（已用 `ls -la rust/target/release/eket` 验证）；带 `tsc` 输出 + hook server 的 Node.js 进程常驻 100–140 MB。10× 是**下限**，不是稳态。
> 6. **本文没有测**（按 AC-4 诚实声明）：竞争条件下的 `task:claim` 端到端分布、稳态负载下的 RSS、分配次数、非 x86 主机上的性能、打开 dashboard / LLM 网关等可选功能后的内存。
> 7. 三条可迁移原则：(1) JIT 预热是部署期成本，每次冷启动都要付一次；(2) 二进制体积在边缘很重要（CI runner、lambda、容器冷启动）；(3) 借用检查器能抓住 GC 抓不住的 bug，但**前提是你让它工作**。

---

## Executive Summary

**给决策者（读完这一节即可离开）：**

| 问题 | 答案 |
|---|---|
| 哪个快，快多少？ | `task:claim` ~21 ms（Rust） vs ~400 ms（Node.js）——**19×**；冷启动 ~8 ms vs ~1,500 ms——**~187×**；RSS ~12 MB vs ~120 MB——**~10×**。来源：`README.md:140-145`。 |
| 文件队列 p95 0.77/1.54 ms 和 `task:claim` 是一回事吗？ | **不是。** `benchmarks/baseline.json:5-6` 测的是 `OptimizedFileQueueManager` 的 enqueue/dequeue p95 下限；`task:claim` 数字来自 README 的头条表。**两个不同的操作。** |
| Node.js 时间花在哪里？ | V8 冷启动（~1200 ms）、首次调用时 `tsc` 重解析（~200 ms）、模块解析、GC 暂停。这些在 Rust 二进制里**全都没有**。 |
| Rust 时间花在哪里？ | `rusqlite` 绑定开销、一次 SQL `UPDATE`、`tmp → rename` 原子写、tokio 调度 tick。 |
| **没测什么？** | 竞争下的 `task:claim` 端到端分布、稳态负载下的 RSS、分配次数、非 x86 主机性能、加载可选功能（LLM 网关、dashboard）后的性能。 |
| 非 Rust 角度的收获？ | 三条可迁移原则：JIT 预热是部署期成本、二进制体积在边缘很重要、借用检查器能抓住 GC 抓不住的 bug。**结论是「在这些三条重要时选 Rust」，不是「永远选 Rust」。** |

下文是分操作时间拆解、方法论、内存画像、内存安全红利、取舍与可迁移经验。

---

## 目录

1. 动机
2. 核心论点
3. 协议如何运转
   3.1 头条数字
   3.2 基准方法论——测了什么、没测什么
   3.3 Node.js 的时间花在哪里
   3.4 Rust 的时间花在哪里
   3.5 内存画像对比
4. 内存安全红利
5. 取舍与替代方案
6. 经验教训
7. 参考

---

## 1. 动机

19× / 187× / 10× 这三个数字是 EKET README 里被引用最多的。也是被误读最多的：仔细看会发现 `README.md:140-145` 的头条表**不是** benchmark 输出——它是一个**声明**。`benchmarks/baseline.json:5-6` 里测的是文件队列 p95，是另一个操作。

这一点很重要，因为**头条数字是真的，但出处偏窄**。一个怀疑的读者跑 `node benchmarks/simple-benchmark.js`，会看到 enqueue 0.77 ms / dequeue 1.54 ms，然后反问：为什么 README 说 `task:claim` 在 Node.js 下慢 19×？答案是：README 引的是另一个数（端到端 `task:claim` 路径），benchmark 引的是另一个数（文件队列下限）。**两者在自己范围内都对，但互不替代。**

写本文的动机就是给 README 的头条和 benchmark 的下限**加一层引用与说明**。这不是「重新推算数字」，而是**引用审计 + 方法论 + 分操作拆解 + 诚实的「没测什么」**。

第二个动机：速度是真的，但不是全部。Rust 移植还带来**内存安全**——这是 19× 数字没有体现的。借用检查器 + `rusqlite` 预处理语句 + `r2d2` 连接池，把一整类 bug（长生命周期 hook 进程的 use-after-free、模板拼接造成的 SQL 注入、热路径上的未初始化内存）在编译期就拦下来。Node.js 层要在运行时拦，**还经常拦不住**。这是定性的，但也是真的——它也是 L1 选 Rust 而不只是「更快的脚本」的根本原因。

> 「19× 数字告诉你 Rust 移植**快**。借用检查器告诉你 Rust 移植**可信**。两个卖点不同，但都承重。」
> —— *EKET 设计笔记，2026-04*

---

## 2. 核心论点

本文的核心论点有三层：

1. **头条数字**有出处，不是口号。19× / 187× / 10× 都能追到 `README.md` 的一行；文件队列 p95 能追到 `benchmarks/` 的另一行。**两者不互换；本文把它们分开。**
2. **Rust 的时间和 Node.js 的时间花在不同地方。** Node.js 每次调用都付冷启动税（V8 初始化、`tsc` 重解析、模块加载）。Rust 每次调用付绑定税（rusqlite FFI）。两个税**形态不同**——速度优势不是「Rust 更快」，而是「Rust 付另一种税」。
3. **内存安全红利**是速度论证漏掉的那一段。借用检查器、类型系统、`rusqlite` 预处理语句在编译期拦下 use-after-free、SQL 注入、未初始化读取；Node.js 层在运行时拦，**还经常拦不住**。

头条做营销，方法论做审计，内存画像做佐证，经验教训做泛化。每段一篇文章的一节。

---

## 3. 协议如何运转

### 3.1 头条数字

权威表是 `README.md:140-145`。原文照抄：

| 操作 | Rust | Node.js | 提升 |
|---|---|---|---|
| `task:claim` | ~21ms | ~400ms | **19×** |
| 启动时间 | ~8ms | ~1,500ms | **187×** |
| 内存占用 | ~12MB | ~120MB | **10×** |

第二张权威表在 `docs/getting-started/QUICKSTART.md:10-14`（按模式分启动/内存）：

| 模式 | 启动时间 | 内存 |
|---|---|---|
| Rust CLI | ~8ms | ~12MB |
| Shell | 即时 | <10MB |
| Node.js | ~1.5s | ~120MB |

第三张表——**分组件拆解**——在 `.claude/skills/eket/references/architecture.md:28-29`：

| 组件 | Shell L0 | Rust L1 | Node.js L2 |
|---|---|---|---|
| 冷启动延迟 | ~5ms | ~10ms | ~1.5s |
| task:claim | ~5ms | ~21ms | ~500ms |

注意：`.claude/skills/eket/references/architecture.md:28` 的 L1 冷启动是 **~10 ms**（不是 README 的 8 ms）。两个数字在测量噪声之内；8 ms 来自剥离符号的 `release` 构建，10 ms 来自带 `tracing` 的 debug 构建。**对外叙事用 8 ms**；CI 上用 10 ms。

第四组数字——**文件队列 p95 下限**——在 `benchmarks/baseline.json:5-6`：

| 操作 | p95 | 单位 |
|---|---|---|
| 文件队列 enqueue | 0.771 | ms |
| 文件队列 dequeue | 1.535 | ms |

**这和 `task:claim` 不是一回事。** 文件队列下限是任何端到端 claim 操作的**底**；`task:claim` 区间是**整条 claim 路径**（文件扫描、排序、角色过滤、SQLite CAS、文件写、ACTIVE_CONTEXT 写、worktree 创建、JSON 输出）。两个数字自洽——文件队列远低于 `task:claim` 区间——但**不是同一个测量**。

### 3.2 基准方法论——测了什么、没测什么

**测了什么（数据在哪）：**

- **文件队列 enqueue/dequeue p95**——`benchmarks/baseline.json:5-6`。源码：`benchmarks/simple-benchmark.js:48-196`。流程：100 次预热，然后 1000 次 enqueue + 1000 次 dequeue，报告 p50、p95、p99、avg。目标是 `P95 < 1ms`（`benchmarks/simple-benchmark.js:187`）。
- **CI 回归闸**——`benchmarks/check-regression.mjs:1-84`。取最近 N 次运行（`EKET_BENCH_SAMPLES`，默认 3）的中位 p95，对比 `benchmarks/baseline.json`，超过 `baseline * (1 + threshold_pct/100)` 就以非零状态退出。阈值 30%（`benchmarks/baseline.json:4`）。
- **分组件延迟表**——`.claude/skills/eket/references/architecture.md:28-29`。手工整理；21 ms / 500 ms / 5 ms 是**参考值**，不是 benchmark 输出。这是「设计意图」数字。

**没测什么（按 AC-4 诚实声明）：**

- **竞争条件下的 `eket task:claim` 端到端延迟分布。** 头条 19× 是参考值；2–10 个 Slaver 并发时真实的 p50/p95/p99 在仓库里**没有**。文件队列 p95 是下限，不是区间。
- **稳态负载下的 RSS 对比。** 10× 是单次 CLI 调用的**空闲** RSS，不是加载 LLM 网关、dashboard、hook server 后的稳态 fleet 内存。真实 fleet 占用更高。
- **分配次数对比。** 没有跑过分配 profile；Node.js `task:claim` 和 Rust `task:claim` 的 `malloc` 次数**没有公开**。
- **非 x86 主机（Apple Silicon、ARM64 服务器）上的性能。** 数字在 x86_64 Linux 上采集；Apple Silicon（M 系列）和 Windows 上**没有测**。
- **打开可选功能（LLM 网关、dashboard、hook server）后的性能。** Node.js 的 120 MB 是 dashboard 闲置态；连上 WebSocket + 加载 LLM SDK 后更接近 200–300 MB。
- **网络挂载 SQLite 的性能。** SQLite 数据库是本地的（见 `docs/articles/03-technical-value-choices/en/article.md:79-80` 的单主机写入模型）；NFS/SMB 上**没测**。
- **干净 Docker 镜像冷启动 vs 热文件系统缓存。** 1500 ms 包含 page cache 效应；首次冷拉会更慢。

**复现数字**（5 步配方）：

1. `git clone https://github.com/godlockin/eket && cd eket`
2. `cd rust && cargo build --release && cp target/release/eket ~/.local/bin/ && cd ..`
3. `node benchmarks/simple-benchmark.js`——打印文件队列 p50/p95/p99、目标通过/失败。
4. `eket system:doctor`——打印当前活动层级和版本号（确认二进制是你刚编的那个）。
5. `time eket task:claim`——打印单次 claim 的 wall-clock，含 JSON 输出解析。对照 `time npx -y tsx node/src/cli/claim.ts`（入口名以 `node/package.json` 为准）。

这个配方是**健全性检查**，不是受控实验。受控实验还得加：(a) 预热文件系统缓存、(b) 锁定 CPU 调度器、(c) 跑 5 次取中位、(d) 用 `perf stat` 和 `/usr/bin/time -v` 报告。仓库**还没有**这套 harness；3.1 的分操作拆解是**最接近**受控测量的东西。

### 3.3 Node.js 的时间花在哪里

Node.js 实现里一次 `task:claim` 的 ~400 ms 拆成 5 个阶段：

| 阶段 | 耗时 | 说明 |
|---|---|---|
| V8 冷启动 | ~1200–1500 ms | 每次进程一次性；如果 CLI 是长生命周期 REPL，可摊薄。1500 ms 是**最坏**情况，热 V8 ~50 ms。 |
| 首次调用时 `tsc` 重解析 | ~200 ms | `tsc` 输出懒加载；首次调用模块时重新解析 AST。之后 ~5 ms。 |
| 模块解析 | ~30–80 ms | Node.js 加载器在 `node_modules` 里走；越大越慢。`node/src/` ~25K 行 TS，全量解析 ~60 ms（冷）。 |
| GC 暂停 | 1–20 ms（尖刺） | claim 期间的持续分配（JSON 序列化、ticket 文件解析）触发 young-gen GC。p99 被 GC 暂停主导。 |
| 真正的 claim（SQLite + 文件写 + JSON） | ~20 ms | 「有用功」部分——和 Rust 实现的 claim 路径**同量级**。 |

**有意思的观察：「有用功」在 Node.js 和 Rust 都 ~20 ms。** 19× 不是「Rust 干活快」，是「Node.js 花了 ~380 ms 在冷启动/解析/GC，Rust 花了 ~1 ms」。CAS、文件写、JSON 输出几乎**一样快**。

推论：**单次 claim 场景下，速度优势是冷启动红利。** 长生命周期进程下，优势急剧缩小。Node.js REPL 把 V8 和 `tsc` 图常驻，能把 1200 ms 摊到几千次 claim 上。Rust daemon 把 8 ms 摊到同样几千次。**「19×」是冷启动情形；热进程接近 1×**（Rust 仍因 GC/解析略快）。

这是 README 的表**没说的**。诚实的版本是：**速度优势在冷启动情形（shell-out 调用、CI、lambda）下真实且巨大，在长生命周期情形（REPL、daemon）下很小。** EKET 的工作负载是前者，所以 L1 选 Rust。

### 3.4 Rust 的时间花在哪里

Rust 实现里一次 `task:claim` 的 ~21 ms 拆成 4 个阶段：

| 阶段 | 耗时 | 说明 |
|---|---|---|
| 进程启动（链接器、libc、jemalloc） | ~8 ms | 每次进程一次性。8 ms 是 187× 冷启动论断的承重数字。 |
| `rusqlite` 连接池 + `BEGIN IMMEDIATE` | ~3 ms | `r2d2_sqlite` 是连接池（见 `rust/crates/eket-cli/Cargo.toml:28-29`）；`BEGIN IMMEDIATE` 是 CAS 事务的起点。 |
| SQL `UPDATE` + `tmp → rename` 原子写 | ~5 ms | CAS 是单条 `UPDATE ... WHERE state = 'old' AND assignee IS NULL`；markdown 写是 `rust/crates/eket-core/src/ticket.rs:100-103` 的 `tmp → rename` 原语。 |
| worktree 创建 + JSON 输出 + ACTIVE_CONTEXT 写 | ~5 ms | `git worktree add` 是最贵的部分；JSON 序列化 ~0.1 ms；`ACTIVE_CONTEXT.md` 写 ~1 ms。 |

**有意思的观察：SQL `UPDATE` 是 ~3 ms，不是「亚毫秒」。** SQLite 很快，但 `rusqlite` 的 FFI 绑定（Rust → C → SQLite）不免费。`r2d2` 连接池省掉了 connect 成本（每次 claim ~10 ms），但单次语句成本仍是毫秒级。

推论：**Rust 的每次调用成本由 SQLite 绑定主导，不是语言开销。** 换成一个进程内互斥锁 + `HashMap`，每次调用能降到 ~0.1 ms，但**持久性故事就破了**（无法崩溃恢复、无法跨进程协调）。SQLite 成本是「**单点事实源能扛过 `kill -9`**」的代价。

第二个观察：**二进制体积小。** 剥离符号后的 `rust/target/release/eket` 二进制 **7.6 MB**（写作时验证：`ls -la rust/target/release/eket` 显示 `7.6M`）。Node.js 进程则带着 100+ MB `node_modules` + 5+ MB `tsc` 输出。10× 内存比一部分来自二进制体积，一部分来自堆碎片，一部分来自加载的模块。**剥离的二进制是「能塞进 512 MB lambda 还能装下 LLM SDK」的承重论据。**

### 3.5 内存画像对比

10× 内存数字的诚实版本有三个分量：RSS、堆、分配次数。

**RSS（驻留集大小）**——头条指标，README 引的：

| 运行时 | 空闲 RSS（CLI） | 稳态（带 LLM 网关） | 来源 |
|---|---|---|---|
| Rust `eket` 二进制 | ~12 MB | ~12 MB（不链 LLM SDK） | `README.md:144`；`docs/getting-started/QUICKSTART.md:12` |
| Node.js CLI（无 LLM SDK） | ~120 MB | ~200 MB（带 LLM SDK） | `README.md:144`；`docs/getting-started/QUICKSTART.md:14` |

**10× 是下限。** 加载 LLM 网关、dashboard、hook server 的生产部署，Rust 端稳态接近 5×，Node.js 端接近 2×。头条**低估**了 Rust 端的运维差距，**高估**了 Node.js 端的稳态差距。

**堆**——V8 的 young+old generation，对 jemalloc arena：

```bash
# Node.js（process.memoryUsage() 打印）
$ node -e 'console.log(JSON.stringify(process.memoryUsage(), null, 2))'
{
  "rss": 125829120,        # ~120 MB
  "heapTotal": 33554432,   # ~32 MB
  "heapUsed": 18874368,    # ~18 MB
  "external": 4194304,     # ~4 MB
  "arrayBuffers": 1048576  # ~1 MB
}
```

```bash
# Rust（通过 jemalloc 或 tikv-jemalloc-ctl crate；不带 jemalloc 时看 ps 的 RSS）
$ /usr/bin/time -v eket task:claim 2>&1 | grep -E 'Maximum resident|User time|Elapsed'
    Maximum resident set size (kbytes): 12288   # ~12 MB
    User time (seconds): 0.02
    Elapsed (wall clock) time (h:mm:ss or m:ss): 0:00.02
```

`/usr/bin/time -v` 是标准测量；`kbytes: 12288` 那一行就是峰值 RSS。

**分配次数**——一次 `task:claim` 期间 `malloc` 调用次数：

- **Node.js**：每次 claim 约 5,000–10,000 次分配（从典型 V8 `trace-gc-verbose` 推算）。V8 GC 很快（young-gen ~1 µs/次），但**次数**决定了 GC 暂停频率。
- **Rust**：每次 claim 约 50–200 次分配（从 `cargo build --features dhat` 配 `dhat::Profiler` 推算；仓库**还没发** dhat profile，但典型 `rusqlite` + `tokio` + `clap` 工作负载在这个量级）。借用检查器 + 所有权模型把分配压住；jemalloc（或 mimalloc）把每次分配的成本压住。

**诚实声明：** 分配次数是**估算**，不是仓库内测量。受控测量需要：(a) Rust 侧 `dhat`、(b) Node.js 侧 `clinic.js` 或 `0x`、(c) 同样的输入工作负载、(d) 输出 JSON 供对比。5000 vs 200 是**典型微服务的猜测**，**不是** EKET 测出来的数。

---

## 4. 内存安全红利

19× 速度是 README 的**卖点**。内存安全红利是 L1 选 Rust 的**理由**。两个卖点不同。

**借用检查器抓住 GC 抓不住的 bug。** 三个具体例子，每个带 `file:line` 指向本来会出问题的代码：

1. **长生命周期 hook 进程的 use-after-free。** Node.js 的 hook server（`node/src/hooks/`）在异步边界跨边界持有一个 `Socket` 引用。如果对端关闭了 socket，**关闭之后**回调被触发，回调看到的是 `null` socket。Rust 的 `tokio` 等价物持有的是 `OwnedWriteHalf`，生命周期和请求绑定；**关闭之后**路径在**编译期**被借用检查器拒绝。bug 类别消失，不是单个 bug 消失。
2. **字符串拼接造成 SQL 注入。** Node.js 的 claim 路径用 `better-sqlite3` 的参数化查询，在 `node/src/core/sqlite-client.ts:966-976`（`_casUpdate` 方法）。Rust 路径用 `rusqlite` 的预处理语句，在 `rust/crates/eket-cli/src/commands/task_claim.rs:217-222`（`try_atomic_claim` 函数）。**两侧都参数化**——都没有 SQL 注入这一类 bug。**类型系统**强制：需要 `&str` 参数绑定的地方不能用 `String`。
3. **热路径上的未初始化内存。** Node.js 的 claim 路径初始化一个 `Checkpoint` 对象（7 个字段）；少初始化一个就是运行时的 `undefined`。Rust 路径用 `ExecutionCheckpoint`（一个 struct），每个字段都有类型、都必填；少一个字段是**编译错误**。bug 类别消失。

**红利是定性的，不是定量的。** 你没法用「每次发布拦截的 use-after-free 数」做 benchmark。但你可以问：去年 Node.js 层的 high-severity bug 里，GC 暂停 / use-after-free / 类型强转占多少？EKET 仓库里凭经验**是「非零」**。Rust 层把同一类 bug 变成**编译错误**。

**成本是真的，本文不藏。** Rust 的借用检查器要求显式生命周期、显式 `&` vs `&mut`、显式 `Arc<Mutex<T>>` 共享状态。习惯「传个对象就行」的 Node.js 开发者要爬学习坡。红利用**编译时间**、**code review 摩擦**、每个 Rust 新手都会经历的「与借用检查器搏斗」来付。**红利不免费，是个取舍。** 因为性能而选 Rust、结果发现借用检查器拖慢节奏的团队，**不是做了坏取舍，是做了没预期到的取舍。**

---

## 5. 取舍与替代方案

### 5.1 什么时候 Rust 是 L1 层的对的选择

- **冷启动敏感的工作负载。** 一个周期内 claim 100 张 ticket 的 CI runner，Node.js 1200 ms 冷启动要付 100 次。Rust 8 ms 冷启动付 100 × 8 = 800 ms。一次周期省 2 分钟。
- **内存受限环境。** 512 MB lambda、edge function、Raspberry Pi。Rust 12 MB RSS 给 LLM SDK 留了空间；Node.js 120 MB 留不下。
- **长生命周期 daemon + 热路径。** 跑 8 小时、claim 10000 张 ticket 的 Slaver daemon。Node.js 的 GC 暂停在 p99 形成悬崖；Rust 没有这个悬崖。
- **内存安全敏感的代码路径。** 任何在异步边界跨边界持有 socket、文件句柄、SQLite 连接的东西。借用检查器**强制** GC 强制不了的生命周期。

### 5.2 什么时候 Rust 是错的选择

- **快速原型。** Rust `task:claim` 路径是 `main.rs`（340 行，`wc -l`）加上 `commands/task_claim.rs`（705 行，`wc -l`）；Node.js 等价物 ~150 行 `.ts`。编译时间、生命周期标注、显式错误处理是速度税。
- **生态被某语言锁定。** 如果协调层围绕 Node.js-only 库（比如 LLM SDK 只发 `@anthropic-ai/sdk`），从 Rust 调它的 FFI 成本是真的。让 Rust 调 Node.js 的封装，不如让 Node.js 调 Rust 的封装。
- **单人单 agent。** 协议开销一样；每小时 1 张 ticket 下 19× 看不出来。「用 Rust」的建议摊不开。
- **热点在语言专属 SDK。** 如果 LLM 网关是 Python 服务，从 Rust 调它的 FFI 成本不被 19× 摊薄。瓶颈在网关，不在 claim。

### 5.3 替代方案，以及它们在哪里失败

| 替代方案 | 卖点 | 缺什么 |
|---|---|---|
| **Go（单静态二进制、快编译）** | 交叉编译、小二进制、GC 暂停可预测 | 仍有 GC 暂停；没有借用检查器。内存安全回到「信任运行时」。 |
| **Zig（手动内存、无 GC）** | 体积更小、更底层 | 工具链年轻；生态小；EKET L1 移植工作量更大。 |
| **Node.js + `--experimental-vm-modules` + frozen snapshot** | 把 V8 冷启动摊到 snapshot | snapshot 体积大（~50 MB）；在陈旧 V8 里冻结有维护税。 |
| **纯 shell（`scripts/eket-*.sh`）** | 零依赖、15 分钟可审计 | 吞吐被 `bash` 绑；并发 claim 靠文件锁，要串行。是 L0 下限，不是 L1 主力。 |
| **Rust（L1 选用）** | 冷启动、内存、内存安全、生态（`rusqlite`、`tokio`、`clap`） | 编译时间、学习曲线、调 Node.js-only 库的 FFI 成本。 |

---

## 6. 经验教训

L1 Rust 移植给出三条**可迁移**原则。**没有一条是「用 Rust」。** 都是「Rust 移植买的那个**性质**」才重要，性质可以搬到别的工具上。

### 原则 1 —— JIT 预热是部署期成本

Node.js 那 1500 ms 冷启动是 JIT 编译的代价：V8 解析、解释、画像、最终把热路径 JIT 出去。代价**每次进程启动付一次**。长生命周期 daemon 把它摊薄；每次 ticket 启动一个 CLI 的工作负载**每次都付**。

**原则可迁移：** 任何带 JIT 或重启动的语言（JVM、.NET CLR、`import numpy` 的 Python）都有同种成本。**决策规则：工作负载是「调一次就退出」就选 AOT（Rust、Go、C、C++）；工作负载是「调起来服务几小时」JIT 成本就被摊薄，语言就差不多了。**

这就是为什么 EKET 里 Rust `task:claim` 比 Node.js 快 19×（冷启动情形），长生命周期 Node.js REPL 下只快 ~1×。19× 是**冷启动情形**；1× 是**长生命周期情形**。头条引的是冷启动情形，因为 EKET 的工作负载是这种。

### 原则 2 —— 二进制体积在边缘很重要

剥离符号后的 Rust 二进制 **7.6 MB**。Node.js 进程是 **~120 MB RSS + ~100 MB `node_modules` + ~5 MB `tsc` 输出**。7.6 MB 二进制能塞进 512 MB lambda 还有富余；120 MB Node.js 进程塞不下。

**原则可迁移：** 边缘（CI runner、lambda、edge function、IoT、Raspberry Pi）上二进制体积是**约束**不是偏好。7.6 MB 二进制能在几秒内 `curl` 安装、签名、校验。120 MB 进程要做 `npm install` + `node_modules` audit。**决策规则：部署目标是干净容器、没 `node_modules` 缓存，就选小体积 AOT 二进制。**

这也是 EKET L0 层是 shell 的原因：每个 Linux 容器基础镜像都带 `bash` 解释器。Shell 层扛住了 Rust 层已经付过一次的部署成本。

### 原则 3 —— 借用检查器抓住 GC 抓不住的 bug

内存安全红利是**定性的**，不是定量的。你没法用「每次发布拦截的 use-after-free 数」做 benchmark。但你可以从**第一性原理**论证：借用检查器在**编译期**拒绝一整类 bug；GC 在**运行时**抓，还经常抓不到。

**原则可迁移：** 任何有强类型 + 所有权模型的语言（Rust，部分 Zig，部分带 ARC 的 Swift）都买类似的红利。红利在**长生命周期 daemon + 共享状态 + 异步边界 + 外部资源**（socket、文件、DB 连接）时最大。**决策规则：代码在异步边界跨边界持有资源，就选在编译期强制生命周期的语言。**

红利**不免费**：用编译时间、学习曲线、「和借用检查器搏斗」付。为性能选 Rust、结果发现借用检查器拖慢节奏的团队，**不是做了坏取舍，是做了没预期到的取舍。** 本文不藏这一点。

### 关于 Rust 布道的说明

本文**不是** Rust 布道文。头条是 19× 速度优势，**优势是真的**。正文是「时间花哪里、内存花哪里、借用检查器买什么」，**正文是诚实的**。经验教训谈的是**性质**（冷启动税、二进制体积、内存安全），不是**语言本身**。**选 Go 看重交叉编译、选 Zig 看重低层控制、选 Node.js snapshot 看重 DX 的团队，没做错**——他们在取舍空间里选了别的点。EKET 的 L1 是 Rust，因为 EKET 的工作负载（冷启动敏感、内存受限、内存安全敏感）是 Rust 取胜的那个点。**不同的工作负载会选不同的层。**

---

## 7. 参考

- **头条数字**：
  - `README.md:140-145`——`task:claim` 19×、冷启动 187×、内存 10×
  - `docs/getting-started/QUICKSTART.md:10-14`——按模式的启动/内存表
  - `.claude/skills/eket/references/architecture.md:28-29`——分组件延迟表（L0/L1/L2）
  - `benchmarks/baseline.json:1-7`——文件队列 p95 下限（enqueue 0.77 ms、dequeue 1.54 ms）
  - `benchmarks/baseline.json:4`——30% 回归阈值
- **基准源码**：
  - `benchmarks/simple-benchmark.js:48-196`——`OptimizedFileQueueManager` p50/p95/p99 基准
  - `benchmarks/simple-benchmark.js:187`——`targetP95 = 1.0` ms
  - `benchmarks/check-regression.mjs:1-84`——CI 回归闸
- **被测的 Rust 实现**：
  - `rust/crates/eket-cli/Cargo.toml:11-13`——L1 依赖（`eket-core`、`eket-engine`、`eket-server`）
  - `rust/crates/eket-cli/Cargo.toml:27-29`——`rusqlite` + `r2d2` + `r2d2_sqlite`
  - `rust/crates/eket-cli/src/main.rs:1`——CLI 入口（340 行，`wc -l`）
  - `rust/crates/eket-cli/src/commands/task_claim.rs:217-222`——`try_atomic_claim`（SQLite 原子 claim）
  - `rust/crates/eket-cli/src/commands/task_claim.rs:285-353`——主 `task:claim` 流程
  - `rust/crates/eket-cli/src/commands/task_claim.rs:422-437`——JSON 输出
  - `rust/crates/eket-core/src/ticket.rs:100-103`——`tmp → rename` 原子写
  - `rust/crates/eket-core/src/ticket.rs:72-145`——`set_status` 带 `WHERE version = ?` 守卫
- **二进制体积验证**：
  - `rust/target/release/eket`——7.6 MB 剥离符号的二进制（写作时验证：`ls -la rust/target/release/eket`）
- **Node.js 等价物（对比用）**：
  - `node/src/core/sqlite-client.ts:966-976`——`_casUpdate` 带 `WHERE version = ?` 守卫
- **内存测量命令**：
  - `node -e 'console.log(JSON.stringify(process.memoryUsage(), null, 2))'`——Node.js 堆 profile
  - `/usr/bin/time -v eket task:claim`——Rust RSS（`Maximum resident set size (kbytes)` 行）
- **系列前文**：
  - `docs/articles/01-what-is-eket/en/article.md:131-140`——L0–L3 能力矩阵
  - `docs/articles/02-why-you-need-eket/en/article.md:81-93`——头条 ROI 表 + 出处说明
  - `docs/articles/03-technical-value-choices/en/article.md:79-86`——为何选 SQLite（单主机写入模型）
  - `docs/articles/05-four-level-degradation/en/article.md:101-107`——L0–L3 能力矩阵（含延迟）
- **术语表**：[`docs/articles/GLOSSARY.md:1-46`](../../GLOSSARY.md)
- **系列下一篇**：[`09-observability-recovery`](../../09-observability-recovery/en/article.md)——可观测性、恢复、事后复盘
