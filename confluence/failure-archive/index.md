# Failure Archive Index

> 按失败原因分类的项目索引 — 快速查找类似失败案例

---

## 📊 统计概览

- **总失败案例**: 3
- **平均停滞时间**: 1984天 (~5.4年)
- **总代码行数**: 12,085 lines (skeleton未统计)
- **最常见失败原因**: 范围蠕变(3/3), 需求不明确(2/3)

---

## 🔍 按失败原因分类

### 1️⃣ 技术债 (Technical Debt)

#### 🔴 高严重度
- **[skeleton-analysis](skeleton-analysis.md)** — MediaPipe Python API性能不足
  - 目标30fps,实际12fps (2.5x gap)
  - Python GIL + 数据拷贝开销
  - **教训**: 性能敏感场景避免高层封装

- **[tsearch](tsearch.md)** — 重复造轮子,与Elasticsearch竞争
  - 实现倒排索引、分布式架构
  - 无差异化价值
  - **教训**: 造轮子前明确创新点

#### 🟡 中严重度
- **[recommender](recommender.md)** — 过早工程化
  - 未验证算法效果就投入完整架构
  - 多数据源、AOP等企业级特性在POC阶段是负担
  - **教训**: 先验证核心价值,再工程化

---

### 2️⃣ 范围蠕变 (Scope Creep)

**所有3个项目都存在范围蠕变问题:**

- **[skeleton-analysis](skeleton-analysis.md)**: 单人追踪 → 多人 → 姿态识别 → 3D重建
- **[recommender](recommender.md)**: 简单POC → 完整架构 → 多算法 → 多数据源
- **[tsearch](tsearch.md)**: 简单搜索 → 分布式 → 分片 → 副本容错

**共同模式**:
- ❌ 未定义MVP边界
- ❌ 未设定"什么时候够了"的停止条件
- ❌ 功能不断膨胀,基础功能未验证

**防范措施**:
- ✅ 明确MVP定义
- ✅ 设定阶段性里程碑
- ✅ "第一版只做X,验证通过再做Y"

---

### 3️⃣ 外部依赖 (External Blocker)

- **[skeleton-analysis](skeleton-analysis.md)** — MediaPipe性能限制
  - 依赖Python binding,无法达到目标fps
  - C++ API学习成本高

- **[tsearch](tsearch.md)** — 与成熟方案竞争失败
  - Elasticsearch功能更强,社区更活跃
  - 自研维护成本高

---

### 4️⃣ 需求不明确 (Unclear Requirements)

- **[recommender](recommender.md)** — 无具体业务场景
  - "通用推荐系统"目标过于宽泛
  - 缺少真实数据集验证
  - 无反馈循环

- **[tsearch](tsearch.md)** — 无差异化定位
  - "为什么不用Elasticsearch?"无答案
  - 缺少明确的服务对象

---

### 5️⃣ 兴趣衰退 (Interest Fade)

**所有3个项目都存在兴趣衰退:**

- **skeleton-analysis**: 性能瓶颈打击信心
- **recommender**: 工程化投入过多,算法验证不足,失去成就感
- **tsearch**: 意识到重复造轮子,失去动力

**共同触发因素**:
- 长时间无可见成果
- 技术障碍无法突破
- 价值质疑 ("这有什么用?")

---

## 📅 按时间线分类

### 2019-2020
- **skeleton-analysis**: 启动,性能瓶颈导致停滞

### 2020-2021
- **recommender**: 启动 (2020) → 最后commit (2021-01-09)
- **tsearch**: 启动 (2020) → 最后commit (2021-03-19)

### 2021-2026
- **所有项目**: 完全停滞 (~5年无活动)

---

## 🏷️ 按技术栈分类

### Python
- **skeleton-analysis** — MediaPipe, OpenCV, NumPy

### Java + Spring Boot
- **recommender** — Spring Boot 2.4.0, MyBatis, MySQL
- **tsearch** — Spring Boot 2.4.3, 自研搜索引擎

---

## ⚠️ 失败模式速查

### "我想快速原型,但投入了完整架构"
→ 参考: [recommender](recommender.md)

### "依赖库性能不足,无法达到目标"
→ 参考: [skeleton-analysis](skeleton-analysis.md)

### "重复造轮子,与成熟方案竞争"
→ 参考: [tsearch](tsearch.md)

### "范围不断膨胀,基础功能未验证"
→ 参考: 所有3个项目

### "无具体业务场景,目标宽泛"
→ 参考: [recommender](recommender.md), [tsearch](tsearch.md)

---

## 🔄 复活可能性评估

### 🟢 可复活 (条件宽松)
- (暂无)

### 🟡 可复活 (条件苛刻)
- **skeleton-analysis**: 如果用C++/Rust重写,或降级到非实时场景

### 🔴 不建议复活
- **recommender**: 建议用成熟库(RecBole/Surprise)
- **tsearch**: 建议用Elasticsearch/Meilisearch

---

## 📚 通用教训提取

### Top 5 教训 (跨项目)

1. **先验证核心价值,再工程化**
   - 适用: recommender, skeleton-analysis
   - 做法: POC → 效果验证 → 架构设计

2. **明确MVP边界,避免范围蠕变**
   - 适用: 所有3个项目
   - 做法: "第一版只做X,验证通过再做Y"

3. **性能POC先行**
   - 适用: skeleton-analysis
   - 做法: 技术选型前,先验证性能是否满足目标

4. **造轮子前明确差异化**
   - 适用: tsearch, recommender
   - 做法: "我能做什么ES/RecBole做不到的?"

5. **定义具体场景,避免"通用XX系统"**
   - 适用: recommender, tsearch
   - 做法: "为XX推荐YY" > "通用推荐系统"

---

## 🛠️ 相关工具

### 检测at-risk项目
```bash
./scripts/detect-at-risk-projects.sh ~/working/sourcecode/my_projects
```

### 创建新失败案例
```bash
cp confluence/failure-archive/TEMPLATE.md confluence/failure-archive/[project-name].md
# 编辑后更新本索引
```

---

## 📖 延伸阅读

- [借鉴外部项目方法论](../memory/lessons/borrowing-methodology.md)
- [知识沉淀系统](../memory/patterns/knowledge-system.md)
- [覆盖率驱动开发反模式](../memory/pitfalls/coverage-driven-development.md)
- [Karpathy编码准则](../memory/lessons/karpathy-code-antipatterns.md)

---

*Last Updated: 2026-05-29 | TASK-270*
