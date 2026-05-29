# 失败案例 #003: tsearch

> **状态**: 失败 | **最后活跃**: 2021-03-19 | **停滞天数**: 1897

---

## 📝 项目元数据

- **项目路径**: `/Users/chenchen/working/sourcecode/my_projects/tsearch`
- **技术栈**: Java 8, Spring Boot 2.4.3, fastjson 1.2.75
- **开始日期**: ~2020
- **最后commit**: 2021-03-19 (add flush cached doc into disk & reload)
- **总投入时间**: 数月
- **代码规模**: 3659 lines of Java code

---

## 🎯 初始目标

**当时的愿景**:
- 构建轻量级搜索引擎
- 文档加载、转换、索引pipeline
- 支持全文检索API
- 分布式集群架构(节点发现、文档分片)

**MVP定义** (基于README):
- [x] 文档加载与索引
- [x] 中文分词(基于词典)
- [x] 倒排索引
- [x] 全文检索API
- [x] 节点健康检查
- [ ] 持久化机制 (部分完成,最后commit还在实现)
- [ ] 多节点集群 ❌
- [ ] 副本与容错 ❌

---

## 💔 失败原因

### 1. 技术债 (Technical Debt)
- **具体问题**: 重复造轮子,与Elasticsearch等成熟方案竞争
- **严重程度**: 🔴 高
- **架构分析**: 
  ```
  实现内容:
  - 倒排索引(in-memory)
  - 中文分词(基于字典)
  - 文档缓存与持久化
  - 集群节点管理
  - 分片路由
  
  问题:
  - Elasticsearch/Solr已经解决这些问题
  - 自研搜索引擎投入产出比极低
  - 缺少核心创新点(为何不用现成方案?)
  ```

### 2. 范围蠕变 (Scope Creep)
- **如何失控**: 
  - 初始: 简单的文档索引与检索
  - 扩展1: 分布式节点管理
  - 扩展2: 文档分片与路由
  - 扩展3: 持久化与reload机制
  - 扩展4: (未完成) 副本与容错
- **偏离度**: 简单搜索 → 分布式搜索引擎
- **未定义停止条件**: 没有"实现到什么程度就够了"的标准

### 3. 外部依赖 (External Blocker)
- **被什么阻塞**: 
  - 与Elasticsearch竞争,胜算为零
  - 缺少实际业务场景(为谁服务?)
  - 性能/稳定性无法与成熟方案相比
- **依赖版本**: fastjson 1.2.75 (有安全漏洞)
- **替代方案探索**: (未见切换到Elasticsearch的迹象)

### 4. 其他因素
- [x] 兴趣衰退 (意识到重复造轮子,失去动力)
- [x] 需求不明确 (无具体要解决的搜索问题)
- [x] 价值质疑 ("为什么不直接用Elasticsearch?")

---

## ✅ 从中学到

### 应该 (Do)
- ✅ **明确创新点**: 造轮子前,问"我能做什么ES做不到的?"
- ✅ **学习目的vs生产目的**: 学习可以造轮子,生产必须用成熟方案
- ✅ **定义差异化价值**: "比ES轻量10x" / "专为XX场景优化"等
- ✅ **设定学习边界**: "实现到倒排索引就够了,不做分布式"
- ✅ **先用再造**: 深度使用Elasticsearch后,才知道哪里可以改进

### 不要 (Don't)
- ❌ **不要无差异化造轮子**: 与成熟方案功能重叠,无创新点
- ❌ **不要忽略维护成本**: 自研搜索引擎需要持续投入,ES有社区支持
- ❌ **不要低估复杂度**: 分布式搜索涉及CAP权衡、一致性、故障恢复等难题
- ❌ **不要跳过需求分析**: "我想要个搜索引擎"不是有效需求

### 可复用组件
- 中文分词逻辑: 简单词典匹配,可用于其他NLP项目
- 倒排索引实现: 教学用途,理解搜索引擎原理

---

## 🔮 未来可以复活吗?

### 技术进步检查
- [x] **Elasticsearch**: 已是行业标准,功能更强大
- [x] **Meilisearch**: 新一代轻量搜索引擎,Rust实现,性能优秀
- [x] **Typesense**: 另一个现代搜索引擎替代品
- [ ] **差异化空间**: 除非有特殊场景(如嵌入式/边缘设备搜索),否则无复活价值

### 复活条件
```markdown
如果满足以下条件,值得重新评估:
1. 有明确差异化场景(如"IoT设备上的轻量搜索,内存<100MB")
2. 或纯学习目的,深入理解搜索引擎原理
3. 或针对特定行业(如医疗/法律)定制搜索
4. 但生产环境强烈建议用Elasticsearch/Meilisearch
```

### 上次检查时间
- **检查日期**: 2026-05-29
- **结论**: 不建议复活
  - 推荐: 直接使用Elasticsearch/Meilisearch
  - 推荐: 如需学习,参考Lucene/Tantivy源码
  - 推荐: 专注业务搜索需求,而非基础设施

---

## 🔗 关联项目

### 类似失败
- recommender: 同样是重复造轮子(推荐系统)

### 成功案例 (对比学习)
- Meilisearch: 找到差异化点(易用性+性能),成功的轮子
  - 差异: "比ES简单10x配置,性能接近" vs "功能类似ES"

### 后继项目
- (如需搜索,建议直接集成Elasticsearch)

---

## 📎 附录

### 架构分析
```
实现功能对比:

tsearch实现:                 Elasticsearch已有:
- 倒排索引(in-memory)        ✅ (更高效)
- 中文分词(简单词典)          ✅ (IK/jieba等成熟方案)
- 文档CRUD API              ✅
- 全文检索                   ✅
- 节点管理                   ✅ (更完善)
- 分片路由                   ✅ (自动化)
- 持久化                     ✅ (Lucene存储)
- 副本容错                   ❌ (tsearch未完成, ES已有)

结论: 100%功能重叠,无差异化价值
```

### 关键教训
```
造轮子的合理理由:
✅ 学习目的 (理解原理)
✅ 性能优化 (通用方案慢10x)
✅ 差异化场景 (嵌入式/特殊需求)
✅ 成本考虑 (ES商业版太贵,开源版够用)

造轮子的错误理由:
❌ "我能做" (能做≠应该做)
❌ "不想学ES" (学习成本<自研成本)
❌ "ES太重" (未实际测试资源占用)
❌ "好玩" (好玩≠有价值)

tsearch属于: ❌ 错误理由
```

### README摘录
```markdown
# Tsearch
A tiny searching system design for loading, transforming, indexing documents.

## Enhance (未完成的TODO)
1. shard the docs' index into several nodes
2. involve the replica of doc index
3. involve doc index's persistence & reload  ← 最后commit还在实现这个
4. involve other ways of dictionary initialization
5. add system monitor thread & api
6. involve docker deploy
7. add cached data persistence

→ TODO列表证明项目范围不断膨胀,未定义边界
```

### 相关文档
- [Elasticsearch原理](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [Lucene核心概念](https://lucene.apache.org/core/)
- [Meilisearch对比](https://www.meilisearch.com/docs/learn/what_is_meilisearch/comparison_to_alternatives)

### 外部资源
- [Elasticsearch](https://github.com/elastic/elasticsearch)
- [Meilisearch](https://github.com/meilisearch/meilisearch)
- [Tantivy (Rust搜索引擎)](https://github.com/quickwit-oss/tantivy)

---

## 🏷️ 标签

`#失败原因/重复造轮子` `#失败原因/范围蠕变` `#失败原因/需求不明确` `#技术栈/Java` `#技术栈/SpringBoot` `#不建议复活`

---

*Created: 2026-05-29 | Last Updated: 2026-05-29 | TASK-270*
