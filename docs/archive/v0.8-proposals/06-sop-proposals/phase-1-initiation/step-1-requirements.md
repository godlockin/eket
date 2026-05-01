# Step 1: 需求分析 SOP

**版本**: 1.0.0
**最后更新**: 2026-03-23
**负责智能体**: 需求分析师

---

## 目标

将人类的模糊需求转化为结构化的需求文档，包含明确的用户故事和验收标准。

---

## 输入

| 输入项 | 位置 | 说明 |
|--------|------|------|
| 人类需求 | `inbox/human_input.md` | 项目愿景、目标用户、核心功能 |

---

## 输出

| 输出项 | 位置 | 说明 |
|--------|------|------|
| 需求文档 | `confluence/projects/{project}/requirements/requirements.md` | 完整需求规格说明 |
| 用户故事地图 | `confluence/projects/{project}/requirements/user-stories.md` | 用户故事和场景 |
| 验收标准 | `confluence/projects/{project}/requirements/acceptance-criteria.md` | 功能验收标准 |
| 术语表 | `confluence/projects/{project}/requirements/glossary.md` | 业务术语定义 |

---

## 使用 Skills

| Skill | 用途 | 调用顺序 |
|-------|------|---------|
| `user_interview` | 需求澄清和追问 | 1 |
| `requirement_decomposition` | 需求拆解为用户故事 | 2 |
| `acceptance_criteria_definition` | 定义验收标准 | 3 |

---

## 详细步骤

### 1.1 读取并分析人类输入

**目的**: 理解项目背景和核心需求

**步骤**:
1. 读取 `inbox/human_input.md`
2. 识别关键信息：
   - 项目愿景
   - 目标用户
   - 核心功能
   - 技术约束
   - 时间/预算限制

**检查清单**:
- [ ] 项目愿景清晰
- [ ] 目标用户定义明确
- [ ] 核心功能列表完整
- [ ] 技术约束识别
- [ ] 限制条件记录

**输出**: 需求分析笔记

---

### 1.2 需求澄清（如需要）

**触发条件**: 需求不明确、存在矛盾、缺少关键信息

**步骤**:
1. 列出需要澄清的问题
2. 创建 `inbox/human_feedback/clarification-request-{timestamp}.md`
3. 等待人类回复

**问题模板**:
```markdown
# 需求澄清请求

**项目**: {project_name}
**时间**: {timestamp}

## 需要澄清的问题

1. **问题描述**
   - 背景：为什么需要澄清
   - 选项 A: [描述]
   - 选项 B: [描述]
   - **推荐**: [选项 + 理由]

2. **问题描述**
   ...

---

**状态**: awaiting_human_response
```

**检查清单**:
- [ ] 问题描述清晰
- [ ] 提供选项和推荐
- [ ] 等待人类确认后继续

---

### 1.3 用户访谈和需求分解

**目的**: 深入理解用户需求，拆解为可执行的用户故事

**调用 Skill**: `requirement_decomposition`

**步骤**:
1. 识别目标用户群体
2. 为每个用户群体创建用户画像
3. 定义用户场景和痛点
4. 将需求拆解为用户故事

**用户画像模板**:
```markdown
## 用户画像：{user_persona_name}

- **角色**: {角色描述}
- **目标**: {用户想要达成什么}
- **痛点**: {当前遇到的问题}
- **场景**: {典型使用场景}
```

**用户故事格式**:
```
作为 {角色}，
我想要 {功能}，
以便于 {价值}

验收标准:
- Given {前置条件}
- When {操作}
- Then {结果}
```

**检查清单**:
- [ ] 每个用户群体有画像
- [ ] 每个需求有对应用户故事
- [ ] 用户故事符合 INVEST 原则
- [ ] 验收标准符合 SMART 原则

---

### 1.4 定义验收标准

**目的**: 为每个功能定义明确的可测试的验收标准

**调用 Skill**: `acceptance_criteria_definition`

**步骤**:
1. 为每个用户故事定义验收标准
2. 使用 Given-When-Then 格式
3. 确保标准可测试

**示例**:
```markdown
### 功能：用户登录

**验收标准**:

1. **成功登录**
   - Given 用户已注册
   - When 输入正确的用户名和密码
   - Then 登录成功并跳转到首页

2. **密码错误**
   - Given 用户已注册
   - When 输入错误的密码
   - Then 显示错误提示"用户名或密码错误"

3. **账号锁定**
   - Given 用户连续输错 5 次密码
   - When 尝试第 6 次登录
   - Then 账号被锁定 15 分钟
```

**检查清单**:
- [ ] 每个功能有验收标准
- [ ] 验收标准可测试
- [ ] 覆盖正常流程和异常流程
- [ ] 无歧义

---

### 1.5 创建需求文档

**目的**: 将所有分析结果整合为正式的需求文档

**文档结构**:
```markdown
# {项目名} - 需求规格说明书

## 1. 概述

### 1.1 项目愿景
### 1.2 目标用户
### 1.3 核心功能

## 2. 功能需求

### 2.1 {功能 1}
- 用户故事
- 验收标准
- 优先级

### 2.2 {功能 2}
...

## 3. 非功能性需求

### 3.1 性能需求
### 3.2 安全需求
### 3.3 可用性需求

## 4. 约束和假设

### 4.1 技术约束
### 4.2 业务约束
### 4.3 假设条件

## 5. 术语表

## 6. 变更历史
```

**输出位置**: `confluence/projects/{project}/requirements/requirements.md`

---

### 1.6 创建 Checkpoint

**Checkpoint 名称**: `phase1_requirements_complete`

**Checkpoint 文件**: `.eket/state/checkpoints/{project}-requirements-complete.md`

**内容**:
```markdown
# Checkpoint: Phase1 Requirements Complete

**项目**: {project}
**时间**: {timestamp}
**负责人**: 需求分析师

---

## 检查项

- [ ] 需求文档已创建
- [ ] 用户故事地图完整
- [ ] 验收标准定义清晰
- [ ] 文档审查通过

## 交付物

- [ ] requirements.md
- [ ] user-stories.md
- [ ] acceptance-criteria.md

---

**状态**: checkpoint_recorded
```

---

## 质量检查

### 完整性检查

- [ ] 所有核心功能有需求描述
- [ ] 每个需求有用户故事
- [ ] 每个用户故事有验收标准
- [ ] 非功能性需求已定义

### 一致性检查

- [ ] 需求与项目愿景一致
- [ ] 用户故事与需求一致
- [ ] 验收标准与用户故事一致

### 可测试性检查

- [ ] 验收标准可测试
- [ ] 有明确的通过/失败标准
- [ ] 测试场景覆盖完整

---

## 常见问题处理

### 问题 1: 人类需求过于模糊

**处理流程**:
1. 记录模糊点
2. 创建澄清请求
3. 等待人类回复
4. 基于回复重新分析

### 问题 2: 需求之间存在矛盾

**处理流程**:
1. 识别矛盾点
2. 分析矛盾原因
3. 创建澄清请求，说明矛盾
4. 请求人类决策

### 问题 3: 需求超出范围

**处理流程**:
1. 记录超出范围的需求
2. 创建后续任务（backlog）
3. 与人类确认优先级
4. 调整当前范围

---

## 相关文件

- [Phase 1 SOP](../phase-1-initiation/README.md)
- [Requirement Decomposition Skill](../../../template/skills/requirements/requirement_decomposition.yml)
- [Acceptance Criteria Skill](../../../template/skills/requirements/acceptance_criteria_definition.yml)

---

**SOP 版本**: 1.0.0
**创建日期**: 2026-03-23
**维护者**: EKET Framework Team
