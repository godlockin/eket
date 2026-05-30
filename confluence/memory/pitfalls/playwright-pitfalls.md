---
name: playwright-pitfalls
type: pitfall
tags: [e2e, playwright, testing, flaky, debugging]
confidence: high
source: ultraskills/external/fullstack-dev-skills/playwright-expert
references: [async-test-leak, coverage-driven-development]
---

# Playwright常见陷阱与调试

> E2E测试反模式与修复策略

---

## 常见Flaky Test原因

### 1. Race Conditions - 竞态条件

#### ❌ 错误: 元素可能尚不存在

```typescript
await page.click('.submit-btn');
```

#### ✅ 正确: 内置auto-waiting

```typescript
await page.getByRole('button', { name: 'Submit' }).click();
```

**Why:** Playwright的locator自动等待元素可操作(visible + stable + enabled)。

---

### 2. Animation/Transitions - 动画/过渡

#### ❌ 错误: 动画期间点击

```typescript
await page.click('.menu-item');
```

#### ✅ 正确: 等待稳定状态

```typescript
await page.getByRole('menuitem').click();
await expect(page.getByRole('menu')).toBeVisible();
```

**Why:** 动画期间元素可能移动或部分遮挡,导致点击失败。

---

### 3. Network Timing - 网络时序

#### ❌ 错误: 假设数据已加载

```typescript
await page.goto('/dashboard');
expect(await page.textContent('.user-name')).toBe('John');
```

#### ✅ 正确: 等待网络响应

```typescript
await page.goto('/dashboard');
await page.waitForResponse('**/api/user');
await expect(page.getByTestId('user-name')).toHaveText('John');
```

**Why:** `goto`完成≠API请求完成。需显式等待关键请求。

---

### 4. Test Isolation - 测试隔离

#### ❌ 错误: 测试共享状态

```typescript
test('test 1', async () => { /* creates user */ });
test('test 2', async () => { /* assumes user exists */ });
```

#### ✅ 正确: 每个测试独立

```typescript
test.beforeEach(async ({ page }) => {
  await page.request.post('/api/test/reset');
});
```

**Why:** 测试顺序可能改变,依赖共享状态导致不稳定。

**与eket关联:** 类似 [[async-test-leak]] 中的Redis共享状态问题。

---

## 正确的等待策略

### 推荐做法

```typescript
// 等待元素状态
await expect(page.getByText('Success')).toBeVisible();
await expect(page.getByRole('button')).toBeEnabled();
await expect(page.getByRole('dialog')).toBeHidden();

// 等待导航
await page.waitForURL(/dashboard/);

// 等待响应
await page.waitForResponse(r => r.url().includes('/api/data'));

// 等待加载状态
await page.waitForLoadState('networkidle');
```

### ❌ 避免任意等待

```typescript
await page.waitForTimeout(3000); // BAD
```

**Why:** 
- CI环境可能比本地慢(3s不够)
- 本地可能比需要快(浪费1.5s)
- 隐藏真正的timing问题

---

## 调试工具

### 1. Inspector - 交互式调试

```typescript
// 暂停执行并打开inspector
await page.pause();
```

### 2. Debug模式

```bash
# Step-by-step模式
PWDEBUG=1 npx playwright test

# 慢动作
test.use({ launchOptions: { slowMo: 500 } });

# Headed模式(显示浏览器)
npx playwright test --headed
```

### 3. Trace Viewer - 时光机

```bash
# 查看失败测试的trace
npx playwright show-trace trace.zip

# 始终生成trace
test.use({ trace: 'on' });

# UI模式
npx playwright test --ui
```

**eket经验:** Trace Viewer类似 [[epic-004-worktree-cwd]] 中的debug策略 - 记录完整执行路径。

---

## Retry策略

### 配置

```typescript
// playwright.config.ts
export default defineConfig({
  retries: process.env.CI ? 2 : 0,

  expect: {
    timeout: 10000, // 增加断言超时
  },
});
```

### 单个测试Retry

```typescript
test('flaky test', async ({ page }) => {
  test.info().annotations.push({ 
    type: 'issue', 
    description: 'Known flaky' 
  });
  // ...
});
```

**注意:** Retry是缓解措施,不是解决方案。根因还是要修。

---

## 调试输出

```typescript
test('debug test', async ({ page }) => {
  // Console输出
  page.on('console', msg => console.log(msg.text()));
  
  // 页面错误
  page.on('pageerror', err => console.log(err.message));
  
  // 截图
  await page.screenshot({ path: 'debug.png' });
});
```

---

## 快速参考

### 命令速查

| 命令 | 用途 |
|------|------|
| `PWDEBUG=1` | 启用inspector |
| `--headed` | 显示浏览器 |
| `--ui` | UI模式 |
| `page.pause()` | 暂停执行 |
| `show-trace` | 查看trace文件 |

### Flaky原因与修复

| 修复 | Flaky原因 |
|-----|-------------|
| Auto-wait locators | 竞态条件 |
| `waitForResponse` | 网络时序 |
| Test isolation | 共享状态 |
| Increase timeout | 慢操作 |

---

## 与eket测试经验对照

### 共性问题

| Playwright | eket经验 | 模式 |
|-----------|---------|------|
| Test isolation | [[async-test-leak]] | 共享资源需清理 |
| 避免arbitrary wait | [[epic-014-benchmark-lessons]] | 测试质量>数量 |
| Race conditions | [[epic-003-parallel-agents-deadlock]] | 并发需同步 |

### eket可借鉴

1. **Trace Viewer思维** → Agent执行也需可回放audit
2. **beforeEach隔离** → Slaver执行前重置共享状态
3. **waitForResponse明确等待** → 不依赖setTimeout猜时间

---

## Anti-Patterns总结

| ❌ 不要 | ✅ 要 |
|--------|------|
| `page.click('.class')` | `page.getByRole(...)` |
| `waitForTimeout(3000)` | `waitForResponse(...)` |
| 测试共享状态 | `beforeEach`重置 |
| 动画期间操作 | 等待稳定状态 |
| 假设数据已加载 | 等待网络请求 |
| 任意重试掩盖问题 | 修复根因 |

---

## 延伸阅读

- Playwright官方: https://playwright.dev/
- [[async-test-leak]] - 类似隔离问题
- [[coverage-driven-development]] - 避免为覆盖率写E2E
- [[test-quality-over-quantity]] - E2E测试也要质量优先
