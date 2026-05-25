# 上下文爆炸：token预算管理实战

> 平台：微信公众号 / 知乎
> 定位：L4 经验教
[Context limit reached]
Unable to continue conversation.
Please start a new chat.
```

一下午的上下文，**全没了**。

---

## 🔍 为什么会爆炸？

### Token 的累积

每轮对话都在累积：

```
第 1 轮:  500 tokens
第 2 轮:  500 + 800 = 1,300 tokens
第 3 轮:  1,300 + 1,200 = 2,500 tokens
...
第 50 轮: 150,000 tokens → 💥 爆炸
```

### 代码特别吃 Token

```
普通文字: "实现用户登录功能" = 8 tokens
代码片段: function login() {...100行...} = 800 tokens
```

**代码的 token 密度是文字的 10 倍。**

### 模型上限

| 模型 | 上下文窗口 | 实际可用 |
|------|-----------|---------|
| GPT-4 | 128K | ~100K |
| Claude | 200K | ~150K |

看起来很多，但：
- 复杂项目有几十个文件
- 每个文件几百行
- 来回讨论几十轮

轻松爆表。

---

## 📊 EKET 的血泪数据

EPIC-006 执行中的 token 消耗：

```
任务描述:     2K
代码文件:    45K
对话历史:    89K
系统提示:     5K
─────────────────
总计:       141K

Claude 上限: 150K
剩余空间:     9K  ← 危险！
```

一轮稍大的对话就崩了。

---

## 🛡️ 防御策略

### 策略 1：Token 预算

**提前分配，严格控制。**

```typescript
// node/src/core/context-budget.ts

interface ContextBudget {
  total: 100_000,      // 总预算
  system: 5_000,       // 系统提示（固定）
  task: 10_000,        // 当前任务（固定）
  code: 30_000,        // 代码上下文（可变）
  history: 50_000,     // 对话历史（可压缩）
  reserve: 5_000,      // 预留空间
}
```

每次对话前检查：

```typescript
function checkBudget(newMessage: string): boolean {
  const newTokens = countTokens(newMessage);
  const currentUsage = getCurrentUsage();
  
  if (currentUsage + newTokens > budget.total - budget.reserve) {
    // 触发压缩
    compressHistory();
    return checkBudget(newMessage); // 重新检查
  }
  
  return true;
}
```

### 策略 2：滑动窗口

**只保留最近的对话。**

```typescript
// node/src/core/sliding-window.ts

class SlidingWindow {
  private maxTurns = 20;
  private history: Turn[] = [];
  
  add(turn: Turn): void {
    this.history.push(turn);
    
    // 超出限制，移除最早的
    while (this.history.length > this.maxTurns) {
      const removed = this.history.shift();
      // 保存到文件（可恢复）
      this.archive(removed);
    }
  }
}
```

### 策略 3：摘要压缩

**用摘要替代完整历史。**

```typescript
// node/src/core/compressor.ts

async function compressHistory(history: Turn[]): Promise<string> {
  // 让 AI 总结之前的对话
  const summary = await llm.complete(`
    请用 200 字总结以下对话的关键信息：
    
    ${history.map(t => t.content).join('\n\n')}
    
    保留：关键决策、代码位置、待办事项
    删除：寒暄、重复讨论、已解决的问题
  `);
  
  return summary;
}
```

压缩效果：

```
原始历史: 50,000 tokens
压缩后:    2,000 tokens
压缩比:   25x
```

### 策略 4：按需加载代码

**不要一次性加载所有文件。**

```typescript
// ❌ 错误：加载整个项目
const allFiles = await loadAllSourceFiles();  // 100K tokens

// ✅ 正确：按需加载
const relevantFiles = await findRelevantFiles(taskDescription);
const code = await loadFiles(relevantFiles);  // 10K tokens
```

智能判断相关文件：

```typescript
function findRelevantFiles(task: string): string[] {
  // 根据任务关键词匹配
  const keywords = extractKeywords(task);
  
  return allFiles.filter(file => {
    const content = readFile(file);
    return keywords.some(kw => content.includes(kw));
  });
}
```

---

## 🏗️ EKET 的实现

### Checkpoint 持久化

关键信息不放上下文，放文件：

```markdown
# TASK-042 Checkpoint

## 进度
- [x] 设计 API
- [ ] 实现逻辑

## 关键决策
- 选择 JWT（原因：无状态）
- 密码用 bcrypt

## 相关文件
- node/src/core/auth.ts
- node/src/utils/jwt.ts
```

新会话只需读 checkpoint，不需要完整历史。

### 知识库外置

经验不存上下文，存知识库：

```bash
# 搜索相关经验
eket knowledge:search "JWT 认证"

# 返回摘要，不是全文
# 节省 token
```

### 任务隔离

每个任务独立上下文：

```
TASK-042 上下文: 30K tokens
TASK-043 上下文: 25K tokens
TASK-044 上下文: 28K tokens
```

互不干扰，不会累积爆炸。

---

## 📊 效果对比

### 无管理 vs 有管理

| 指标 | 无管理 | Token 预算 |
|------|--------|-----------|
| 平均会话长度 | 50 轮崩溃 | 200+ 轮 |
| 上下文丢失 | 频繁 | 极少 |
| 任务完成率 | 60% | 95% |

### Token 使用效率

```
无管理:
  有效信息: 30%
  冗余历史: 50%
  重复内容: 20%

有管理:
  有效信息: 70%
  压缩摘要: 20%
  预留空间: 10%
```

---

## 💡 实用技巧

### 1. 定期总结

每 10 轮让 AI 总结一次：

```
"请总结我们目前的进展和待办事项，用 bullet points"
```

### 2. 主动清理

```
"之前关于 X 的讨论可以忘掉了，我们已经决定用 Y"
```

### 3. 分段对话

大任务拆成多次对话：

```
对话 1: 需求分析 → 输出文档
对话 2: 读文档 → 设计 → 输出设计文档
对话 3: 读设计 → 实现
```

每次对话轻装上阵。

### 4. 文件代替对话

```
❌ 在对话中粘贴 500 行代码
✅ "请读取 src/auth.ts 文件"
```

让 AI 自己读文件，不污染对话历史。

---

## 📋 Token 预算检查清单

- [ ] 设置总预算上限
- [ ] 定期检查使用量
- [ ] 超限触发压缩
- [ ] Checkpoint 持久化关键信息
- [ ] 知识库外置经验
- [ ] 任务隔离上下文

---

## 🚀 系列总结

恭喜你看完了 EKET 系列全部文章！

**L1 入门**：框架思路、Master-Slaver、上下文问题
**L2 模块**：降级架构、双轨路由、知识飞轮、断路器
**L3 决策**：三仓分离、Rust vs Node、文件 vs 数据库
**L4 教训**：覆盖率陷阱、Agent 幻觉、Git 死锁、上下文爆炸

希望这些经验对你有帮助！

---

#AI开发 #Token管理 #上下文 #经验教训 #工程实践
