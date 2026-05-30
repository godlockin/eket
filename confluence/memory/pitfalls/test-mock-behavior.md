---
name: test-mock-behavior
type: anti-pattern
tags: [testing, mock, tdd, jest]
confidence: high
source: ultraskills/community/test-driven-development
references: [coverage-driven-development, epic-014-benchmark-lessons]
---

# Testing Anti-Patterns - 测试Mock行为

> **Iron Laws**: (1) NEVER test mock behavior (2) NEVER add test-only methods to production (3) NEVER mock without understanding dependencies

## 核心原则

**Test what the code does, not what the mocks do.**

Mocks是隔离工具,不是被测对象。Following strict TDD prevents these anti-patterns.

---

## Anti-Pattern 1: 测试Mock的存在

### ❌ 错误示例

```typescript
// BAD: 测试mock是否存在,而非组件行为
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});
```

**问题:**
- 验证的是mock能否工作,不是组件能否工作
- Mock存在时通过,移除mock时失败
- 对真实行为无任何验证

### ✅ 正确做法

```typescript
// GOOD: 测试真实组件或不mock
test('renders sidebar', () => {
  render(<Page />);  // 不mock sidebar
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});

// OR 如果必须mock(隔离需求):
// 不对mock做断言 - 测试Page在sidebar存在时的行为
```

### 门控检查

```
BEFORE 对mock element断言:
  问: "我在测试真实组件行为还是mock存在?"
  
  IF 测试mock存在:
    STOP - 删除断言或取消mock
  
  测试真实行为
```

---

## Anti-Pattern 2: Production代码中的测试专用方法

### ❌ 错误示例

```typescript
// BAD: destroy()仅在测试中使用
class Session {
  async destroy() {  // 看起来像production API!
    await this._workspaceManager?.destroyWorkspace(this.id);
    // ... cleanup
  }
}

// 测试中
afterEach(() => session.destroy());
```

**问题:**
- Production类被测试代码污染
- 生产环境误调用的风险
- 违反YAGNI和关注点分离
- 混淆对象生命周期与实体生命周期

### ✅ 正确做法

```typescript
// GOOD: 测试工具处理测试清理
// Session无destroy() - 在生产环境是无状态的

// 在test-utils/
export async function cleanupSession(session: Session) {
  const workspace = session.getWorkspaceInfo();
  if (workspace) {
    await workspaceManager.destroyWorkspace(workspace.id);
  }
}

// 测试中
afterEach(() => cleanupSession(session));
```

### 门控检查

```
BEFORE 向production类添加方法:
  问: "这个方法仅被测试使用?"
  
  IF yes:
    STOP - 不添加
    放到test utilities
  
  问: "这个类拥有此资源的生命周期?"
  
  IF no:
    STOP - 方法放错类了
```

---

## Anti-Pattern 3: 不理解依赖就Mock

### ❌ 错误示例

```typescript
// BAD: Mock破坏了测试逻辑
test('detects duplicate server', () => {
  // Mock阻止了测试依赖的config写入!
  vi.mock('ToolCatalog', () => ({
    discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
  }));

  await addServer(config);
  await addServer(config);  // 应该抛错 - 但不会!
});
```

**问题:**
- Mock的方法有测试依赖的副作用(写config)
- 过度mock"求安全"破坏真实行为
- 测试通过的原因错误或神秘失败

### ✅ 正确做法

```typescript
// GOOD: 在正确层级Mock
test('detects duplicate server', () => {
  // Mock慢的部分,保留测试需要的行为
  vi.mock('MCPServerManager'); // 只mock慢的server启动

  await addServer(config);  // Config被写入
  await addServer(config);  // 重复检测成功 ✓
});
```

### 门控检查

```
BEFORE mock任何方法:
  STOP - 先别mock
  
  1. 问: "真实方法有什么副作用?"
  2. 问: "此测试依赖这些副作用吗?"
  3. 问: "我完全理解此测试需要什么吗?"
  
  IF 依赖副作用:
    Mock更低层级(真正慢/外部的操作)
    OR 使用保留必要行为的test double
    NOT 测试依赖的高层方法
  
  IF 不确定测试依赖什么:
    先用真实实现运行测试
    观察实际需要发生什么
    THEN 在正确层级添加最小mock

  红旗:
    - "我mock这个求安全"
    - "这可能慢,最好mock"
    - 不理解依赖链就mock
```

---

## Anti-Pattern 4: 不完整的Mock

### ❌ 错误示例

```typescript
// BAD: 部分mock - 只有你认为需要的字段
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' }
  // 缺失: 下游代码使用的metadata
};

// 后续: 代码访问response.metadata.requestId时崩溃
```

**问题:**
- **部分mock隐藏结构假设** - 只mock了你知道的字段
- **下游代码可能依赖你未包含的字段** - 静默失败
- **测试通过但集成失败** - Mock不完整,真实API完整
- **虚假信心** - 测试无法证明真实行为

**Iron Rule:** Mock **完整**数据结构(与真实相同),不只是你的直接测试用的字段。

### ✅ 正确做法

```typescript
// GOOD: 镜像真实API的完整性
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: 1234567890 }
  // 真实API返回的所有字段
};
```

### 门控检查

```
BEFORE 创建mock响应:
  检查: "真实API响应包含哪些字段?"
  
  Actions:
    1. 检查文档/示例的实际API响应
    2. 包含系统可能在下游消费的所有字段
    3. 验证mock完全匹配真实响应schema
  
  Critical:
    如果你创建mock,必须理解整个结构
    部分mock在代码依赖省略字段时静默失败
  
  如果不确定: 包含所有文档字段
```

---

## Anti-Pattern 5: 测试作为事后补充

### ❌ 错误

```
✅ 实现完成
❌ 未写测试
"Ready for testing"
```

**问题:**
- 测试是实现的一部分,不是可选的后续
- TDD会捕获这个
- 没有测试不能声称完成

### ✅ 正确做法

```
TDD循环:
1. 写失败测试
2. 实现使其通过
3. 重构
4. THEN 声称完成
```

---

## Mock过于复杂的警告信号

**Warning signs:**
- Mock设置长于测试逻辑
- Mock所有东西才能让测试通过
- Mock缺少真实组件拥有的方法
- Mock改变时测试崩溃

**人类伙伴的问题:** "我们需要在这里用mock吗?"

**考虑:** 真实组件的集成测试通常比复杂mock简单

---

## TDD如何防止这些反模式

**TDD的帮助:**
1. **先写测试** → 强迫你思考实际在测什么
2. **观察失败** → 确认测试测的是真实行为,不是mock
3. **最小实现** → 测试专用方法不会悄悄进入
4. **真实依赖** → 在mock前看到测试实际需要什么

**如果你在测试mock行为,你违反了TDD** - 你在看到测试对真实代码失败前添加了mock。

---

## 快速参考

| Anti-Pattern | 修复 |
|--------------|-----|
| 对mock元素断言 | 测试真实组件或取消mock |
| Production中的测试专用方法 | 移到test utilities |
| 不理解就Mock | 先理解依赖,最小mock |
| 不完整的Mock | 完全镜像真实API |
| 测试作为事后 | TDD - 测试优先 |
| 过度复杂的Mock | 考虑集成测试 |

---

## 红旗信号

- 断言检查`*-mock` test ID
- 方法只在测试文件调用
- Mock设置占测试>50%
- 移除mock时测试失败
- 无法解释为何需要mock
- Mock"求安全"

---

## 底线

**Mocks是隔离工具,不是被测对象。**

如果TDD揭示你在测试mock行为,你走错了。

修复: 测试真实行为或质疑为何要mock。

---

## 与eket其他经验的关联

- [[coverage-driven-development]] - 避免为覆盖率而测试
- [[epic-014-benchmark-lessons]] - 类型安全 > 测试数量
- [[test-quality-over-quantity]] - 质量优先方法论
