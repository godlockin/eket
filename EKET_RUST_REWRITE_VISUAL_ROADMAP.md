# EKET Rust Rewrite: Visual Roadmap & Decision Tree

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  EKET FRAMEWORK REWRITE ANALYSIS (2026-04-20)              │
│                         Total Codebase: ~15,000 LOC                         │
└─────────────────────────────────────────────────────────────────────────────┘

                          TIER CLASSIFICATION TREE

                          ┌──────────────────────┐
                          │   EKET CODEBASE      │
                          │    ~15,000 LOC       │
                          └──────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
        ┌───────────▼───────────┐   │   ┌───────────▼────────────┐
        │  TIER 1: RUST MUST    │   │   │  TIER 3: KEEP IN       │
        │   5,930 LOC (39%)     │   │   │  NODE.JS               │
        │  Pure Logic, High ROI │   │   │  6,070 LOC (41%)       │
        └───────────┬───────────┘   │   │  Tight Integration     │
                    │               │   │  Frontend/LLM          │
                    │               │   └───────────┬────────────┘
        ┌───────────▼────────────┐  │
        │ TIER 2: PARTIAL        │  │
        │ 2,000 LOC (13%)        │  │
        │ Mixed Logic + I/O      │  │
        └───────────┬────────────┘  │
                    │               │
        ┌───────────┴───────────┬───┴─┬──────────────┬──────────────┐
        │                       │     │              │              │
   ┌────▼────┐  ┌──────▼───┐  │  ┌──▼──┐  ┌────────▼──┐  ┌───────▼──┐
   │ STATE    │  │ MESSAGE  │  │  │TASK │  │ AGENT     │  │ OPTIMIZE │
   │2,630 LOC │  │ QUEUE    │  │  │1,900│  │1,750 LOC  │  │1,430 LOC │
   │          │  │1,500 LOC │  │  │LOC  │  │           │  │          │
   │sqlite    │  │          │  │  │     │  │registry   │  │recomm.   │
   │redis     │  │redis+    │  │  │task │  │election   │  │compress  │
   │cache     │  │file      │  │  │wf   │  │heartbeat  │  │rag       │
   │locks     │  │queue     │  │  │dag  │  │pool       │  │search    │
   └──────────┘  └──────────┘  │  └─────┘  └───────────┘  └──────────┘
                               │
                               │ ┌─────────────────┐
                               │ │ CLI COMMANDS    │
                               │ │ 20/30 portable  │
                               │ │ 2,000 LOC       │
                               │ └─────────────────┘
                               │
                               │ ┌─────────────────┐
                               │ │ SKILL REGISTRY  │
                               │ │ ~300 LOC        │
                               │ └─────────────────┘

TIER 3 BREAKDOWN:
┌───────────────────────────────────────────────────────────────┐
│ HTTP Servers      1,200 LOC │ Keep in Node.js + Express       │
│ LLM Runners         800 LOC │ Anthropic/OpenAI SDKs           │
│ CLI Frameworks      600 LOC │ inquirer, ora, commander         │
│ Web Dashboard     1,500 LOC │ React frontend                   │
│ Git Integration     500 LOC │ GitHub API, shell fallback       │
│ i18n/Other      1,470 LOC │ Localization, misc               │
├───────────────────────────────────────────────────────────────┤
│ Total Staying:    6,070 LOC │ No changes needed               │
└───────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════

                    RUST REWRITE TIMELINE (12-16 WEEKS)

Week 1-2        Week 3-5          Week 6-7       Week 8-10      Week 11-12
├─────┤         ├──────┤           ├─────┤        ├────────┤     ├──────────┤
 FOUND          STORAGE           MESSAGE        CORE BIZ       CLI/POLISH
  │              │                  │              │               │
  ├─Errors       ├─SQLite           ├─Queue        ├─Workflow      ├─Port 20
  ├─Types        ├─Redis            ├─File Q       ├─Agents        │ Commands
  ├─Config       ├─Cache            ├─Mailbox      ├─Election      ├─Testing
  └─Tests        └─Locks            └─Envelope     ├─Instance      └─Bench
                                                   └─Recommend


═══════════════════════════════════════════════════════════════════════════════

                      PERFORMANCE IMPACT ANALYSIS

OPERATION                    CURRENT (Node.js)    RUST          GAIN
─────────────────────────────────────────────────────────────────────────
Task Claiming (atomic)       2-3ms              0.3-0.5ms      5-10x ⚡
Master Election (consensus)  100-150ms          20-40ms        3-5x  ⚡
Workflow DAG Evaluation      50-100ms           10-20ms        3-5x  ⚡
State Persistence (SQLite)   0.04ms             0.01ms         2-4x  ⚡
Message Queue Enqueue        1.3ms              0.3-0.5ms      2-3x  ⚡
Startup Time                 1.5-2.0s           0.1-0.2s       10-20x 🚀
Memory Footprint             100-150MB          10-30MB        5-10x 💾
Concurrent Throughput        100 agents/s       500+ agents/s  5x    📊


═══════════════════════════════════════════════════════════════════════════════

                    MODULE DEPENDENCY GRAPH

     ┌──────────────────────────────┐
     │      APPLICATION LAYER       │
     │   (CLI Commands, HTTP Routes)│
     └──────────────┬───────────────┘
                    │
     ┌──────────────▼───────────────┐
     │    BUSINESS LOGIC LAYER      │
     │ (Workflow, Task, Recommender)│
     └──────────────┬───────────────┘
                    │
         ┌──────────┼──────────┐
         │          │          │
    ┌────▼──┐  ┌───▼───┐  ┌──▼────┐
    │AGENT  │  │MESSAGE │  │STATE  │
    │LAYER  │  │QUEUE   │  │LAYER  │
    └────┬──┘  └───┬───┘  └──┬────┘
         │        │          │
         └────────┼──────────┘
                  │
         ┌────────▼────────┐
         │  STORAGE LAYER  │
         │ (SQLite + Redis)│
         └─────────────────┘

REWRITE ORDER: Bottom-up → Foundation → Message → Agent → Business Logic


═══════════════════════════════════════════════════════════════════════════════

                    CRITICAL PATH ANALYSIS

                        PORT FIRST (Week 1-7)
                              │
                    ┌─────────┼─────────┐
                    │         │         │
                ┌───▼──┐  ┌──▼───┐  ┌─▼────┐
                │Error │  │State │  │Redis │
                │Types │  │ Mgmt │  │Cache │
                └───┬──┘  └──┬───┘  └─┬────┘
                    │       │       │
                    └───────┼───────┘
                            │
                    ┌───────▼────────┐
                    │  Message Queue │
                    │  (Blocking Dep)│
                    └───────┬────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
         ┌────▼──┐   ┌──────▼──┐   ┌────▼────┐
         │Task   │   │Workflow │   │Election │
         │Engine │   │Engine   │   │& Agents │
         └───────┘   └─────────┘   └─────────┘


═══════════════════════════════════════════════════════════════════════════════

                    TECHNOLOGY STACK (RECOMMENDED)

┌─ RUST CORE ───────────────────────────────────────────────────────────────┐
│                                                                            │
│  [Async Runtime]              [Data & Storage]                            │
│  ├─ tokio         1.37        ├─ rusqlite       0.32 (SQLite)            │
│  ├─ tokio-util    0.7         ├─ redis          0.25 (Redis)            │
│  └─ futures       0.3         └─ lru            0.12 (LRU Cache)         │
│                                                                            │
│  [Algorithms]                 [Serialization]                             │
│  ├─ petgraph      0.6 (DAG)   ├─ serde          1.0 (Serialization)     │
│  ├─ ndarray       0.15 (ML)   ├─ serde_json     1.0 (JSON)              │
│  └─ approx        0.5         └─ serde_yaml     0.9 (YAML)              │
│                                                                            │
│  [CLI & UX]                   [Security & Crypto]                         │
│  ├─ clap          4.5         ├─ jsonwebtoken   9.0 (JWT)               │
│  └─ indicatif     0.17 (Progress)  ├─ sha2    0.10 (Hashing)           │
│                                └─ ring          0.17 (Crypto)            │
│                                                                            │
│  [Error & Logging]            [Testing]                                   │
│  ├─ anyhow        1.0         ├─ criterion      0.5 (Benchmarks)        │
│  ├─ thiserror     1.0         └─ tokio-test    0.4 (Async tests)        │
│  └─ tracing       0.1                                                     │
│      tracing-subscriber 0.3                                              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

┌─ NODE.JS LAYER (Unchanged) ────────────────────────────────────────────────┐
│                                                                            │
│  [HTTP Server]                [Integration]                               │
│  ├─ express       5.2.1        ├─ @anthropic-ai/sdk (Claude)            │
│  ├─ cors          2.8.6        ├─ github API (PR creation)              │
│  └─ morgan        1.10.1       └─ openai (GPT integration)              │
│                                                                            │
│  [WebSocket & Real-time]      [CLI & TUI]                                │
│  ├─ ws            8.20.0       ├─ inquirer       13.4.1 (Prompts)       │
│  └─ socket.io     4.x          ├─ ora            9.3.0 (Spinners)       │
│                                └─ commander      12.0.0 (CLI)            │
│                                                                            │
│  [Frontend]                   [Utilities]                                 │
│  ├─ React 18+                 ├─ date-fns       3.6.0 (Dates)           │
│  ├─ TypeScript    5.3.3        ├─ i18next        23.11.5 (i18n)         │
│  └─ Webpack/Vite              └─ js-yaml        4.1.1 (YAML)            │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════

                    INTEGRATION PATTERNS (3 Options)

OPTION A: MONOLITHIC RUST CLI ✅ RECOMMENDED
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  eket (single binary)                                        │
│  ├─ Core business logic (Rust)                              │
│  ├─ CLI commands (Rust + clap)                              │
│  └─ File operations, state mgmt (Rust)                      │
│                                                              │
│  Node.js Server (separate process)                           │
│  ├─ HTTP API (Express.js)                                   │
│  ├─ Web Dashboard (React)                                   │
│  └─ LLM runners (Anthropic SDK)                             │
│                                                              │
│  Communication: stdio, HTTP, or file-based queue            │
│  Pros: Clean separation, easier testing                     │
│  Cons: Two processes to coordinate                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘

OPTION B: NATIVE NODE.JS MODULE (WASM/NAPI)
┌──────────────────────────────────────────────────────────────┐
│  eket (Node.js CLI)                                          │
│  ├─ Native module (Rust via napi-rs)                        │
│  ├─ JavaScript wrapper layer                                │
│  └─ Seamless integration with existing tools                │
│                                                              │
│  Pros: Single process, easier deployment                    │
│  Cons: NAPI complexity, potential FFI overhead              │
│                                                              │
└──────────────────────────────────────────────────────────────┘

OPTION C: MICROSERVICES (Advanced)
┌──────────────────────────────────────────────────────────────┐
│  eket-core (Rust service on port 9090)                      │
│  ├─ All business logic                                      │
│  └─ REST API + WebSocket                                    │
│                                                              │
│  eket-api (Node.js service on port 3000)                    │
│  ├─ HTTP gateway (Express.js)                               │
│  ├─ Web Dashboard                                           │
│  └─ Orchestration & monitoring                              │
│                                                              │
│  Kubernetes ready, but adds complexity                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════

                    DECISION CHECKLIST (PRE-REWRITE)

Core Architecture Decisions:
  ☐ Monolithic Rust binary or Rust core + Node.js wrapper?
  ☐ Maintain backward compatibility with Node.js CLI?
  ☐ Support existing API consumers (external agents)?
  ☐ Modernize database (PostgreSQL) or keep SQLite+Redis?

Project Logistics:
  ☐ Timeline: 12 weeks (full-time) or 16 weeks (part-time)?
  ☐ Dedicated Rust developer or ramp-up team?
  ☐ Gradual migration or big-bang rewrite?
  ☐ Testing strategy: port all 95 tests or subset first?

Technology Choices:
  ☐ Single process or multi-process (Rust + Node.js)?
  ☐ FFI required? (NAPI, stdio, HTTP)
  ☐ Kubernetes deployment needed?
  ☐ Performance targets: 2-5x or 10x gains?

Success Metrics (Post-Rewrite):
  ☐ Startup time <200ms (vs 1.5-2s)
  ☐ Memory footprint <50MB (vs 100-150MB)
  ☐ Task claiming P95 <1ms (vs 2-3ms)
  ☐ Workflow throughput 500+ agents/s (vs 100/s)
  ☐ Test coverage ≥90% (matching Node.js)


═══════════════════════════════════════════════════════════════════════════════

                        KEY LEARNINGS

1. CLEAR SEPARATION OF CONCERNS
   └─ 53% of code is pure logic (portable to Rust)
   └─ 41% is tight to Node.js (HTTP, LLM SDKs)
   └─ 6% is infrastructure glue (scripts)

2. STRONG TYPE SYSTEM
   └─ 150+ error codes well-defined
   └─ Rich interfaces (Job, Task, Agent, Workflow)
   └─ Excellent candidate for Rust's type system

3. MULTI-LEVEL ARCHITECTURE ENABLES GRADUAL MIGRATION
   └─ Level 1 (Shell) → Rust binary (no Node.js)
   └─ Level 2 (Node.js) → Hybrid Rust + Node.js
   └─ Level 3 (Full-stack) → Distributed Rust

4. MESSAGE-DRIVEN DESIGN
   └─ State isolation via messages
   └─ Easy to test in Rust (pure functions)
   └─ Excellent for concurrent execution (tokio)

5. PROVEN ALGORITHMS
   └─ DAG evaluation (petgraph)
   └─ Master election (distributed locks)
   └─ Task recommendation (simple ML scoring)
   └─ All easily ported to Rust

═══════════════════════════════════════════════════════════════════════════════
```

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| **Total EKET codebase** | ~15,000 LOC |
| **Rust rewrite target** | ~7,930 LOC (53%) |
| **Expected Rust codebase** | ~6,200 LOC (20% reduction) |
| **Remain in Node.js** | ~6,070 LOC (41%) |
| **Core modules in scope** | 60+ files |
| **High-priority modules** | 42 (70%) |
| **CLI commands portable** | 20/30 (67%) |
| **Estimated timeline** | 12-16 weeks |
| **Expected startup gain** | 10-20x faster |
| **Expected performance gain** | 2-5x on hot paths |
| **Memory reduction** | 5-10x smaller |
| **Test files to port** | 95+ tests |

---

## Files Created for Your Reference

1. **EKET_RUST_REWRITE_SUMMARY.md** (this directory)
   - Complete 10-point analysis with actionable insights
   - Detailed module classification
   - Performance benchmarks and timeline

2. **Memory: eket/rust-rewrite-planning/comprehensive-analysis**
   - Full directory tree and module inventory
   - API routes and HTTP servers
   - Type system documentation
   - Three-level architecture explanation
   - Test coverage analysis

3. **Memory: eket/rust-rewrite-planning/quick-reference**
   - Decision matrix (Tier 1/2/3)
   - Technology stack recommendations
   - Performance projections
   - 12-16 week timeline with milestones
   - Integration strategy options

4. **Memory: eket/rust-rewrite-planning/module-mapping**
   - 1:1 TypeScript → Rust mapping
   - Detailed code examples
   - Cargo.toml template
   - Testing strategy
   - Module completion checklist

---

**Ready to start? Review the decision checklist above and confirm your answers to move forward with prototyping!**

