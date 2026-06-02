# TASK-635: 降级检测 + 自动路由

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P0  
**预估**: 1d  
**依赖**: TASK-632, TASK-633, TASK-634  
**层级**: All

---

## 目标

实现 DAG 执行层自动检测和路由：Rust → Node → Shell 降级链。

## 验收标准

- [x] `eket dag:run` 自动选择最优执行层
- [x] 降级日志清晰：`[DAG] Using L1 Rust engine`
- [x] 健康检查命令：`eket dag:health`
- [x] 强制指定层级：`--engine=shell|node|rust`
- [x] 单元测试：各层级检测逻辑

## 检测逻辑

```
┌─────────────────────────────────────┐
│ 1. 检测 Rust 可用性                  │
│    - which eket                     │
│    - eket dag:health                │
│    - SQLite 可写                    │
│                                     │
│    ✅ → 使用 L1 Rust                 │
│    ❌ → 继续检测                     │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ 2. 检测 Node.js 可用性               │
│    - which node                     │
│    - node -e "require('./dist/dag')"│
│    - node dist/index.js dag:health  │
│                                     │
│    ✅ → 使用 L2 Node                 │
│    ❌ → 继续检测                     │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ 3. Shell 兜底                        │
│    - 无需检测，POSIX 保证可用         │
│    → 使用 L0 Shell                   │
└─────────────────────────────────────┘
```

## 实现位置

### Rust 入口

```rust
// rust/crates/eket-cli/src/commands/dag.rs
pub async fn run(yaml_path: &Path, options: &RunOptions) -> Result<()> {
    let level = match options.engine {
        Some(Engine::Rust) => EngineLevel::Rust,
        Some(Engine::Node) => EngineLevel::Node,
        Some(Engine::Shell) => EngineLevel::Shell,
        None => detect_best_engine().await?,
    };
    
    info!("[DAG] Using {} engine", level);
    
    match level {
        EngineLevel::Rust => rust_engine::execute(yaml_path).await,
        EngineLevel::Node => spawn_node_executor(yaml_path).await,
        EngineLevel::Shell => spawn_shell_runner(yaml_path).await,
    }
}
```

### Shell 入口

```bash
# scripts/dag-run.sh — 统一入口
#!/bin/bash

detect_engine() {
    if command -v eket &>/dev/null && eket dag:health &>/dev/null; then
        echo "rust"
    elif command -v node &>/dev/null && node dist/index.js dag:health &>/dev/null; then
        echo "node"
    else
        echo "shell"
    fi
}

ENGINE=${EKET_DAG_ENGINE:-$(detect_engine)}
echo "[DAG] Using L${ENGINE} engine"

case "$ENGINE" in
    rust)  eket dag:run "$@" ;;
    node)  node dist/index.js dag:run "$@" ;;
    shell) scripts/dag-runner.sh "$@" ;;
esac
```

## CLI 命令

```bash
# 自动检测
eket dag:run dag.yml

# 强制指定
eket dag:run --engine=shell dag.yml
eket dag:run --engine=node dag.yml
eket dag:run --engine=rust dag.yml

# 健康检查
eket dag:health
# 输出:
# [DAG] Engine availability:
#   L1 Rust:  ✅ available (eket v2.9.0, SQLite OK)
#   L2 Node:  ✅ available (node v20.x, dag module OK)
#   L0 Shell: ✅ available (bash 5.x)
# [DAG] Recommended: L1 Rust
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EKET_DAG_ENGINE` | 强制指定引擎 | 自动检测 |
| `EKET_DAG_FALLBACK` | 禁用降级 | true |

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket | Master |
| 2026-06-01 | 实现完成 | Slaver |

## 实现产出物

### 1. Shell 统一入口 (`scripts/dag-run.sh`)
- 自动检测最优执行引擎
- 支持 `--health` 显示引擎可用性
- 支持 `--engine=rust|node|shell` 强制指定
- 支持 `--dry-run` 预览模式
- 支持 `EKET_DAG_ENGINE` / `EKET_DAG_FALLBACK` 环境变量

### 2. Node.js CLI 命令 (`node/src/commands/dag-commands.ts`)
- `dag:run <file>` - 执行 DAG（自动检测或指定引擎）
- `dag:health` - 显示引擎可用性状态
- `dag:validate <file>` - 验证 DAG 结构
- `dag:status <runId>` - 查看运行状态

### 3. 降级检测逻辑
```
L1 Rust:  which eket && eket dag:health → 高性能模式
L2 Node:  node v20+ && dag-executor.js → TypeScript + EventBus
L0 Shell: dag-runner.sh (POSIX fallback)
```

### 4. 降级日志示例
```
[DAG] Using L1 Rust engine
[DAG] Fallback to L2 Node (Rust unavailable: eket dag:health failed)
[DAG] Fallback to L0 Shell (Node unavailable: node version < 20)
```
