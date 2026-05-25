# TASK-C08: L1系列素材生产

## 元数据
- **EPIC**: EPIC-015
- **优先级**: P2
- **状态**: blocked
- **预估**: 4h
- **类型**: content
- **blocked-by**: TASK-C01, TASK-C02, TASK-C03, TASK-C04, TASK-C05, TASK-C06, TASK-C07

## 描述

生产 L1 入门系列 (3篇) 的完整发布素材。

## 文章清单

| ID | 文章 | 标题 |
|----|------|------|
| L1-01 | 01-what-is-eket.md | 什么是EKET？AI团队的项目经理 |
| L1-02 | 02-master-slaver.md | Master-Slaver：让AI学会分工协作 |
| L1-03 | 03-context-problem.md | 为什么你的AI助手总是"忘事"？ |

## 产出清单

每篇文章产出：

### 小红书
- [ ] 封面图 (1080x1440)
- [ ] 图文内容 (≤1000字)
- [ ] 配图 (3-5张)
- [ ] 话题标签
- [ ] 短视频 (60-90s) - 可选

### 公众号
- [ ] 推送封面 (900x383)
- [ ] 标题 + 摘要
- [ ] 正文 HTML
- [ ] 配图

## 执行步骤

```bash
# 1. 提取元数据
python scripts/extract-meta.py articles/L1-overview/

# 2. 生成封面
# (手动 Canva 操作，或脚本辅助)

# 3. 生成 TTS
python scripts/gen-tts.py articles/L1-overview/01-what-is-eket.md

# 4. 适配平台
python scripts/adapt-platform.py --platform xiaohongshu --article L1-01
python scripts/adapt-platform.py --platform wechat --article L1-01

# 5. 合成视频 (可选)
python scripts/gen-video.py --article L1-01 --type short
```

## 验收标准

- [ ] 3 套小红书素材
- [ ] 3 套公众号素材
- [ ] 素材可直接发布

## 输出位置

- 小红书: `output/content/platforms/xiaohongshu/L1-*/`
- 公众号: `output/content/platforms/wechat/L1-*/`

## 依赖

- TASK-C01 ~ C07 (基建)

## 被依赖

- TASK-C09 (L2系列)
