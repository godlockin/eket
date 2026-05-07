# EKET 框架探索总结

## 1. 专家 Persona 文件结构

### 位置
- **默认专家（7 位）**：`~/.claude/skills/eket/experts/default/`
  - `architect.md` — 系统架构师
  - `backend.md` — 后端工程师
  - `frontend.md` — 前端工程师（读未提供）
  - `fullstack.md` — 全栈工程师（读未提供）
  - `product.md` — 产品经理
  - `ux.md` — UI/UX 设计师
  - `tester.md` — 测试工程师（读未提供）

- **可选专家（53 位）**：`~/.claude/skills/eket/experts/optional/`
  - `tech/`（8 位）：security, devops, qa, dba, sre, mobile, performance, platform
  - `ai/`（8 位）：aiml, ml, nlp, cv, mlops, bigdata, data-analyst, data
  - `design/`（5 位）：ux-research, visual, brand, motion, industrial
  - `marketing/`（5 位）：growth, content, seo, ads, product-marketing
  - `pr/`（4 位）：pr-manager, crisis, media, kol
  - `business/`（5 位）：business, strategy, finance, legal
  - 其他 18 位

### 专家文件字段（YAML 格式）
```yaml
id: eket.{domain}.001              # 专家 ID
name: {English Name}                # 英文名
name_cn: {中文名}                   # 中文名
role: {Title}                       # 角色标题
emoji: {Emoji}                      # 表情符号
domain: {domain}                    # 领域标识
tier: default|optional              # 层级

personality:
  type: {MBTI}                      # MBTI 人格类型
  traits:                           # 核心特质列表
    - {trait}
  communication_style: {描述}       # 沟通风格
  strengths: {文本}                 # 优势领域
  weaknesses: {文本}                # 劣势领域

background:
  experience: {年数和主题}          # 工作经验
  domain_expertise:                 # 专业领域列表
    - {领域}
  notable_skills:                   # 核心技能列表
    - {技能}

thinking_framework:                 # 思维框架（列表）
  - {框架 1}
  - {框架 2}
  - {框架 3}

analysis_focus:                     # 分析焦点（列表）
  - {焦点 1}
  - {焦点 2}
  - ...

output_format: |                    # 输出模板
  ## {标题}
  ### {小节}
  ...

phase: {1|2}                        # 执行阶段
  # phase 1: 先行分析
  # phase 2: 基于 phase 1 深入分析
```

### 示例数据（Architect）
- **personality.type**: INTJ
- **personality.traits**: 冷静理性、全局思维、追求简洁、直言不讳
- **background.experience**: 15年大规模系统设计
- **thinking_framework**: 第一性原理、分层视角、依赖倒置、变化点识别
- **analysis_focus**: 模块划分、核心依赖链、技术选型、系统边界、架构债务
- **phase**: 1 —— 先行分析，产出全局视图供其他专家参考

---

## 2. Skills 系统现状

### 现有状态：**有完整实现**

#### Node.js 端 Skills 系统
- **位置**：`node/src/skills/` 和 `node/src/core/skill-*.ts`
- **核心模块**：
  - `skill-executor.ts` — Skill 加载和执行引擎
  - `skill-generator.ts` — 从 ticket 复盘自动生成 Skill
  - `skill-stacker.ts` — Skill 堆栈管理
  - `index-loader.ts` — Skill 索引加载
  - `registry.ts` — Skill 注册表
  - `auto-registry.ts` — 自动注册机制
  - `types.ts` — Skill 类型定义
  - `unified-interface.ts` — 统一接口

#### CLI 命令
- **Node.js**：`node dist/index.js skill:extract --ticket <id> --summary <text>`
- **Rust**：`./eket skill:extract` 子命令

#### Skill 信息提取
- **命令**：`skill:extract`
- **功能**：从 `.eket/ACTIVE_CONTEXT.md` 读取 domain，然后从 `node/src/skills/<domain>.json` 加载 trigger 列表
- **输出**：
  ```json
  {
    "skills": ["trigger1", "trigger2", ...],
    "domain": "backend"
  }
  ```

---

## 3. skill_extract.rs 详解

### 位置
`rust/crates/eket-cli/src/commands/skill_extract.rs`

### 功能流程
1. **查找项目根目录**：向上搜索包含 `jira/tickets` 和 `.eket` 的目录
2. **解析 domain**：从 `.eket/ACTIVE_CONTEXT.md` 的 `## Active Ticket` 小节查找 `domain:` 字段
3. **加载 Skill 触发器**：读取 `node/src/skills/<domain>.json`，提取 `triggers` 数组
4. **输出 JSON**：
   ```json
   {
     "skills": ["skill1", "skill2"],
     "domain": "backend"
   }
   ```

### 核心函数
- `find_project_root()` — 递归查找项目根（检查 `jira/tickets` + `.eket` 同时存在）
- `parse_domain(&str)` — 从 Markdown 解析 domain（支持 `:` 和 `：`）
- `load_skills_from_domain()` — 从 JSON 加载 trigger 列表

### 关键特性
- 支持中英文冒号分隔符（`:` 和 `：`）
- 单元测试完整（3 个 test cases）
- 容错设计：找不到文件 → 返回空数组

---

## 4. SLAVER-RULES.md 中关于 Skills 使用的描述

### 主要章节

#### 第 2 节：启动流程 - 加载活跃上下文（TASK-079）
```
IF .eket/ACTIVE_CONTEXT.md 存在:
  → 读取并展示文件内容
  → 确认当前 ticket ID、角色、领取时间
  → 继续上次中断的工作（无需重新 claim）
ELSE:
  → 执行正常领取流程（/eket-claim）
```
- **文件位置**：`.eket/ACTIVE_CONTEXT.md`
- **自动生成时机**：每次成功 claim 后由 `injectActiveContext()` 刷新
- **防止遗忘**：防止 Slaver 重启后遗忘当前任务、重复领取或错误判断状态

#### 第 7 节：知识沉淀强制要求（TASK-095）
- 复盘内容具有**通用价值**时**必须**写入 `confluence/memory/`
- 写入位置：
  - `confluence/memory/patterns/` — 可复用架构/解法模式
  - `confluence/memory/pitfalls/` — 踩坑记录与解法
  - `confluence/memory/glossary/terms.md` — 新术语
  - `confluence/memory/BORROWED-WISDOM.md` — 外部借鉴

#### 第 12 节：知识沉淀红线 - Execution Proof 强制要求
- **禁止**在无 proof 情况下向 `confluence/memory/` 写入新文件
- **Proof 元数据必须包含**：
  ```yaml
  proof:
    task_id: TASK-XXX          # 来源 ticket（必填）
    exit_code: 0               # 只允许 0（必填）
    timestamp: 2026-04-26T...  # ISO 8601（必填）
    tool_name: npm test        # 工具/命令（可选）
    ci_url: https://...        # CI 链接（可选）
  ```
- **验证流程**：运行 `knowledge:index` 自动校验 proof 完整性

### 没有明确的 "skill" 命令定义
- SLAVER-RULES.md 主要关注**行为规范**，而非具体命令
- Skills 在此文档中是**知识沉淀机制**的一部分，而非独立的任务执行单元

---

## 5. ACTIVE_CONTEXT.md 模板格式

### 自动生成位置
`.eket/ACTIVE_CONTEXT.md`

### 模板结构（来自 `claim.ts` 的 `buildActiveContextMd()` 函数）
```markdown
# EKET Active Context

> 此文件由 task:claim 自动生成，ticket 完成后删除。请勿手动编辑。
> 生成时间: {ISO8601}

## Active Ticket

- **ID**: {ticket.id}
- **Title**: {ticket.title}

## Identity

- **Slaver ID**: {slaverId}
- **Role**: {role}
- **Started At**: {ISO8601}

## Available Commands

- `task:claim` — 领取下一个任务
- `task:resume` — 断点恢复
- `system:doctor` — 系统诊断

## Available Skills

{skillList}
  （示例）
  - skill:extract
  - knowledge:search
  - (none)
```

### 关键字段解析
| 字段 | 来源 | 用途 |
|------|------|------|
| **Ticket.ID** | 从 Jira ticket 读取 | 标识当前任务 |
| **Ticket.Title** | 从 Jira ticket 读取 | 任务描述 |
| **Slaver ID** | claim 时注入 | 标识执行者 |
| **Role** | 从 ticket `assigned_experts` 推断 | 标识角色和加载专家 |
| **Started At** | 生成时记录 | 任务启动时间戳 |
| **Available Skills** | 从 `node/src/skills/{domain}.json` 加载 | 当前可用的 Skill 列表 |

### 生命周期
1. **创建时机**：`task:claim` 成功后调用 `injectActiveContext()`
2. **更新时机**：
   - 模型变更时调用 `injectModelToActiveContext()`
   - Skill 列表变更时自动刷新
3. **删除时机**：ticket 完成（状态变为 done）

---

## 6. 现有 Skills 系统实现情况

### Node.js Skills 架构（完整）

#### 核心特性
- **YAML 定义**：Skills 以 YAML 格式定义（支持 trigger、steps、metadata）
- **自动生成**：从 ticket 复盘自动生成可复用 Skill
- **触发机制**：基于关键词自动触发对应 Skill
- **堆栈管理**：支持 Skill 依赖、嵌套执行
- **FTS 搜索**：支持全文搜索查找 Skill

#### Skill 定义格式
```yaml
id: <skill_id>
name: <skill_name>
category: <category>
domain: <domain>
trigger:
  - <keyword1>
  - <keyword2>
steps:
  - <step1>
  - <step2>
metadata:
  created_at: <timestamp>
  source_ticket: <TASK-ID>
  proof:
    exit_code: 0
    timestamp: <ISO8601>
```

#### 加载机制
1. **Index Loader** (`index-loader.ts`)：预加载所有 Skill 索引
2. **Registry** (`registry.ts`)：维护 Skill 注册表
3. **Executor** (`skill-executor.ts`)：执行 Skill（支持变量替换、日志记录、超时控制）
4. **Auto Registry** (`auto-registry.ts`)：自动注册新生成的 Skill

#### CLI 命令集
```bash
# 生成 Skill
skill:extract --ticket TASK-001 --summary "解法描述"

# 列出已注册 Skill
skill:list

# 加载和执行
node dist/index.js <command>
```

### Rust 端 Skills（轻量级）
- `rust/crates/eket-cli/src/commands/skill_extract.rs` — 从 ACTIVE_CONTEXT 提取 Skills
- `rust/crates/eket-core/src/skill_index.rs` — Skill 索引存储

---

## 7. 专家组协作流程

### 阶段划分
- **Phase 1（先行）**：Architect 首先进行全局分析，产出系统地图供参考
- **Phase 2（深度）**：Backend, Frontend, Product, UX 等基于 Architect 的结论进行详细分析

### ACTIVE_CONTEXT 中的专家加载
从 ticket 的 `assigned_experts` 字段读取专家列表（逗号分隔），默认为：
```
architect, backend, frontend, fullstack, tester, ux, product
```

### 专家信息注入
通过 `expert-loader.ts` 将专家 profile 加载到 ACTIVE_CONTEXT，包括：
- 专家 ID、名字、MBTI 类型
- 通信风格、优势/劣势
- 思维框架、分析焦点
- 输出格式模板
- 执行阶段标记

---

## 总结表

| 项目 | 状态 | 位置 | 说明 |
|------|------|------|------|
| **专家 Persona** | ✅ 有 7+53 位专家 | `~/.claude/skills/eket/experts/` | YAML 格式，包含 personality/thinking_framework/analysis_focus 等字段 |
| **Skills 系统** | ✅ 完整实现 | `node/src/skills/` + `node/src/core/skill-*.ts` | 支持 YAML 定义、自动生成、FTS 搜索、执行引擎 |
| **skill:extract** | ✅ 已实现 | `rust/crates/eket-cli/src/commands/skill_extract.rs` | 从 ACTIVE_CONTEXT 读取 domain，加载对应 Skills 列表 |
| **SLAVER-RULES** | ✅ 完整 | `template/docs/SLAVER-RULES.md` | 12 个主要章节，重点是分析瘫痪检测、偏差处理、知识沉淀、Execution Proof |
| **ACTIVE_CONTEXT** | ✅ 自动生成 | `.eket/ACTIVE_CONTEXT.md` | 包含 Ticket/Slaver/Role/Skills，由 task:claim 自动生成 |
| **expert-loader** | ✅ 完整 | `node/src/core/expert-loader.ts` | 60+ 专家映射表，支持批量加载和格式化输出 |

