# mini-swe-agent 架构分析

> 分析日期: 2026-05-25
> 源码版本: mini-swe-agent main branch

---

## 1. 核心发现

**100 行达到 74% SWE-bench 的秘密**:

1. **依赖 LLM 能力提升** — 2024+ 模型（Gemini 3 Pro）本身能力足够强
2. **极简工具集** — 只用 Bash，不搞复杂工具链
3. **线性历史** — 所有交互追加到 messages，便于调试和微调
4. **无状态执行** — 每个命令独立运行，无需维护 shell 状态

---

## 2. 核心类分析

### 2.1 DefaultAgent 类

```python
class DefaultAgent:
    def __init__(self, model: Model, env: Environment, **kwargs):
        self.messages: list[dict] = []  # 线性历史
        self.model = model              # LLM 接口
        self.env = env                  # Bash 环境
        self.cost = 0.0                 # 成本追踪
        self.n_calls = 0                # 调用计数
```

**关键设计**:
- `messages` 是核心数据结构，所有交互线性追加
- 无复杂状态机，只有 messages → query → execute 循环

### 2.2 run() 方法

```python
def run(self, task: str = "") -> dict:
    # 1. 初始化 system + instance message
    self.messages = []
    self.add_messages(
        system_message,
        instance_message  # 包含 task 描述
    )
    
    # 2. 循环执行直到 exit
    while True:
        self.step()
        if self.messages[-1].get("role") == "exit":
            break
    
    return self.messages[-1].get("extra", {})
```

**关键设计**:
- 循环结构极简：step() 直到 exit
- 退出条件：最后一条消息 role == "exit"

### 2.3 step() 方法

```python
def step(self) -> list[dict]:
    return self.execute_actions(self.query())
```

**一行代码完成一轮交互**:
1. `query()` — 调用 LLM，获取响应
2. `execute_actions()` — 执行响应中的 actions

### 2.4 query() 方法

```python
def query(self) -> dict:
    # 1. 检查限制
    if step_limit_exceeded or cost_limit_exceeded:
        raise LimitsExceeded(...)
    
    # 2. 调用 LLM
    self.n_calls += 1
    message = self.model.query(self.messages)
    self.cost += message.get("extra", {}).get("cost", 0.0)
    
    # 3. 追加到历史
    self.add_messages(message)
    return message
```

**关键设计**:
- 内置成本和步数限制
- 自动追踪 cost

### 2.5 execute_actions() 方法

```python
def execute_actions(self, message: dict) -> list[dict]:
    outputs = [self.env.execute(action) 
               for action in message.get("extra", {}).get("actions", [])]
    return self.add_messages(
        *self.model.format_observation_messages(message, outputs, ...)
    )
```

**关键设计**:
- 从 LLM 响应中提取 actions
- 通过 env.execute() 执行（Bash）
- 将输出格式化为 observation 追加到历史

---

## 3. 与 EKET 对比

| 维度 | mini-swe-agent | EKET |
|------|----------------|------|
| 核心数据结构 | `messages: list[dict]` | 多层状态（SQLite/Redis/文件） |
| 执行环境 | Bash 无状态 | Shell 持久 session |
| 工具集 | 只有 Bash | 41 个 CLI 命令 |
| 协作模式 | 单 Agent | Master-Slaver |
| 知识沉淀 | 无 | SQLite + FTS |
| 成本追踪 | ✅ 内置 | ✅ 有但分散 |
| 中断恢复 | ❌ | ✅ Checkpoint |

---

## 4. 借鉴点

### 4.1 极简核心（P0）

提取 EKET Slaver 的核心执行循环：

```rust
// 目标：100 行核心
pub struct MiniSlaver {
    messages: Vec<Message>,
    model: Box<dyn Model>,
    env: BashEnv,
    cost: f64,
}

impl MiniSlaver {
    pub fn run(&mut self, task: &str) -> Result<Submission> {
        self.init_messages(task);
        while !self.is_exit() {
            self.step()?;
        }
        self.get_submission()
    }
    
    fn step(&mut self) -> Result<()> {
        let response = self.query()?;
        self.execute_actions(&response)
    }
}
```

### 4.2 线性历史导出（P0）

增加 trajectory 导出功能：

```rust
pub fn serialize(&self) -> TrajectoryData {
    TrajectoryData {
        messages: self.messages.clone(),
        cost: self.cost,
        n_calls: self.n_calls,
        exit_status: self.exit_status(),
    }
}
```

### 4.3 无状态 Bash 模式（P1）

可选的执行模式：

```rust
pub enum ExecutionMode {
    Stateful,   // 当前 EKET 模式：持久 shell session
    Stateless,  // mini-swe-agent 模式：每命令独立
}
```

### 4.4 内置成本限制（P1）

```rust
pub struct Limits {
    pub max_steps: usize,
    pub max_cost: f64,
    pub max_time_secs: u64,
}
```

---

## 5. 不借鉴的部分

| 特性 | 理由 |
|------|------|
| 单 Agent 模式 | EKET Master-Slaver 协作是核心优势 |
| 无知识沉淀 | EKET 的知识库是差异化价值 |
| Python 实现 | EKET Rust 性能更好 |
| 无专家组 | EKET 动态专家组是特色 |

---

## 6. 实施建议

### Phase 1: 提取 MiniSlaver（1 周）

1. 从现有 Slaver 代码提取核心循环
2. 目标：500 行 Rust 实现
3. 保持与完整 Slaver 的兼容性

### Phase 2: Trajectory 导出（3 天）

1. 实现 `serialize()` 方法
2. 支持 JSON 导出
3. 与 SWE-bench 格式兼容

### Phase 3: 双模式执行（1 周）

1. 实现 Stateless Bash 模式
2. 配置切换
3. 性能对比测试

---

## 7. 参考

- [mini-swe-agent 源码](https://github.com/SWE-agent/mini-swe-agent)
- [minimal-agent.com 教程](https://minimal-agent.com)
- [SWE-bench 评测](https://github.com/SWE-bench/SWE-bench)

---

*Analysis by EKET Master @ 2026-05-25*
