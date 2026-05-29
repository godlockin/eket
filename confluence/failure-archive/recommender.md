# 失败案例 #002: recommender

> **状态**: 失败 | **最后活跃**: 2021-01-09 | **停滞天数**: 1965

---

## 📝 项目元数据

- **项目路径**: `/Users/chenchen/working/sourcecode/my_projects/recommender`
- **技术栈**: Java 8, Spring Boot 2.4.0, MyBatis, MySQL, Druid
- **开始日期**: ~2020
- **最后commit**: 2021-01-09 (add matrix file for als)
- **总投入时间**: 数月
- **代码规模**: 8426 lines of Java code

---

## 🎯 初始目标

**当时的愿景**:
- 构建推荐系统框架
- 实现ALS(Alternating Least Squares)协同过滤算法
- 支持基于标签的推荐
- 可扩展的推荐引擎架构

**MVP定义** (推断):
- [x] Spring Boot基础框架
- [x] 数据库集成(MyBatis + MySQL)
- [x] ALS算法实现
- [ ] 完整的推荐API ❌
- [ ] 生产环境部署 ❌
- [ ] 实际业务场景验证 ❌

---

## 💔 失败原因

### 1. 技术债 (Technical Debt)
- **具体问题**: 过度工程化,未先验证核心价值
- **严重程度**: 🟡 中
- **架构问题**: 
  ```
  - 完整的三层架构(Controller/Service/DB)
  - 多数据源配置(DyMybatis/TBMybatis)
  - AOP/Validation等企业级特性
  
  问题: 在未验证推荐算法效果前,投入大量时间在基础架构
  ```

### 2. 范围蠕变 (Scope Creep)
- **如何失控**: 
  - 初始: 简单协同过滤POC
  - 扩展1: 完整Spring Boot架构
  - 扩展2: 多种推荐算法(ALS, Label-based)
  - 扩展3: 多数据源、连接池、监控
- **偏离度**: POC → 企业级系统(未定义边界)
- **未定义停止条件**: 缺少"算法验证通过再做工程化"的阶段划分

### 3. 外部依赖 (External Blocker)
- **被什么阻塞**: 
  - 缺少真实数据集验证效果
  - 无明确业务场景
  - data/目录只有示例数据(matrix_file_als.csv仅24字节)
- **依赖版本**: Spring Boot 2.4.0, fastjson 1.2.75 (已有安全漏洞)
- **替代方案探索**: (未见迭代尝试)

### 4. 其他因素
- [x] 兴趣衰退 (工程化投入过多,算法验证不足,失去成就感)
- [x] 需求不明确 (没有具体要解决的推荐问题)
- [x] 缺少反馈循环 (无用户数据,无法验证效果)

---

## ✅ 从中学到

### 应该 (Do)
- ✅ **先验证核心价值**: POC验证算法效果 → 再做工程化
- ✅ **数据驱动开发**: 先准备真实数据集,再写代码
- ✅ **定义具体场景**: "为XX推荐YY"比"通用推荐系统"更可落地
- ✅ **快速迭代验证**: Jupyter Notebook验证算法 → 再用Java实现
- ✅ **阶段性里程碑**: 定义"算法AUC>0.7才做工程化"等门槛

### 不要 (Don't)
- ❌ **不要过早工程化**: 未验证核心价值前,不要投入架构设计
- ❌ **不要无场景开发**: "通用XX系统"往往意味着无明确目标
- ❌ **不要追求完美架构**: 多数据源、AOP等特性在POC阶段是负担
- ❌ **不要忽略数据准备**: 算法项目,数据>代码

### 可复用组件
- ALS算法实现: 核心数学逻辑可复用
- Spring Boot基础配置: 可作为模板复用

---

## 🔮 未来可以复活吗?

### 技术进步检查
- [x] **推荐算法**: 深度学习推荐(DeepFM/WideDeep)已是主流,ALS相对过时
- [x] **Spring Boot**: 已更新到3.x,需迁移
- [x] **fastjson漏洞**: 建议换Jackson/Gson
- [ ] **开源方案成熟**: Mahout/Surprise/RecBole等成熟库,无需从头写

### 复活条件
```markdown
如果满足以下条件,值得重新评估:
1. 有具体业务场景(如"给博客推荐相关文章")
2. 有真实数据集(至少1000+用户交互)
3. 先用Python/Jupyter验证算法效果
4. AUC/NDCG等指标达标后,再决定是否用Java重写
5. 或直接用现成库(RecBole/Surprise),不重复造轮子
```

### 上次检查时间
- **检查日期**: 2026-05-29
- **结论**: 不建议复活原项目
  - 推荐: 如需推荐系统,用成熟库(RecBole/LightFM)
  - 推荐: 先用Python验证,再决定生产语言
  - 推荐: 明确业务场景后重新设计

---

## 🔗 关联项目

### 类似失败
- (其他过早工程化的POC项目)

### 成功案例 (对比学习)
- Jupyter Notebook式开发: 快速验证算法,延迟工程化决策

### 后继项目
- (如需重启,建议先用RecBole等成熟框架验证效果)

---

## 📎 附录

### 架构分析
```
目录结构:
recommender/
├── config/          (3个数据源配置 - 过度设计)
├── recommenders/
│   ├── als/        (ALS算法实现)
│   └── label/      (基于标签推荐)
├── controller/
├── service/
└── db/

问题:
- 未先验证ALS效果,就投入完整架构
- 多数据源配置(DyMybatis/TBMybatis)在POC阶段无必要
- data/目录数据不足(matrix_file_als.csv仅24字节)
```

### 关键教训
```
失败模式: "先做完美架构,再填业务逻辑"
正确流程:
1. 准备真实数据 (Kaggle/MovieLens等)
2. Jupyter验证算法 (ALS/MF/DeepFM对比)
3. 选择效果最好的算法
4. 最小化实现(Flask/FastAPI单文件)
5. 验证生产环境效果
6. 效果达标后,再考虑Java重写(可能不需要)
```

### 相关文档
- [ALS算法原理](https://spark.apache.org/docs/latest/ml-collaborative-filtering.html)
- [推荐系统评估指标](https://en.wikipedia.org/wiki/Evaluation_measures_(information_retrieval))

### 外部资源
- [RecBole推荐库](https://github.com/RUCAIBox/RecBole)
- [Surprise协同过滤库](https://github.com/NicolasHug/Surprise)
- [MovieLens数据集](https://grouplens.org/datasets/movielens/)

---

## 🏷️ 标签

`#失败原因/范围蠕变` `#失败原因/需求不明确` `#技术栈/Java` `#技术栈/SpringBoot` `#过早工程化` `#不建议复活`

---

*Created: 2026-05-29 | Last Updated: 2026-05-29 | TASK-270*
