# TASK-C06: 小红书适配模板

## 元数据
- **EPIC**: EPIC-015
- **优先级**: P1
- **状态**: blocked
- **预估**: 3h
- **类型**: template
- **blocked-by**: TASK-C02

## 描述

创建小红书图文/视频发布模板，自动化适配文章内容。

## 小红书规范

### 图文帖
- **封面**: 1080x1440 (3:4) 或 1080x1080 (1:1)
- **标题**: ≤20 字
- **正文**: ≤1000 字
- **图片**: ≤9 张
- **话题**: 3-5 个

### 视频帖
- **比例**: 9:16 竖屏
- **时长**: 60-180s
- **字幕**: 必须有
- **封面**: 带标题

## 输出结构

```
platforms/xiaohongshu/L1-01/
├── cover.png          # 封面图
├── content.md         # 图文内容
├── images/            # 配图
│   ├── 01.png
│   ├── 02.png
│   └── ...
├── tags.txt           # 话题标签
└── video.mp4          # 视频 (可选)
```

## 模板内容

```markdown
# {{title}}

{{emoji}} {{hook}}

---

{{content_condensed}}

---

💡 **划重点**

{{key_points}}

---

{{tags}}
```

## 脚本功能

```python
# scripts/adapt-platform.py

def adapt_xiaohongshu(
    article_path: str,
    metadata: dict,
    cover_template: str,
    output_dir: str,
):
    """生成小红书发布素材"""
    pass
```

## 标签库

```python
XIAOHONGSHU_TAGS = {
    'L1': '#AI开发 #效率工具 #程序员日常 #AI技巧 #科技分享',
    'L2': '#系统架构 #后端开发 #技术干货 #编程学习 #开发者',
    'L3': '#架构设计 #技术选型 #CTO必看 #技术决策 #工程实践',
    'L4': '#踩坑经验 #编程教训 #程序员必看 #避坑指南 #实战经验',
}
```

## 验收标准

- [ ] 自动压缩正文 ≤1000 字
- [ ] 自动生成话题标签
- [ ] 封面自动填充标题
- [ ] 配图自动裁剪比例

## 输出位置

- 模板: `output/content/scripts/templates/xiaohongshu.md`
- 适配: `output/content/platforms/xiaohongshu/`

## 依赖

- TASK-C02 (封面模板)
- TASK-C04 (元数据提取)

## 被依赖

- TASK-C08-C11 (素材生产)
