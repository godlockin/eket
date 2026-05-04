# EKET Framework

**EKET (Elite Knowledge & Engineering Team) — Human-AI Special Forces Team Coordination Protocol | Version 2.14.0-beta**
**Last Update**: 2026-04-26

[English](README.md) | [中文说明](README_zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg)](https://www.rust-lang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-blue.svg)](https://nodejs.org/)
[![Bash](https://img.shields.io/badge/Bash-4.0+-green.svg)](https://www.gnu.org/software/bash/)

> **EKET (Elite Knowledge & Engineering Team)** is a **Human-AI Special Forces Team Coordination Protocol** — not a solo tool, not a large team platform.
>
> The target formation: **1–5 humans** setting direction, making decisions, and reviewing output — plus **N AI Slavers** handling execution at scale. A human Slaver and an AI Slaver follow the exact same protocol: claim a ticket, deliver, get reviewed. The protocol doesn't care which kind you are.
>
> 💡 **Core Philosophy: Human judgment × AI execution density**. EKET persists task states, message buses, and memory engines entirely within the local file system and Git — three physically separate repos (confluence / jira / code). Using a **four-level progressive architecture** (Shell → Rust → Node.js → Shell fallback), it automatically degrades based on available infrastructure, ensuring reliable multi-agent delivery even without cloud services.

## 🎯 Vision & Mission

- **Vision**: A coordination protocol for human-AI special forces teams: 1–5 humans setting direction, N AI agents handling execution at scale. The same protocol works whether a Slaver is human or AI — both claim tickets, deliver, and get reviewed identically.
- **Mission**: Make AI agents production-grade collaborators, not toys. Through strict role isolation (Master controls direction, Slavers own execution), file-system-native state persistence, and graceful degradation from Rust → Shell, EKET ensures reliable multi-agent software delivery even without cloud infrastructure.

## 🌟 Core Concepts & Features

- 🤖 **Special Forces Team Model**: 1–5 humans provide direction and final judgment. N AI Slavers execute tickets in parallel. Human and AI Slavers are interchangeable — same ticket schema, same mailbox protocol, same PR review gate.
- 🗂️ **Three-Repo Physical Separation**: `repo-confluence/` (knowledge base), `repo-jira/` (ticket lifecycle), and `repo-code/` (deliverables) are three independent Git repos. Communication happens via mailbox files, file queues, and SSE.
- ⚙️ **Industrial-Grade Constraints**: Feature branch workflows, TDD, mandatory Analysis Reports, required PR reviews — prevent hallucination accumulation.
- 🧠 **Multi-Level Persistent Memory Engine**: Layered memory management (session cache, project experience dictionary, Confluence global knowledge base).
- 🛡️ **Four-Level Elastic Runtime (Graceful Degradation)**:
  - **Level 0 (Pure Shell)**: Zero dependencies, instant startup. Runs on any machine.
  - **Level 1 (Rust)**: High-performance core (~21ms/cmd, ~12MB memory). axum HTTP API for Dashboard.
  - **Level 2 (Node.js)**: Web Dashboard, OpenCLAW Gateway, Claude API integration.
  - **Level 3 (Shell fallback)**: Engaged when Node.js is unavailable.

---

## 🚀 Quick Start

### Rust CLI (Recommended — ~21ms/cmd)

```bash
# Build and install
cd rust && cargo build --release
cp target/release/eket ~/.local/bin/

# Verify connectivity
eket system:doctor

# Register a Slaver and start working
eket slaver:register --role backend --skills rust
eket task:claim
```

### Shell Mode (Zero dependencies)

```bash
git clone https://github.com/godlockin/eket.git && cd eket
./scripts/eket-start.sh --role master
```

### Node.js Web Layer

```bash
cd node && npm install && npm run build
node dist/index.js server:start        # starts Rust server + Node web layer
node dist/index.js web:dashboard --port 3000
```

---

## 🏗️ Four-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│  Level 0: Shell   lib/adapters/hybrid-adapter.sh    │  zero deps, always available
├─────────────────────────────────────────────────────┤
│  Level 1: Rust    eket binary + axum :9877          │  high-performance core (NEW)
│  ├── CLI (clap): claim / complete / task:create …   │
│  ├── core/: SQLite, Redis, Election, Queue, Cache   │
│  └── HTTP API (/api/v1/*) for Node.js Dashboard     │
├─────────────────────────────────────────────────────┤
│  Level 2: Node.js (Web / LLM layer)                 │  web UI + Claude API
│  ├── web-server (Express) → Dashboard               │
│  ├── openclaw-gateway → LLM proxy                   │
│  └── claude-runner → Claude API calls               │
├─────────────────────────────────────────────────────┤
│  Level 3: Shell fallback (Node.js unavailable)      │
└─────────────────────────────────────────────────────┘
```

Degradation order: `Rust → Node.js → Shell → graceful exit`

---

## 📊 Performance (Rust vs Node.js)

| Operation | Rust | Node.js | Improvement |
|-----------|------|---------|-------------|
| `task:claim` | ~21ms | ~400ms | **19×** |
| Startup time | ~8ms | ~1,500ms | **187×** |
| Memory footprint | ~12MB | ~120MB | **10×** |
| Test suite | 253 unit tests | 1,519 unit tests | — |

---

## 📋 Core Commands

```bash
# Rust CLI
eket system:doctor
eket task:create "ticket title" [--priority P1]
eket task:claim [TASK-NNN]
eket task:complete TASK-NNN
eket master:heartbeat             # long-running Master loop
eket slaver:poll                  # long-polling mailbox

# Node.js (web layer)
node dist/index.js web:dashboard --port 3000
node dist/index.js gateway:start --port 8080
```

Full command reference: [`.claude/skills/eket/SKILL.md`](.claude/skills/eket/SKILL.md)

---

## 📖 Documentation

| Resource | Description |
|----------|-------------|
| [`docs/`](docs/README.md) | Architecture, guides, ADRs, ops runbooks |
| [`template/docs/MASTER-RULES.md`](template/docs/MASTER-RULES.md) | Master role rules |
| [`template/docs/SLAVER-RULES.md`](template/docs/SLAVER-RULES.md) | Slaver role rules |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code session instructions |
| [`CHANGELOG.md`](CHANGELOG.md) | Full version history |
| [`confluence/memory/`](confluence/memory/memory-index.md) | Project knowledge base |

---

## 🛠️ Development

```bash
# Rust
cd rust && cargo build --release && cargo test --workspace

# Node.js
cd node && npm run build && npm test && npm run lint

# End-to-end smoke test
bash tests/e2e_smoke.sh
```

---

## 🎯 Version History

See [`CHANGELOG.md`](CHANGELOG.md) for full history.

- **v2.14.0-beta** (2026-04-26) — Red team: 14 bugs fixed (1 P0 + 7 P1 + 6 P2); 253 Rust + 1519 Node tests
- **v2.13.0** (2026-04-21) — Rust migration complete; axum API server; four-level degradation
- **v2.9.0-alpha** (2026-04-16) — Master-Slaver Rust CLI bootstrap; three-level degradation

---

## 🤝 Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Branch strategy: `feature/*` → `testing` → `main` → `miao`.

## 📜 License

[MIT License](LICENSE)
