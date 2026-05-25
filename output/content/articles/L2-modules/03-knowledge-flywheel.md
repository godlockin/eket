# 知识飞轮：让AI越用越聪明

> 平台：微信公众号 / 知乎
> 定位：L2 模块拆解
> 阅读时间：5分钟

---

## 🤔 痛点

用 AI 开发，每次都从零开始：

> "这个问题上次怎么解决的来着？"
> 
> "算了，重新研究一遍吧..."

经验不断流失，**AI 永远是新手**。

---

## 💡 解决思路

**像人类团队一样沉淀知识。**

```
做任务 → 遇到问题 → 解决问题 → 记录经验 → 下次复用
   ↑                                          │
   └──────────────────────────────────────────┘
```

这就是**知识飞轮**。

---

## 🏗️ 知识分层

EKET 的知识库分 5 层：

```
L0: 索引层 (index)
    ↓ 快速定位
L1: 模式层 (patterns)
    ↓ 可复用方案
L2: 教训层 (lessons)
    ↓ 经验总结
L3: 陷阱层 (pitfalls)
    ↓ 避坑指南
L4: 决策层 (decisions)
    ↓ 架构选择
```

### 目录结构

```
confluence/memory/
├── memory-index.md      # L0: 总索引
├── patterns/            # L1: 设计模式
│   ├── dual-track-router.md
│   ├── four-level-degradation.md
│   └── ...
├── lessons/             # L2: 经验教训
│   ├── epic-014-benchmark-lessons.md
│   ├── multi-agent-collab-lessons.md
│   └── ...
├── pitfalls/            # L3: 已知坑
│   ├── async-test-leak.md
│   ├── coverage-driven-development.md
│   └── ...
└── decisions/           # L4: 决策记录
    ├── adr-001-rust-vs-node.md
    └── ...
```

---

## 🔄 飞轮机制

### 1. 任务触发

领取任务时，自动推送相关知识：

```bash
$ eket task:claim TASK-042

📚 相关知识推送：
- pitfalls/jwt-token-expire.md (相关度: 0.87)
- lessons/auth-api-design.md (相关度: 0.72)
- patterns/error-handling.md (相关度: 0.65)
```

### 2. 完成沉淀

任务完成时，触发知识沉淀：

```bash
$ eket task:complete TASK-042

✅ 任务完成
📝 检测到新经验，是否沉淀？

[1] 踩了 JWT 过期时间的坑 → pitfalls/
[2] 设计了新的认证流程 → patterns/
[3] 跳过
```

### 3. 搜索复用

随时搜索已有知识：

```bash
$ eket knowledge:search "JWT 认证"

Found 3 results:

1. pitfalls/jwt-token-expire.md
   "JWT 过期时间设置陷阱：默认 1h 不够用..."
   
2. patterns/auth-flow.md  
   "认证流程设计模式：登录→刷新→登出..."
   
3. lessons/epic-005-auth-lessons.md
   "EPIC-005 认证模块经验：选择 JWT 而非 Session..."
```

---

## 🔧 技术实现

### FTS 全文索引

```rust
// rust/crates/eket-engine/src/knowledge.rs

pub struct KnowledgeIndex {
    db: Connection,
}

impl KnowledgeIndex {
    pub fn index_file(&self, path: &Path) -> Result<()> {
        let content = fs::read_to_string(path)?;
        let metadata = extract_metadata(&content)?;
        
        self.db.execute(
            "INSERT INTO knowledge_fts (path, title, content, tags)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                path.to_string_lossy(),
                metadata.title,
                content,
                metadata.tags.join(","),
            ],
        )?;
        
        Ok(())
    }
    
    pub fn search(&self, query: &str) -> Result<Vec<SearchResult>> {
        let mut stmt = self.db.prepare(
            "SELECT path, title, snippet(knowledge_fts, 2, '→', '←', '...', 30)
             FROM knowledge_fts
             WHERE knowledge_fts MATCH ?1
             ORDER BY rank
             LIMIT 10"
        )?;
        
        // ...
    }
}
```

### TF-IDF 推荐

```rust
// rust/crates/eket-engine/src/recommender.rs

pub fn recommend_for_task(task: &Task) -> Vec<Recommendation> {
    let task_text = format!("{} {}", task.title, task.description);
    let task_terms = tokenize(&task_text);
    
    let mut scores: HashMap<String, f64> = HashMap::new();
    
    for doc in get_all_knowledge_docs() {
        let doc_terms = tokenize(&doc.content);
        let score = calculate_tfidf_similarity(&task_terms, &doc_terms);
        scores.insert(doc.path.clone(), score);
    }
    
    // 返回 top-k
    scores.into_iter()
        .sorted_by(|a, b| b.1.partial_cmp(&a.1).unwrap())
        .take(5)
        .map(|(path, score)| Recommendation { path, score })
        .collect()
}
```

---

## 📝 知识模板

### pitfalls 模板

```markdown
# [问题名称]

**严重度**: 高/中/低
**发现于**: EPIC-XXX / TASK-XXX
**日期**: YYYY-MM-DD

## 症状

[如何发现这个问题？]

## 根因

[为什么会出现？]

## 示例

```代码```

## 正确做法

```代码```

## 预防措施

1. ...
2. ...

## 索引标签

- 类型: pitfall
- 领域: [testing/performance/security/...]
- 关键词: [逗号分隔的关键词]
```

### patterns 模板

```markdown
# [模式名称]

**适用场景**: [什么时候用]
**复杂度**: 低/中/高

## 问题

[解决什么问题？]

## 方案

[核心思路]

## 实现

```代码```

## 权衡

| 优点 | 缺点 |
|------|------|
| ... | ... |

## 相关

- [关联模式/文档]
```

---

## 📊 飞轮效果

### 知识积累

| EPIC | 新增知识 | 累计 |
|------|---------|------|
| EPIC-001 | 5 | 5 |
| EPIC-005 | 12 | 17 |
| EPIC-010 | 8 | 25 |
| EPIC-014 | 15 | 40 |

### 复用率

```
EPIC-001: 0% （无历史知识）
EPIC-005: 23%（复用 EPIC-001 经验）
EPIC-010: 41%（复用前序经验）
EPIC-014: 58%（知识库成熟）
```

**越用越快，越用越稳。**

---

## 💡 设计哲学

### 低摩擦沉淀

- 完成任务时自动提示
- 模板降低编写门槛
- Git 追踪所有变更

### 高效率检索

- FTS 全文搜索
- TF-IDF 智能推荐
- 标签分类索引

### 持续进化

- 定期清理过时知识
- 合并重复内容
- 升级模式抽象层次

---

## 🚀 下一篇预告

**《断路器模式：系统过载的保险丝》**

深入断路器实现：如何防止系统雪崩。

---

#知识管理 #AI学习 #经验沉淀 #效率提升 #工程实践
