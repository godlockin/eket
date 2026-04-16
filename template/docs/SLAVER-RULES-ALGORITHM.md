# Slaver 专项规则 — Algorithm Role

> 补充 SLAVER-RULES.md，Algorithm Slaver（AI/ML/算法）必须遵守。

## 核心原则
- 实验可复现：随机种子固定，数据集版本锁定，结果可重现
- Baseline 先行：新方案必须与 baseline 对比，无对比数据的结论无效
- 数据泄露防范：验证集/测试集绝不参与特征工程或参数选择

## 实验规范
- 实验记录放 `confluence/memory/algo-experiment-{name}-{date}.md`
- 必含：数据集描述 / 评估指标 / 超参数 / 结果表格 / 结论
- 模型文件不入 git（.gitignore），用 DVC 或对象存储管理

## 禁止行为
- 不在测试集上调参（数据泄露）
- 不省略负面实验结果
- 不部署未经离线评估的模型
