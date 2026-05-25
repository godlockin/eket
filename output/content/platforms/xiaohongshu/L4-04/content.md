# Token烧了50刀

# 上下文爆炸：token预算管理实战

> 平台：微信公众号 / 知乎
> 定位：L4 经验教
[Context limit reached]
Unable to continue conversation.
Please start a new chat.

[代码略]

第 1 轮:  500 tokens
第 2 轮:  500 + 800 = 1,300 tokens
第 3 轮:  1,300 + 1,200 = 2,500 tokens
...
第 50 轮: 150,000 tokens → 💥 爆炸

[代码略]

普通文字: "实现用户登录功能" = 8 tokens
代码片段: function login() {...100行...} = 800 tokens

[代码略]

任务描述:     2K
代码文件:    45K
对话历史:    89K
系统提示:     5K
─────────────────
总计:       141K

Claude 上限: 150K
剩余空间:     9K  ← 危险！

[代码略]
typescript
// node/src/core/context-budget.ts

interface ContextBudget {
  total: 100_000,      // 总预算
  system: 5_000,       // 系统提示（固定）
  task: 10_000,        // 当前任务（固定）
  code: 30_000,        // 代码上下文（可变）
  history: 50_000,     // 对话历史（可压缩）
  reserve: 5_000,      // 预留空间
}

👆 完整版见公众号

---
#踩坑经验 #编程教训 #程序员必看 #避坑指南 #实战经验