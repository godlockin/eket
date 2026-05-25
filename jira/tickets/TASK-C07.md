# TASK-C07: 公众号适配模板

## 元数据
- **EPIC**: EPIC-015
- **优先级**: P1
- **状态**: blocked
- **预估**: 3h
- **类型**: template
- **blocked-by**: TASK-C02

## 描述

创建微信公众号图文发布模板，自动化适配文章内容。

## 公众号规范

### 推送卡片
- **封面**: 900x383 (2.35:1)
- **标题**: ≤64 字
- **摘要**: ≤120 字

### 正文
- **排版**: 支持 HTML/Markdown
- **图片**: 建议宽度 900px
- **代码**: 需要代码高亮

## 输出结构

```
platforms/wechat/L1-01/
├── cover.png          # 推送封面
├── title.txt          # 标题
├── summary.txt        # 摘要
├── content.html       # 正文 (HTML格式)
├── content.md         # 正文 (Markdown格式)
└── images/            # 配图
    ├── 01.png
    └── ...
```

## 模板内容

```html
<!-- templates/wechat.html -->

<section style="...">
  <h1>{{title}}</h1>
  
  <blockquote>
    {{summary}}
  </blockquote>
  
  <img src="{{cover}}" alt="封面" />
  
  {{content}}
  
  <hr />
  
  <p>🔗 相关阅读</p>
  <ul>
    {{related_links}}
  </ul>
  
  <p>{{tags}}</p>
</section>
```

## 代码高亮

```python
# 使用 Pygments 或 highlight.js
def highlight_code(code: str, lang: str) -> str:
    """代码高亮转 HTML"""
    pass
```

## 脚本功能

```python
# scripts/adapt-platform.py

def adapt_wechat(
    article_path: str,
    metadata: dict,
    cover_template: str,
    output_dir: str,
):
    """生成公众号发布素材"""
    pass
```

## 样式规范

```css
/* 公众号样式 */
body { font-size: 16px; line-height: 1.8; }
h1 { font-size: 22px; font-weight: bold; }
h2 { font-size: 18px; font-weight: bold; }
code { background: #f5f5f5; padding: 2px 6px; }
pre { background: #282c34; color: #abb2bf; padding: 16px; }
blockquote { border-left: 4px solid #4fc3f7; padding-left: 16px; }
```

## 验收标准

- [ ] 标题 ≤64 字
- [ ] 摘要 ≤120 字
- [ ] 代码有高亮
- [ ] 图片宽度适配

## 输出位置

- 模板: `output/content/scripts/templates/wechat.html`
- 适配: `output/content/platforms/wechat/`

## 依赖

- TASK-C02 (封面模板)
- TASK-C04 (元数据提取)

## 被依赖

- TASK-C08-C11 (素材生产)
