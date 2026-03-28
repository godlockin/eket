# UI/UX Design Ticket: U-DESIGN-${SEQUENCE_NUMBER} - ${DESIGN_TITLE}

**创建时间**: ${CREATE_DATE}
**创建者**: Master Agent
**优先级**: P0 | P1 | P2 | P3
**状态**: backlog
**标签**: `design`, `ui/ux`, `${DESIGN_AREA}`
**关联 Feature**: ${FEATURE_ID}
**关联 PRD**: PRD-${SEQUENCE_NUMBER}
**分配给**: null

---

## 0. 任务元数据

### 0.1 重要性说明
<!--
critical: 核心界面设计，影响整体用户体验
high: 重要功能界面，影响关键用户流程
medium: 一般界面优化
low: 细节美化
-->

### 0.2 优先级说明
<!--
P0: 紧急设计需求
P1: 高优先级设计
P2: 正常优先级
P3: 低优先级优化
-->

### 0.3 依赖关系
```yaml
blocks: []  # 本设计阻塞的开发任务
blocked_by: []  # 本设计依赖的 PRD 或调研
related: []  # 相关设计任务
external: []  # 外部依赖（如：品牌规范、设计系统）
```

### 0.4 背景信息
<!-- 填写设计任务的背景和目标 -->

### 0.5 技能要求
<!-- 如：figma, ui_design, ux_design, interaction_design, visual_design -->

### 0.6 预估工时
<!-- 如：4h, 8h, 2d, 1w -->

---

## 1. 状态流转记录（必须更新）

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| ${CREATE_DATE} | backlog → analysis | Master | 初始创建 |
| ${RESEARCH_DATE} | analysis → concept | Master | 设计调研完成 |
| ${CONCEPT_DATE} | concept → draft | Master | 概念设计完成 |
| ${DRAFT_DATE} | draft → review | Master | 设计初稿完成 |
| ${APPROVE_DATE} | review → approved | Design Lead | 设计批准 |
| ${HANDOFF_DATE} | approved → done | Master | 已移交开发团队 |

> **重要**: 设计稿需要批准后才能移交开发！

---

## 2. 设计需求概述

### 2.1 设计类型
- [ ] 界面设计 (UI Design)
- [ ] 用户体验设计 (UX Design)
- [ ] 交互设计 (Interaction Design)
- [ ] 视觉设计 (Visual Design)
- [ ] 响应式设计 (Responsive Design)
- [ ] 图标设计 (Icon Design)
- [ ] 动效设计 (Motion Design)
- [ ] 其他：${类型}

### 2.2 设计目标
${清晰描述设计要达成的目标和预期效果}

### 2.3 设计范围
- **涉及页面**: `${PAGE_LIST}`
- **涉及组件**: `${COMPONENT_LIST}`
- **设计平台**: `${PLATFORMS}` (Web/iOS/Android/其他)
- **不包括**: `${OUT_OF_SCOPE}`

### 2.4 目标用户
| 用户画像 | 使用场景 | 核心需求 | 设计重点 |
|----------|----------|----------|----------|
| ${Persona 1} | ${场景 1} | ${需求 1} | ${重点 1} |
| ${Persona 2} | ${场景 2} | ${需求 2} | ${重点 2} |

---

## 3. 设计调研（Master 填写）

### 3.1 竞品设计分析
| 竞品 | 设计特点 | 优点 | 缺点 | 借鉴点 |
|------|----------|------|------|--------|
| ${竞品 1} | ${特点} | ${优点} | ${缺点} | ${借鉴} |

### 3.2 设计趋势分析
- **当前趋势**: ${设计趋势}
- **行业规范**: ${行业设计标准}
- **创新点**: ${可尝试的创新}

### 3.3 品牌规范要求
- **主色调**: `${PRIMARY_COLOR}`
- **辅助色**: `${SECONDARY_COLOR}`
- **字体**: `${FONT_FAMILY}`
- **圆角**: `${BORDER_RADIUS}`
- **间距**: `${SPACING_SCALE}`

---

## 4. 设计方案（Master/Designer 填写）

### 4.1 信息架构
```
${信息结构图/站点地图}
```

### 4.2 用户流程图
```
${用户操作流程图}
```

### 4.3 线框图 (Wireframe)
![Wireframe](${WIREFRAME_LINK})

#### 页面布局
| 区域 | 内容 | 优先级 |
|------|------|--------|
| Header | ${内容} | P0 |
| Main | ${内容} | P0 |
| Sidebar | ${内容} | P1 |
| Footer | ${内容} | P2 |

### 4.4 视觉设计稿
![Design Mockup](${MOCKUP_LINK})

#### 设计规范
| 元素 | 规范 | 示例 |
|------|------|------|
| 主按钮 | `${BUTTON_STYLE}` | ![Button](${EXAMPLE_LINK}) |
| 输入框 | `${INPUT_STYLE}` | ![Input](${EXAMPLE_LINK}) |
| 卡片 | `${CARD_STYLE}` | ![Card](${EXAMPLE_LINK}) |

### 4.5 交互设计
| 交互 | 触发条件 | 动画效果 | 时长 |
|------|----------|----------|------|
| ${交互 1} | ${触发} | ${动画} | ${时长} |
| ${交互 2} | ${触发} | ${动画} | ${时长} |

### 4.6 响应式设计（如适用）
| 断点 | 布局变化 | 注意事项 |
|------|----------|----------|
| Mobile (<768px) | ${布局} | ${注意} |
| Tablet (768-1024px) | ${布局} | ${注意} |
| Desktop (>1024px) | ${布局} | ${注意} |

---

## 5. 设计交付物

### 5.1 交付清单
- [ ] 线框图 (Wireframe)
- [ ] 高保真设计稿 (Mockup)
- [ ] 交互原型 (Prototype)
- [ ] 设计规范 (Design System)
- [ ] 切图资源 (Assets)
- [ ] 动效说明 (Motion Spec)

### 5.2 交付物链接
| 交付物 | 链接 | 备注 |
|--------|------|------|
| Figma 文件 | ${FIGMA_LINK} | 主设计文件 |
| 原型 | ${PROTOTYPE_LINK} | 可交互原型 |
| 切图 | ${ASSETS_LINK} | 导出资源 |
| 设计规范 | ${SPEC_LINK} | 规范文档 |

### 5.3 设计标注
${详细的设计标注说明，包括尺寸、颜色、字体等}

---

## 6. 执行记录（Slaver 领取后填写）

### 6.1 领取信息
- **领取者**: ${Slaver_ID}
- **领取时间**: ${CLAIM_DATE}
- **预计工时**: ${ESTIMATED_HOURS}h
- **状态已更新**: [ ] 是

### 6.2 必需执行流程

#### 步骤 1: 设计调研
- [ ] 已完成竞品分析
- [ ] 已收集设计参考
- [ ] 已更新状态：`analysis` → `concept`

#### 步骤 2: 概念设计
- [ ] 已输出概念方案
- [ ] 概念方案数：${CONCEPT_COUNT} 个
- [ ] 已更新状态：`concept` → `draft`

#### 步骤 3: 详细设计
- [ ] 已完成高保真设计
- [ ] 设计稿数：${MOCKUP_COUNT} 个
- [ ] 已输出设计规范
- [ ] 已更新状态：`draft` → `review`

#### 步骤 4: 设计 Review
- [ ] 已组织内部 Review
- [ ] 已收集反馈意见
- [ ] 已修改完善

#### 步骤 5: 人类批准
- [ ] Design Lead 已批准
- [ ] 批准时间：${APPROVE_DATE}
- [ ] 已更新状态：`review` → `approved`

#### 步骤 6: 开发交接
- [ ] 已召开设计交底会
- [ ] 已提供设计资源
- [ ] 已回答开发问题
- [ ] 已更新状态：`approved` → `done`

### 6.3 执行状态
| 阶段 | 状态 | 完成时间 | 备注 |
|------|------|----------|------|
| 设计调研 | ✓/✗ | ${RESEARCH_DATE} | - |
| 概念设计 | ✓/✗ | ${CONCEPT_DATE} | ${CONCEPT_COUNT} 个方案 |
| 详细设计 | ✓/✗ | ${DRAFT_DATE} | ${MOCKUP_COUNT} 个稿 |
| Review | ✓/✗ | ${REVIEW_DATE} | - |
| 人类批准 | ✓/✗ | ${APPROVE_DATE} | DL: ${DL_NAME} |
| 开发交接 | ✓/✗ | ${HANDOFF_DATE} | - |

---

## 7. 批准记录（Design Lead 填写）

### 7.1 批准意见
${设计批准意见和注意事项}

### 7.2 批准结果
- [ ] **批准** - 设计符合要求，可以移交开发
- [ ] **需要修改** - 见修改意见
- [ ] **暂缓** - ${原因}
- [ ] **拒绝** - ${原因}

**批准者**: ${DESIGN_LEAD}
**批准时间**: ${APPROVE_DATE}

---

## 8. 知识沉淀

### 8.1 设计模式
${可复用的设计模式或组件}

### 8.2 设计经验
${设计过程中的经验和洞察}

---

**状态流转**: `backlog` → `analysis` → `concept` → `draft` → `review` → `approved` → `done`
