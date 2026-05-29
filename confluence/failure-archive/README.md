# Failure Archive

> 将失败转化为资产 — 系统化记录项目失败教训,避免重蹈覆辙

---

## 📖 使用指南

### 何时创建失败案例

- 项目停滞 >90 天
- 明确放弃的项目
- 技术选型失败需pivot
- 投入大量时间但无产出

### 如何创建失败案例

1. **复制模板**: `cp TEMPLATE.md [project-name].md`
2. **填写内容**:
   - 初始目标: 当时想做什么
   - 失败原因: 技术债/范围蠕变/外部依赖
   - 学到教训: ✅应该 / ❌不要
   - 复活可能: 技术进步检查
3. **更新索引**: 将案例添加到 `index.md`

---

## 🎯 核心价值

### 1. 快速决策
```bash
# 避免重复踩坑
"想用MediaPipe做骨骼追踪?"
→ 查看 skeleton-analysis.md
→ 发现Python API性能不足(12fps vs 30fps目标)
→ 考虑C++ API或其他方案
```

### 2. 技术债追踪
- 记录失败时的技术环境
- 定期检查是否有新技术解决
- 自动提示"X现在可行了"

### 3. 方法论提取
- 从具体失败中提取通用教训
- 失败原因分类(技术/管理/资源)
- 可泛化到其他项目

---

## 📂 文件结构

```
failure-archive/
├── README.md          (本文件)
├── TEMPLATE.md        (失败案例模板)
├── index.md           (按失败原因分类的索引)
├── skeleton-analysis.md
├── recommender.md
└── tsearch.md
```

---

## 🔍 检测at-risk项目

使用自动检测脚本:

```bash
# 检测所有项目
./scripts/detect-at-risk-projects.sh

# 检测特定目录
./scripts/detect-at-risk-projects.sh ~/working/sourcecode/my_projects

# 输出格式:
# [WARN] recommender: 1965天无commit,可能失败
# [WARN] tsearch: 1897天无commit,可能失败
```

**检测条件**:
- last_commit > 90天 → 需关注
- last_commit > 365天 → at-risk
- last_commit > 730天 → 高度疑似失败

---

## 📊 失败分类法

### 技术债 (Technical Debt)
- 依赖库性能不足
- 技术选型错误
- 架构设计缺陷

### 范围蠕变 (Scope Creep)
- 目标不断膨胀
- 未定义MVP
- 完美主义陷阱

### 外部依赖 (External Blocker)
- 第三方API变更
- 硬件限制
- 资源/时间不足

### 兴趣衰退 (Interest Fade)
- 初期激情消退
- 更有趣的项目出现
- 价值不明确

---

## 🔄 复活检查清单

定期(每季度)检查失败项目:

- [ ] 技术进步: 阻塞问题是否已解决?
- [ ] 需求变化: 原目标是否仍有价值?
- [ ] 资源可用: 现在是否有足够时间/资源?
- [ ] 替代方案: 是否有更好的解决方案?

**示例**:
```markdown
## 2027-Q1 复活检查
- MediaPipe C++ API现在支持Python binding
- 性能提升到45fps(满足30fps目标)
- 建议: 值得重新评估
```

---

## 🚀 从失败中成长

> "Failure is not the opposite of success; it's part of success."

失败不是终点,是另一种形式的学习。每个失败案例都是:
- ✅ 一次技术探索
- ✅ 一个教训沉淀
- ✅ 一份决策参考

---

## 相关文档

- [借鉴外部项目方法论](../memory/lessons/borrowing-methodology.md)
- [知识沉淀系统](../memory/patterns/knowledge-system.md)
- [项目卫生指南](../memory/guides/project-hygiene.md)

---

*Created: 2026-05-29 | TASK-270*
