# EKET Framework

**EKET (Elite Knowledge & Engineering Team) - AI Multi-Agent Collaborative Development Framework | Version 2.3.0**
**Last Update**: 2026-04-16

[English](README.md) | [中文说明](README_zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bash](https://img.shields.io/badge/Bash-4.0+-green.svg)](https://www.gnu.org/software/bash/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-blue.svg)](https://nodejs.org/)

> **EKET (Elite Knowledge & Engineering Team)** is a **Multi-Agent Collaborative Development Framework** built specifically for AI Agents.
>
> It organizes advanced LLMs (like Gemini, Claude, GPT, or AI inside tools like Cursor) into a fully-equipped virtual engineering team. Through a highly structured **Master-Slaver Architecture**, EKET realizes full-lifecycle automated software production—from **requirements analysis**, **task planning**, and **workflow breakdown**, to **coding**, **unit testing**, and **code reviews**.
>
> 💡 **Core Philosophy: Serverless State Machine & Graceful Degradation**. EKET persists task states, message buses, and memory engines entirely within the local file system and Git repository. Using a progressive three-level architecture ("Pure Shell -> Node.js -> Redis+SQLite"), it automatically downgrades based on environmental dependencies, ensuring that full multi-agent collaboration works out of the box even without any external services.

## 🎯 Vision & Mission

- **Vision**: Return software engineering to pure design and creation. By utilizing powerful multi-agent collaboration to handle the tedious processes of coding, testing, and reviewing, we aim to build a 24/7 virtual R&D center where "you only need to point the direction, without intervening in the code details."
- **Mission**: Provide a standard, reliable, gracefully degradable AI collaboration protocol. We overcome the "hallucination" limits of LLMs by introducing strict engineering workflows (upfront requirements analysis, strict role isolation, TDD, mandatory PR reviews), injecting industrial-grade usability and robustness into automated AI programming.

## 🌟 Core Concepts & Features

- 🤖 **"Virtual Engineering Team" Mechanism**: Clear division of responsibilities. A Master (Product Manager/Tech Lead) manages requirements and code merging, while delegating tasks to multiple specialized Slavers (e.g., `frontend_dev`, `backend_dev`, `qa_engineer`) executing in parallel, preventing boundary crossing and hallucination accumulation.
- ⚙️ **Industrial-Grade Constraints**: AI generation is no longer chaotic. Built-in, strict engineering standards such as Feature branch workflows, TDD (Test-Driven Development), and mandatory Pre-coding Analysis Reports ensure output quality.
- 🧠 **Multi-Level Persistent Memory Engine**: Layered memory management (short-term session cache, long-term project experience dictionary, and Confluence global architecture external brain) allows the team to understand your project better over time.
- 🛡️ **Three-Level Elastic Runtime (Graceful Degradation)**:
  - **Level 1 (Pure Shell)**: Zero dependencies, instant startup. Runs purely on any restricted machine.
  - **Level 2 (Node.js)**: Includes Web Dashboard and a robust queue mechanism preventing concurrent file conflicts. Targeted at most local development scenarios.
  - **Level 3 (Hybrid Full-Stack)**: Connects to Redis/SQLite for high availability, designed for high-concurrency production scenarios with multi-role agent clusters.

---

## 🚀 30-Second Quick Start (Level 1 - Shell Mode)

**Zero dependencies, Pure Bash, Ready out of the box!**

```bash
# 1. Clone the repository
git clone https://github.com/godlockin/eket.git
cd eket

# 2. Start the Master
./scripts/eket-start.sh --role master

# 3. (In a new terminal) Start a Slaver
./scripts/eket-start.sh --role slaver --profile backend_dev

# Done! Collaboration begins 🎉
```

**Prerequisites**:
- ✅ Bash >= 4.0
- ✅ Git >= 2.30
- ❌ Node.js NOT required
- ❌ Redis NOT required
- ❌ Zero Installation

---

## 📚 Three-Level Architecture - Progressive Enhancement

EKET utilizes a **Progressive Three-Level Architecture** to secure stable operations across different environments:

### Level 1: Shell + File System (Basic) ⭐⭐⭐⭐⭐

**Goal**: Core functions available with zero configuration.

```bash
# Start in 30 seconds, zero external dependencies required
./scripts/eket-start.sh --role master
```

**Features**:
- ✅ Master-Slaver Collaboration
- ✅ Task Assignment & Claiming
- ✅ File Queue Messaging
- ✅ Heartbeat Monitoring
- ✅ Status Tracking

**Dependencies**: Bash 4.0+, Git 2.30+
**Use Case**: Quick trial, minimal footprint deployment, pure Shell environments.

---

### Level 2: Node.js + File Queue (Enhanced) ⭐⭐⭐⭐

**Goal**: Higher efficiency, professional features, richer experience.

```bash
# Install and build
cd node && npm install && npm run build

# Start (Automatically uses Node.js mode)
node dist/index.js instance:start --role master

# Web Dashboard
node dist/index.js web:dashboard --port 3000
```

**Added Features**:
- ✅ TypeScript Type Safety
- ✅ Rich CLI commands
- ✅ Optimized File Queue (deduplication, archiving, validation)
- ✅ Circuit Breaker & Retry Mechanism
- ✅ LRU Memory Cache
- ✅ Web Dashboard
- ✅ OpenCLAW Gateway

**Dependencies**: Node.js 18+, npm 9+
**Use Case**: Local development, team collaboration, performance improvements.

---

### Level 3: Redis + SQLite (Full Power) ⭐⭐⭐

**Goal**: Production-ready, high concurrency, distributed deployment.

```bash
# Start Redis (Docker recommended)
docker run -d --name eket-redis -p 6379:6379 redis:7-alpine

# Start (Automatically detects Redis, enters Full Power mode)
node dist/index.js instance:start --role master
```

**Added Features**:
- ✅ Redis Pub/Sub Real-time Messaging
- ✅ Redis Connection Pool & Master/Slave failover
- ✅ SQLite Persistent Storage (WAL mode)
- ✅ Three-level Master Election
- ✅ Distributed Cache (LRU + Redis)
- ✅ Knowledge Base System
- ✅ Transaction Support

**Dependencies**: Level 2 + Redis 6.0+, SQLite 3.35+, Docker (optional)
**Use Case**: Production environments, high concurrency, distributed setups.

---

## 🔄 Runtime Automatic Degradation

The system automatically downgrades based on the availability of dependencies:

```
Level 3 (Redis + SQLite)
  ↓ Redis Unavailable
Level 2 (Node.js + File Queue)
  ↓ Node.js Unavailable
Level 1 (Shell + File Queue)
  ↓ All Failed
Graceful Exit + Error Logs
```

**Check current run level**:
```bash
./lib/adapters/hybrid-adapter.sh check

# Example Output:
# [INFO] Node.js: ✅ Available
# [INFO] Redis: ❌ Unavailable
# [INFO] Shell: ✅ Available
# [INFO] Current Run Level: Level 2 (Node.js + File Queue)
```

---

## 🎯 Core Philosophy

> **Everything is a Task** — From requirements analysis to merging code, every operation is a Task, just differing in difficulty and duration.

Each Agent is an independent Instance that actively claims tasks matching its specified role.

---

## 🏗️ Master-Slaver Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Master Node (Long-lived)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Monitor     │  │ PR Review   │  │ Scheduler   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
  ┌────────────┐  ┌────────────┐  ┌────────────┐
  │  Slaver 1  │  │  Slaver 2  │  │  Slaver N  │
  │ (Frontend) │  │ (Backend)  │  │  (QA)      │
  └────────────┘  └────────────┘  └────────────┘
```

---

## 📋 Common Commands

### Level 1 (Shell)

```bash
# Start Master/Slaver
./scripts/eket-start.sh --role master
./scripts/eket-start.sh --role slaver --profile backend_dev

# Heartbeat Monitor
./scripts/heartbeat-monitor.sh

# Generate Statistics Report
./scripts/generate-stats.sh

# Docker Service Management
./scripts/docker-redis.sh      # Start/Stop Redis
./scripts/docker-sqlite.sh     # Manage SQLite

# View Help
./lib/adapters/hybrid-adapter.sh --help
```

### Level 2/3 (Node.js)

```bash
# Build
cd node && npm run build

# System Doctor
node dist/index.js system:doctor

# Instance Management
node dist/index.js instance:start --auto
node dist/index.js instance:start --human --role frontend_dev

# Redis Operations (Level 3)
node dist/index.js redis:check
node dist/index.js redis:list-slavers

# SQLite Operations (Level 3)
node dist/index.js sqlite:check
node dist/index.js sqlite:list-retros
node dist/index.js sqlite:search "<keyword>"

# Web Services
node dist/index.js web:dashboard --port 3000
node dist/index.js hooks:start --port 8899
node dist/index.js gateway:start --port 8080  # OpenCLAW Gateway

# Benchmarking (Level 3)
node benchmarks/simple-benchmark.js
```

---

## 📊 Feature Comparison

| Feature | Level 1 | Level 2 | Level 3 |
|---------|:-------:|:-------:|:-------:|
| **Master-Slaver Collab.** | ✅ | ✅ | ✅ |
| **Task Claiming** | ✅ | ✅ | ✅ |
| **Heartbeat Monitor** | ✅ | ✅ | ✅ |
| **Messaging** | File Queue | Optimized File Queue | Redis Pub/Sub |
| **Message Deduplication** | ❌ | ✅ | ✅ |
| **Circuit Breaker/Retry** | ❌ | ✅ | ✅ |
| **LRU Cache** | ❌ | Memory | Memory + Redis |
| **Master Election** | File Lock | File Lock | Redis + SQLite + File |
| **Knowledge Base** | ❌ | ❌ | ✅ |
| **Web Dashboard** | ❌ | ✅ | ✅ |
| **OpenCLAW Integration**| ❌ | ✅ | ✅ |
| **Distributed Deploy** | ❌ | ❌ | ✅ |
| **Startup Time** | 30s | 1-2 mins | 2-3 mins |
| **Memory Footprint** | <10MB | 50-100MB | 100-200MB |

---

## 📖 Documentation Navigation

### Quick Start
- **[30 Second Start](docs/guides/QUICK-START.md)** - Level 1 Shell mode quick start
- **[Three-Level Architecture Detailed](docs/architecture/THREE-LEVEL-ARCHITECTURE.md)** - Architecture design and capability choices
- **[Degradation Strategy](docs/architecture/DEGRADATION-STRATEGY.md)** - Automatic fallback mechanism

### Level 1 Docs (Shell & File)
- **[Shell Mode Guide](docs/guides/SHELL-MODE.md)** - Pure shell operational guide
- **[File Queue Details](docs/architecture/FILE-QUEUE.md)** - File-based messaging queue mechanism
- **[Shell Scripts Reference](docs/guides/SHELL-SCRIPTS.md)** - Description of all provided scripts

### Level 2 Docs (Node.js)
- **[Node.js Mode Guide](docs/guides/NODEJS-MODE.md)** - Node.js features and CLI usage
- **[CLI Command Reference](docs/guides/CLI-COMMANDS.md)** - Complete list of CLI commands
- **[Web Dashboard](docs/api/WEB-DASHBOARD.md)** - Dashboard reference

### Level 3 Docs (Full Power)
- **[Full Power Mode Guide](docs/guides/FULL-STACK-MODE.md)** - Redis & SQLite configurations
- **[Performance Optimization](docs/performance/OPTIMIZATION.md)** - Tuning guides
- **[Distributed Deployment](docs/guides/DISTRIBUTED-DEPLOYMENT.md)** - Multi-node deployment strategies

### Architecture Design
- **[Master-Slaver Architecture](docs/architecture/MASTER-SLAVER.md)** - Core architectural patterns
- **[Connection Manager](docs/architecture/CONNECTION-MANAGER.md)** - Four-level degradation logic
- **[Message Queue](docs/architecture/MESSAGE-QUEUE.md)** - Redis Pub/Sub & File Queue combo design

### Development Guides
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute code
- **[Testing Guide](docs/guides/TESTING.md)** - Test framework and case designs
- **[Development Flow](docs/guides/DEVELOPMENT.md)** - Best practices for development

---

## 🎓 Recommended Use Cases

### Case 1: Quick Try-out
**Recommendation**: **Level 1** (Shell)
```bash
git clone https://github.com/godlockin/eket.git && cd eket
./scripts/eket-start.sh --role master
```
**Why**: Zero configuration required, 30-second full experience.

---

### Case 2: Local Project Development
**Recommendation**: **Level 2** (Node.js + File Queue)
```bash
cd node && npm install && npm run build
node dist/index.js instance:start --role master
node dist/index.js web:dashboard --port 3000
```
**Why**: Rich features, no external footprint/dependencies, Web UI available.

---

### Case 3: Team Collaboration
**Recommendation**: **Level 3** (Redis + SQLite)
```bash
docker run -d --name eket-redis -p 6379:6379 redis:7-alpine
node dist/index.js instance:start --role master
```
**Why**: Resilient real-time messaging, supports high-concurrency Slaver instances.

---

### Case 4: Enterprise Production
**Recommendation**: **Level 3** + High Availability
```bash
# Redis Master/Slave config
# Scheduled SQLite backups
# Multi-Master Election
# Full Monitoring/Alerts
```
**Why**: Distributed support, HA guarantee.

---

## 🛠️ Environment Variables

```bash
# General Configurations
export EKET_LOG_LEVEL=info          # debug | info | warn | error
export EKET_LOG_DIR=./logs

# Level 3 Redis Config
export EKET_REDIS_HOST=localhost
export EKET_REDIS_PORT=6379
export EKET_REMOTE_REDIS_HOST=      # Remote Redis (Master/Slave)

# Level 3 SQLite Config
export EKET_SQLITE_PATH=~/.eket/data/sqlite/eket.db

# Level 3 Performance Config
export EKET_MEMORY_WARNING_THRESHOLD=0.75
export EKET_MEMORY_CRITICAL_THRESHOLD=0.9
```

---

## 📊 Performance Benchmarks (Level 3)

**Round 4 Verification Data** (2026-04-08, Docker Redis):

| Operation | P95 Latency | Target | Result |
|-----------|-------------|--------|--------|
| Redis Write | 0.96ms | <5ms | ✅ |
| Redis Read | 0.53ms | <5ms | ✅ |
| SQLite Insert (WAL) | 0.04ms | <10ms | ✅ |
| SQLite Select | 0.00ms | <10ms | ✅ |
| File Queue Enqueue | 1.30ms | <20ms | ✅ |
| File Queue Dequeue | 1.09ms | <20ms | ✅ |

**Run Benchmark**:
```bash
node node/benchmarks/simple-benchmark.js
```

Detailed Report: [Performance Test Report](docs/performance/TASK-015-completion-report.md)

---

## 🤝 Contributing

We welcome code contributions, documentation updates, or new Issues! Please read the [Contributing Guide](CONTRIBUTING.md).

---

## 📜 License

[MIT License](LICENSE)

---

## 🔗 Related Links

- **GitHub**: https://github.com/godlockin/eket
- **Docs**: [docs/](docs/)
- **Issues**: https://github.com/godlockin/eket/issues
- **Discord**: (To be established)

---

## 🎯 Version History

- **v2.3.0** (2026-04-08) - Round 3 fully bootstrapped, pass rate 87%, performance validated
- **v2.2.0** (2026-04-07) - Round 2 massive optimizations, 35,775+ lines of code
- **v2.1.1** (2026-04-06) - Round 1 self-bootstrap system first run
- **v2.0.0** (2026-04-05) - Node.js hybrid architecture, three-level degradation

See details in: [CHANGELOG.md](CHANGELOG.md)

---

**Start your EKET journey today!** 🚀

```bash
git clone https://github.com/godlockin/eket.git && cd eket
./scripts/eket-start.sh --role master
```
