# EKET 内容输出中心

> 此目录不纳入版本控制，用于多平台内容创作

## 目录结构

```
output/content/
├── outlines/           # 14篇文章大纲
│   ├── L1-outlines.md  # L1 入门系列 (3篇)
│   ├── L2-outlines.md  # L2 模块系列 (4篇)
│   ├── L3-outlines.md  # L3 决策系列 (4篇)
│   └── L4-outlines.md  # L4 教训系列 (3篇)
├── final/              # 完稿文章（平台定制版）
│   └── L1-01-xiaohongshu-wechat.md
├── reviews/            # 专家评审记录
├── image-cards/        # AI生成配图
│   └── l1-01-ai-collaboration/
│       ├── prompts/    # 图片生成prompt
│       ├── *.png       # 生成的图片
│       ├── analysis.md # 内容分析
│       └── outline.md  # 图片大纲
├── assets/             # 素材资源
│   ├── audio/          # TTS音频
│   ├── covers/         # 封面图
│   ├── diagrams/       # 架构图
│   └── thumbnails/     # 缩略图
├── scripts/            # 生成脚本
├── videos/             # 视频脚本
│   ├── short/          # 短视频
│   └── long/           # 长视频
├── CONTENT-STRATEGY.md # 内容发布策略
├── EXPERT-TEAM.md      # 专家团队配置
├── PLATFORM-USER-INSIGHT.md # 平台用户洞察
├── ILLUSTRATION-PLAN.md # 配图需求清单
└── PIPELINE-DESIGN.md  # 生产流水线设计
```

## 文章系列

| Level | 主题 | 篇数 | 目标平台 |
|-------|------|------|----------|
| L1 | 框架思路 | 3篇 | 小红书/公众号 |
| L2 | 模块拆解 | 4篇 | 公众号/知乎 |
| L3 | 关键决策 | 4篇 | 公众号/掘金 |
| L4 | 经验教训 | 3篇 | 公众号/知乎 |

## 工作流

```
大纲 (outlines/) 
  → 平台适配 (final/) 
  → 专家评审 (reviews/) 
  → 配图生成 (image-cards/) 
  → 发布
```

## 图片生成

使用 `baoyu-image-cards` + Google Gemini API 生成小红书风格配图：
- 风格: notion (极简手绘)
- 配色: macaron (温暖柔和)
- 尺寸: 3:4 竖屏 / 4:5 内容卡

## 发布平台

### 中文
- **小红书**: 300-800字，轻松口语，emoji，可截图干货卡
- **微信公众号**: 800-3000字，专业叙事，代码示例，架构图

### 国际
- **X.com**: 280字内，技术洞见，emoji配图
- **Reddit**: r/MachineLearning, 深度技术讨论
- **Medium**: 英文长文，系统化讲解
