# Design: init-existing — 已有项目接入 EKET Master

**日期**: 2026-04-09
**状态**: 已批准
**目标版本**: v2.7.0

---

## 背景

现有 `init-project.sh` 为全新空项目设计，对已开发一半的项目会破坏现有结构。需要一个专门针对**已有单项目**的初始化脚本，接入 EKET Master 框架，并可选触发多角色并行深度分析。

---

## 整体架构

```
init-existing.sh <project-path>
        │
        ├── Phase 1: 安全初始化
        │      检测现有文件，只补充缺失的目录和文件
        │      不覆盖任何已存在内容
        │
        ├── Phase 2: Master 身份写入
        │      .eket/state/instance_config.yml (role: master)
        │      .eket/IDENTITY.md (master 版本)
        │
        ├── Phase 3: 打印完成 + 下一步指引
        │      提示用户可运行深度分析命令
        │
        └── Phase 4: 可选 — 深度分析（用户确认后）
               ├── 自动探测项目 tech stack
               ├── 展示可用角色列表 + 推荐默认组合
               ├── 用户勾选角色
               └── Master 启动并行 subagent 团队
                      ├── 各 Slaver 全量扫描项目
                      ├── 各自输出报告到 confluence/analysis/YYYY-MM-DD/
                      └── Master 汇总 → alignment.md + jira tickets 草稿
```

---

## Phase 1：安全目录初始化

### 创建规则
- 目录：已存在则跳过，不存在则创建
- 文件：**已存在不覆盖**，不存在才写入

### 目录清单
```
.eket/
.eket/state/
.eket/memory/
.eket/logs/
confluence/
confluence/analysis/          ← 深度分析产物专用
confluence/requirements/
confluence/architecture/
jira/
jira/tickets/
jira/epics/
inbox/
inbox/human_feedback/
outbox/
outbox/review_requests/
```

### 文件处理策略

| 文件 | 已存在 | 不存在 |
|------|--------|--------|
| `CLAUDE.md` | 追加 `## EKET Framework` 段落 | 从 template 复制 |
| `.gitignore` | 追加缺失条目（`.eket/data/` 等） | 从 template 复制 |
| `.eket/IDENTITY.md` | 直接写入（master） | 直接写入 |
| `.eket/state/instance_config.yml` | 直接写入 | 直接写入 |
| `.eket/config.yml` | 跳过 | 从 template 复制 |

---

## Phase 2：Master 身份配置

`instance_config.yml` 写入内容：
```yaml
role: "master"
agent_type: null
auto_mode: false
storage_mode: "git_full"
status: "initialized"
initialized_from: "existing_project"
initialized_at: "<timestamp>"
```

---

## Phase 3：完成提示

初始化完成后打印：
```
✅ EKET Master 初始化完成

下一步选项：
  A) 启动深度分析（推荐首次接入）
     直接回答 'y' 继续，或稍后运行：
     ./scripts/analyze-existing.sh <project-path>

  B) 跳过分析，直接开始任务分配
     在 inbox/human_input.md 写入需求，启动 Claude Code 即可
```

---

## Phase 4：深度分析 — 角色体系

### 可用角色

| 角色 ID | 名称 | 分析维度 |
|---------|------|---------|
| `product` | 产品经理 | 用户价值、功能完整性、roadmap gap、竞品对比 |
| `dev` | 开发工程师 | 代码质量、技术债务、架构合理性、可维护性 |
| `security` | 安全工程师 | 漏洞面、敏感数据暴露、依赖风险、认证授权 |
| `blueteam` | 蓝队 | 运行时防护、监控盲区、日志完整性、应急响应 |
| `architect` | 架构师 | 扩展性、耦合度、性能瓶颈、技术选型合理性 |
| `tester` | 测试工程师 | 覆盖率、测试策略、漏测场景、测试基础设施 |
| `devops` | DevOps | CI/CD 完整性、部署风险、基础设施即代码 |
| `end_user` | 终端用户 | 使用体验、功能可发现性、痛点、期望 |

### 默认推荐组合
```
product + dev + security + blueteam + end_user（5个）
```

### end_user 角色的特殊处理
角色身份根据项目状态动态推断：
- 扫描 README、package.json description、docs/ 目录
- subagent 自行判断用户画像，并在报告开头声明：
  > "我扮演的用户画像是 [XXX]，理由是 [YYY]"

示例推断逻辑：
- 含 `CLI` / `developer tool` → end_user = 开发者
- 含 `B2B` / `enterprise` / `SaaS` → end_user = 企业运营/采购人员
- 含 `consumer` / `mobile` / `app` → end_user = 普通消费者
- 无明确信号 → end_user = 通用技术用户，列出多种可能画像

---

## Phase 4：深度分析 — Subagent Dispatch 机制

### 每个 Subagent 收到的 Prompt 结构

```
1. IDENTITY 块
   - 角色定位（如：你是一名资深安全工程师）
   - 职责范围
   - 禁止操作（不得修改任何代码文件）

2. 项目上下文块
   - project_path
   - 自动探测的 tech_stack（package.json / requirements.txt / go.mod 等）
   - git log --oneline -20（近期提交历史）
   - 目录结构（tree -L 3）

3. 分析任务块
   - 全量扫描指令
   - 各角色专属的分析维度和问题清单
   - 输出格式要求（见下）

4. 输出路径
   - confluence/analysis/YYYY-MM-DD/<role>-report.md
```

### 报告输出格式

```markdown
# [角色名] 分析报告
**项目**: <project-name>
**日期**: <date>
**扫描深度**: 全量

## 执行摘要
（3-5 句话的核心结论）

## 发现清单
### 🔴 高优先级
### 🟡 中优先级
### 🟢 低优先级 / 建议

## 详细分析
（各维度展开）

## 建议行动项
（可直接转化为 Jira ticket 的具体任务）
```

### Master 汇总流程

所有 subagent 完成后，Master：

1. 读取所有 `<role>-report.md`
2. 识别跨角色的**冲突点**（如安全要求 vs 开发便利性）
3. 识别跨角色的**共识**（多角色均提到的问题）
4. 输出 `alignment.md`：
   ```
   confluence/analysis/YYYY-MM-DD/alignment.md
   ```
5. 从"建议行动项"中提取，生成 Jira ticket 草稿：
   ```
   jira/tickets/analysis-<date>-<seq>.md
   ```

---

## 技术实现要点

- `init-existing.sh`：bash 脚本，Phase 1-3，末尾询问是否进入 Phase 4
- `analyze-existing.sh`：bash 脚本，生成角色选择菜单，输出分析目录，**打印供 Master Claude 实例执行的 subagent dispatch 指令**
- Subagent 通过 Claude Code Agent tool 并行启动，每个 agent 独立运行
- 探测 tech stack：优先读 `package.json` → `requirements.txt` → `go.mod` → `Cargo.toml` → `pom.xml`

---

## 文件产物

```
scripts/
  init-existing.sh              ← 新增
  analyze-existing.sh           ← 新增

template/.eket/
  analysis-roles/               ← 新增
    product.md                  ← 各角色 prompt 模板
    dev.md
    security.md
    blueteam.md
    architect.md
    tester.md
    devops.md
    end_user.md

confluence/analysis/
  YYYY-MM-DD/
    product-report.md
    dev-report.md
    security-report.md
    blueteam-report.md
    end_user-report.md
    alignment.md                ← Master 汇总

jira/tickets/
  analysis-YYYY-MM-DD-001.md   ← 自动生成草稿
  analysis-YYYY-MM-DD-002.md
  ...
```

---

## 验收标准

- [ ] `init-existing.sh` 在已有项目上运行不破坏任何现有文件
- [ ] CLAUDE.md 已存在时只追加段落，不覆盖
- [ ] .gitignore 追加不重复条目
- [ ] `instance_config.yml` 正确写入 `role: master`
- [ ] 角色选择菜单展示所有 8 个角色，默认勾选推荐 5 个
- [ ] `end_user` 报告开头包含用户画像声明
- [ ] 所有角色报告生成到正确路径
- [ ] `alignment.md` 包含冲突点和共识分析
- [ ] Jira ticket 草稿自动生成
- [ ] 现有测试套件 1079/1079 仍通过（无回归）
