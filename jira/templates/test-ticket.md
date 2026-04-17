# Test Ticket: TEST-${SEQUENCE_NUMBER} - ${TEST_TITLE}

**创建时间**: ${CREATE_DATE}
**创建者**: Master Agent
**优先级**: P0 | P1 | P2 | P3
**状态**: backlog
**标签**: `test`, `${MODULE_TAG}`, `${TEST_TYPE}`
**关联 Feature**: ${FEATURE_ID}
**分配给**: null

<!-- dispatched_by: Master 的 GitHub handle，pr-reviewer-check Action 用此判定自我闭环；不得与 PR 作者相同 -->
dispatched_by: null

---

## 0. 任务元数据

### 0.1 重要性说明
<!--
critical: 关键测试，阻塞发布
high: 重要测试，影响质量评估
medium: 一般测试，提升覆盖
low: 优化类测试
-->

### 0.2 优先级说明
<!--
P0: 紧急测试需求
P1: 高优先级测试
P2: 正常优先级
P3: 低优先级
-->

### 0.3 依赖关系
```yaml
blocks: []  # 本测试阻塞的任务
blocked_by: []  # 本测试依赖的任务
related: []  # 相关测试任务
external: []  # 外部依赖
```

### 0.4 背景信息
**业务背景**：<!-- 为什么要做这件事？用户/业务痛点是什么？ -->

**当前状态**：<!-- 目前是什么样的，有什么问题或缺失？ -->

**期望变化**：<!-- 做完后，什么改变了？ -->

**成功度量**：<!-- 怎么知道做好了？最好是可量化的指标 -->

### 0.5 技能要求
<!-- 如：jest, pytest, selenium, cypress, playwright -->

### 0.6 预估工时
<!-- 如：2h, 4h, 8h, 1d -->

---

## 1. 状态流转记录（必须更新）

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| ${CREATE_DATE} | backlog → ready | Master | 初始创建 |
| ${CLAIM_DATE} | ready → in_progress | ${Slaver_ID} | **已领取** |
| ${IMPLEMENT_DATE} | in_progress → testing | ${Slaver_ID} | 测试实现完成 |
| ${VERIFY_DATE} | testing → review | ${Slaver_ID} | 自测通过，PR 提交 |
| ${APPROVE_DATE} | review → done | Master | Review 通过 |

> **重要**: Slaver 领取任务后必须按顺序更新状态，不可跳过任何阶段！

---

## 2. 测试任务描述

### 2.1 测试类型
- [ ] 单元测试 (Unit Test)
- [ ] 集成测试 (Integration Test)
- [ ] 端到端测试 (E2E Test)
- [ ] 性能测试 (Performance Test)
- [ ] 安全测试 (Security Test)
- [ ] 回归测试 (Regression Test)
- [ ] 验收测试 (Acceptance Test)
- [ ] 其他：${类型}

### 2.2 测试目标
${清晰描述测试要验证的功能或场景}

### 2.3 测试范围
- **被测模块**: `${module1}`, `${module2}`
- **被测接口**: `${API_ENDPOINTS}`
- **不包括**: `${OUT_OF_SCOPE}`

### 2.4 测试场景
| 场景 ID | 场景描述 | 输入 | 预期输出 | 优先级 |
|---------|----------|------|----------|--------|
| TC-001 | ${场景 1} | ${输入 1} | ${输出 1} | P0 |
| TC-002 | ${场景 2} | ${输入 2} | ${输出 2} | P1 |

---

## 3. 测试用例设计（Master 填写 / Slaver 可补充）

### 3.1 正常流程测试
```typescript
// 示例测试用例结构
describe('${feature}', () => {
  it('应该 ${预期行为}', async () => {
    // Given
    ${前置条件}

    // When
    ${执行操作}

    // Then
    ${断言}
  });
});
```

### 3.2 边界条件测试
- [ ] 空值/null 处理
- [ ] 最大值/最小值
- [ ] 边界值
- [ ] 特殊字符处理

### 3.3 异常流程测试
- [ ] 错误输入处理
- [ ] 超时处理
- [ ] 网络异常处理
- [ ] 资源不足处理

### 3.4 性能测试要求（如适用）
- **响应时间**: < ${X}ms
- **并发用户**: ${N} users
- **吞吐量**: ${X} req/s

---

## 4. 执行记录（Slaver 领取后填写）

### 4.1 领取信息
- **领取者**: ${Slaver_ID}
- **领取时间**: ${CLAIM_DATE}
- **预计工时**: ${ESTIMATED_HOURS}h
- **状态已更新**: [ ] 是（必须勾选）

### 4.2 必需执行流程（Slaver 职责）

> **注意**: 以下是 Slaver 领取任务后**必须**按顺序执行的步骤，不可跳过！

#### 步骤 1: 更新状态为 in_progress
- [ ] 已更新 ticket 状态：`ready` → `in_progress`
- [ ] 已在本文件中记录领取信息

#### 步骤 2: 编写测试代码
- [ ] 已编写测试用例
- [ ] 测试用例数：${TEST_COUNT} 个
- [ ] 已更新状态：`in_progress` → `testing`

#### 步骤 3: 运行测试验证
- [ ] 所有测试通过
- [ ] 测试覆盖率：${COVERAGE}%
- [ ] 已更新状态：`testing` → `review`

#### 步骤 4: 提交 PR
- [ ] 代码已提交到分支：`${BRANCH_NAME}`
- [ ] PR 已创建：`${PR_URL}`
- [ ] 已更新状态：`review` → `done`（测试任务通常直接合并）
- [ ] 已通知 Master Review

### 4.3 执行状态
| 阶段 | 状态 | 完成时间 | 备注 |
|------|------|----------|------|
| 领取 | ✓/✗ | ${CLAIM_DATE} | ${Slaver_ID} |
| 测试编写 | ✓/✗ | ${IMPLEMENT_DATE} | ${TEST_COUNT} 个用例 |
| 测试运行 | ✓/✗ | ${VERIFY_DATE} | 通过率 ${PASS_RATE}% |
| PR 提交 | ✓/✗ | ${SUBMIT_DATE} | ${PR_NUMBER} |

### 4.4 测试结果
```bash
# 测试运行结果
Tests:       ${PASS_COUNT} passed, ${FAIL_COUNT} failed
Coverage:    ${COVERAGE}%
Time:        ${DURATION}s
```

---

## 5. 验证标准（Master 填写）

### 5.1 测试质量检查
- [ ] 测试用例覆盖充分
- [ ] 测试代码符合规范
- [ ] 测试稳定可重复
- [ ] 测试命名清晰
- [ ] 有适当的断言

### 5.2 覆盖率检查
- [ ] 行覆盖率 >= ${X}%
- [ ] 分支覆盖率 >= ${Y}%
- [ ] 关键路径已覆盖

### 5.3 验证结果
- [ ] **批准合并** - 测试质量良好
- [ ] **需要补充** - 见验证意见
- [ ] **拒绝** - ${原因}

**验证者**: ${REVIEWER_ID}
**验证时间**: ${REVIEW_DATE}

---

## 6. 知识沉淀

### 6.1 测试模式
${可复用的测试模式或技巧}

### 6.2 测试工具
${使用的测试工具和技巧}

---

**状态流转**: `backlog` → `ready` → `in_progress` → `review` → `done`
