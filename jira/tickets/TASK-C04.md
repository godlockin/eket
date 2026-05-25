# TASK-C04: 元数据提取脚本

## 元数据
- **EPIC**: EPIC-015
- **优先级**: P1
- **状态**: ready
- **预估**: 2h
- **类型**: script

## 描述

开发脚本从 Markdown 文章提取元数据，用于自动化流水线。

## 提取字段

```json
{
  "id": "L1-01",
  "title": "什么是EKET？AI团队的项目经理",
  "subtitle": "入门概览",
  "level": "L1",
  "platforms": ["小红书", "公众号"],
  "tags": ["#AI开发", "#效率工具", "#程序员必看"],
  "summary": "100字摘要...",
  "reading_time": "4分钟",
  "stickman_ids": ["question", "confident"],
  "badge_color": "#4caf50"
}
```

## 脚本功能

```python
# scripts/extract-meta.py

def extract_metadata(article_path: str) -> dict:
    """从 Markdown 提取元数据"""
    pass

def extract_script(article_path: str) -> str:
    """提取解说词脚本（去除代码块、表格）"""
    pass

def batch_extract(articles_dir: str) -> list[dict]:
    """批量提取所有文章"""
    pass
```

## 解析规则

1. **标题**: 第一个 `# ` 行
2. **平台**: `> 平台：...` 行
3. **标签**: 文末 `#xxx #yyy` 行
4. **摘要**: 第一个 `---` 后的 100 字
5. **系列**: 从文件路径推断 (L1/L2/L3/L4)

## 验收标准

- [ ] 解析 14 篇文章无报错
- [ ] 输出 `metadata.json`
- [ ] 解说词去除代码块

## 输出位置

- 脚本: `output/content/scripts/extract-meta.py`
- 元数据: `output/content/metadata.json`

## 依赖

无

## 被依赖

- TASK-C05 (视频合成)
- TASK-C06 (小红书适配)
- TASK-C07 (公众号适配)
