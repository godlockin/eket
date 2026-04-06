# Technical Design Ticket: T-DESIGN-{{SEQUENCE_NUMBER}} - {{DESIGN_TITLE}}

**创建时间**: {{CREATE_DATE}}
**创建者**: Master Agent
**优先级**: P0 | P1 | P2 | P3
**状态**: backlog
**标签**: `design`, `architecture`, `{{TECH_AREA}}`
**关联 Feature**: {{FEATURE_ID}}
**关联 PRD**: PRD-{{SEQUENCE_NUMBER}}
**分配给**: null

---

## 0. 任务元数据

### 0.1 重要性说明
<!--
critical: 核心架构设计，决定系统技术方向
high: 重要模块设计，影响关键技术实现
medium: 一般技术设计
low: 细节优化
-->

### 0.2 优先级说明
<!--
P0: 紧急技术设计
P1: 高优先级架构设计
P2: 正常优先级
P3: 低优先级优化
-->

### 0.3 依赖关系
```yaml
blocks: []  # 本设计阻塞的开发任务
blocked_by: []  # 本设计依赖的 PRD 或调研
related: []  # 相关设计任务
external: []  # 外部依赖（如：技术选型评估、PoC）
```

### 0.4 背景信息
<!-- 填写技术设计的背景和目标 -->

### 0.5 技能要求
<!-- 如：system_design, api_design, database_design, architecture_design -->

### 0.6 预估工时
<!-- 如：4h, 8h, 2d, 1w -->

---

## 1. 状态流转记录（必须更新）

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| {{CREATE_DATE}} | backlog → analysis | Master | 初始创建 |
| {{ANALYSIS_DATE}} | analysis → draft | Master | 技术调研完成 |
| {{DRAFT_DATE}} | draft → review | Master | 设计初稿完成 |
| {{REVIEW_DATE}} | review → approved | Tech Lead | 设计批准 |
| {{HANDOFF_DATE}} | approved → done | Master | 已移交开发团队 |

> **重要**: 技术设计需要 Tech Lead 批准后才能移交开发！

---

## 2. 技术设计概述

### 2.1 设计类型
- [ ] 系统架构设计 (System Architecture)
- [ ] 模块设计 (Module Design)
- [ ] API 设计 (API Design)
- [ ] 数据库设计 (Database Design)
- [ ] 接口设计 (Interface Design)
- [ ] 技术选型 (Tech Stack Selection)
- [ ] 性能设计 (Performance Design)
- [ ] 安全设计 (Security Design)
- [ ] 其他：${类型}

### 2.2 设计目标
${清晰描述技术设计要达成的目标和预期效果}

### 2.3 设计范围
- **涉及系统**: `{{SYSTEM_LIST}}`
- **涉及模块**: `{{MODULE_LIST}}`
- **技术栈**: `{{TECH_STACK}}`
- **不包括**: `{{OUT_OF_SCOPE}}`

### 2.4 设计约束
- **性能要求**: ${QPS, 延迟，吞吐量}
- **可用性要求**: ${SLA 目标}
- **安全要求**: ${安全等级}
- **兼容性要求**: ${ backward compatibility}

---

## 3. 技术调研（Master 填写）

### 3.1 技术方案对比
| 方案 | 优点 | 缺点 | 复杂度 | 推荐度 |
|------|------|------|--------|--------|
| ${方案 1} | ${优点} | ${缺点} | H/M/L | ⭐⭐⭐⭐⭐ |
| ${方案 2} | ${优点} | ${缺点} | H/M/L | ⭐⭐⭐⭐ |

### 3.2 技术选型理由
${选择推荐方案的理由和考量}

### 3.3 风险评估
| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| ${风险 1} | H/M/L | H/M/L | ${措施} |
| ${风险 2} | H/M/L | H/M/L | ${措施} |

---

## 4. 系统架构设计

### 4.1 架构概览
```
┌─────────────────────────────────────────────────────────────┐
│                     系统架构图                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐               │
│   │ Client  │───▶│  API GW │───▶│ Service │               │
│   └─────────┘    └─────────┘    └─────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 模块划分
| 模块 | 职责 | 接口 | 依赖 |
|------|------|------|------|
| ${模块 1} | ${职责} | ${接口} | ${依赖} |
| ${模块 2} | ${职责} | ${接口} | ${依赖} |

### 4.3 数据流设计
```
${数据流转流程图}
```

### 4.4 组件设计

#### Component: ${组件名}
**职责**: ${组件职责}

**接口定义**:
```typescript
interface ${ComponentName} {
  ${method1}(${params}): ${returnType};
  ${method2}(${params}): ${returnType};
}
```

**内部实现**:
```
${实现伪代码或流程图}
```

---

## 5. API 设计

### 5.1 API 列表
| API | 方法 | 路径 | 描述 | 认证 |
|-----|------|------|------|------|
| {{API1}} | GET/POST | {{PATH}} | ${描述} | Required |

### 5.2 API 详细设计

#### {{API_NAME}}
```yaml
Method: ${GET/POST/PUT/DELETE}
Path: {{API_PATH}}
Auth: ${Required/Optional}
Rate Limit: ${Limit}
```

**Request**:
```typescript
interface ${RequestName} {
  ${field1}: ${type};  // 描述
  ${field2}: ${type};  // 描述
}
```

**Response**:
```typescript
interface ${ResponseName} {
  code: number;  // 状态码
  data: {
    ${field1}: ${type};
  };
  message: string;  // 错误信息
}
```

**Error Codes**:
| Code | Message | 处理建议 |
|------|---------|----------|
| 400 | Bad Request | 检查请求参数 |
| 401 | Unauthorized | 检查认证信息 |
| 500 | Internal Error | 联系技术支持 |

---

## 6. 数据库设计

### 6.1 ER 图
```
${ER  Diagram}
```

### 6.2 表结构设计

#### Table: ${table_name}
| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | BIGINT | PRIMARY KEY | 主键 |
| ${field1} | {{TYPE}} | {{CONSTRAINT}} | ${描述} |
| ${field2} | {{TYPE}} | {{CONSTRAINT}} | ${描述} |

**索引设计**:
```sql
CREATE INDEX idx_${name} ON ${table} (${columns});
```

---

## 7. 安全设计

### 7.1 认证授权
- **认证方式**: ${JWT/OAuth2/Session}
- **授权模型**: ${RBAC/ABAC}
- **权限粒度**: ${API/资源/操作}

### 7.2 数据安全
- **加密方式**: ${AES/RSA}
- **传输安全**: ${HTTPS/TLS}
- **敏感数据**: ${脱敏/加密存储}

### 7.3 安全防护
- **输入验证**: ${XSS/SQL 注入防护}
- **速率限制**: ${Rate Limiting}
- **审计日志**: ${Audit Logging}

---

## 8. 执行记录（Slaver 领取后填写）

### 8.1 领取信息
- **领取者**: ${Slaver_ID}
- **领取时间**: {{CLAIM_DATE}}
- **预计工时**: {{ESTIMATED_HOURS}}h
- **状态已更新**: [ ] 是

### 8.2 必需执行流程

#### 步骤 1: 技术调研
- [ ] 已完成技术调研
- [ ] 已输出方案对比
- [ ] 已更新状态：`analysis` → `draft`

#### 步骤 2: 设计文档撰写
- [ ] 已完成架构设计
- [ ] 已完成 API 设计
- [ ] 已完成数据库设计
- [ ] 已更新状态：`draft` → `review`

#### 步骤 3: 技术 Review
- [ ] 已组织内部 Review
- [ ] 已收集反馈意见
- [ ] 已修改完善

#### 步骤 4: 人类批准
- [ ] Tech Lead 已批准
- [ ] 批准时间：{{APPROVE_DATE}}
- [ ] 已更新状态：`review` → `approved`

#### 步骤 5: 开发交接
- [ ] 已召开技术交底会
- [ ] 已回答开发问题
- [ ] 已更新状态：`approved` → `done`

### 8.3 执行状态
| 阶段 | 状态 | 完成时间 | 备注 |
|------|------|----------|------|
| 技术调研 | ✓/✗ | {{ANALYSIS_DATE}} | - |
| 设计撰写 | ✓/✗ | {{DRAFT_DATE}} | - |
| Review | ✓/✗ | {{REVIEW_DATE}} | - |
| 人类批准 | ✓/✗ | {{APPROVE_DATE}} | TL: {{TL_NAME}} |
| 开发交接 | ✓/✗ | {{HANDOFF_DATE}} | - |

---

## 9. 批准记录（Tech Lead 填写）

### 9.1 批准意见
${技术设计批准意见和注意事项}

### 9.2 批准结果
- [ ] **批准** - 设计合理，可以开始开发
- [ ] **需要修改** - 见修改意见
- [ ] **暂缓** - ${原因}
- [ ] **拒绝** - ${原因}

**批准者**: {{TECH_LEAD}}
**批准时间**: {{APPROVE_DATE}}

---

## 10. 知识沉淀

### 10.1 技术决策记录
${重要的技术决策和理由}

### 10.2 设计模式
${使用的设计模式和最佳实践}

---

**状态流转**: `backlog` → `analysis` → `draft` → `review` → `approved` → `done`
