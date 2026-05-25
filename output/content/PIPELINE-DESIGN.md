# EKET 内容生产流水线设计

> 状态：设计中
> 优先平台：小红书、微信公众号
> 风格：PPT解说 + 火柴人演绎

---

## 1. 流水线架构

```
articles/*.md
     │
     ├──[1]──→ 提取元数据 → metadata.json
     │         (标题/摘要/话题/平台)
     │
     ├──[2]──→ 生成配图
     │         ├── 封面图 (Canva模板+微调)
     │         ├── 架构图 (Mermaid→PNG)
     │         └── 火柴人 (SVG素材库)
     │
     ├──[3]──→ 生成TTS音频
     │         ├── Edge TTS (免费)
     │         └── 字幕 SRT
     │
     ├──[4]──→ 平台适配
     │         ├── xiaohongshu/ (图文+话题)
     │         └── wechat/ (标题+摘要+正文)
     │
     └──[5]──→ 视频合成
               ├── PPT式切换
               ├── 火柴人动画
               └── TTS配音+字幕
```

---

## 2. 工具链

| 环节 | 工具 | 成本 |
|------|------|------|
| TTS | Edge TTS (edge-tts) | 免费 |
| 架构图 | Mermaid CLI | 免费 |
| 封面图 | Canva 模板 | 免费版 |
| 火柴人 | OpenPeeps/手绘SVG | 免费 |
| 视频合成 | FFmpeg + Python | 免费 |
| 字幕 | pysrt | 免费 |

---

## 3. 封面模板设计

### 统一元素
- 背景：深色渐变 (#1a1a2e → #16213e)
- 标题：白色粗体，居中
- 副标题：浅蓝色，小号
- Logo：右下角 EKET 水印
- 系列标识：左上角 L1/L2/L3/L4 徽章

### 微调变量
- 徽章颜色：L1绿/L2蓝/L3紫/L4橙
- 装饰图标：根据主题切换
- 火柴人姿态：每篇不同

---

## 4. 火柴人素材库

基于 OpenPeeps 或手绘，预制 10 个姿态：

| ID | 姿态 | 适用场景 |
|----|------|---------|
| 01 | 举手提问 | 问题引入 |
| 02 | 点头认可 | 方案确认 |
| 03 | 摇头否定 | 反模式 |
| 04 | 指向右侧 | 流程指引 |
| 05 | 双手叉腰 | 自信结论 |
| 06 | 挠头困惑 | 问题场景 |
| 07 | 欢呼庆祝 | 成功案例 |
| 08 | 低头沮丧 | 失败案例 |
| 09 | 打字工作 | 代码演示 |
| 10 | 握手合作 | 协作场景 |

---

## 5. 小红书格式

### 图文帖
```
封面图 (1:1 或 3:4)
├── 标题 (≤20字)
├── 正文 (≤1000字)
├── 话题标签 (#AI开发 #效率工具 ...)
└── 图片组 (≤9张)
```

### 视频帖
```
竖屏视频 (9:16)
├── 时长: 60-180s
├── 封面: 带标题
├── 字幕: 必须有
└── BGM: 轻音乐
```

---

## 6. 公众号格式

```markdown
# 标题 (≤64字)

> 摘要 (100字内，显示在推送卡片)

[封面图]

正文...

---
🔗 相关阅读
#话题标签#
```

---

## 7. 视频制作流程

### 短视频 (<3min)

```
1. 解说词脚本 (从文章提取)
2. TTS 生成音频
3. 分段切割 (每段15-30s)
4. 匹配 PPT 页面 + 火柴人
5. FFmpeg 合成
6. 添加字幕 + BGM
```

### 脚本模板

```python
# scripts/gen-video.py

def generate_short_video(article_path):
    # 1. 提取解说词
    script = extract_script(article_path)
    
    # 2. TTS
    audio = edge_tts(script, voice='zh-CN-XiaoxiaoNeural')
    
    # 3. 生成字幕
    srt = generate_srt(script, audio)
    
    # 4. 匹配素材
    slides = match_slides(script)
    stickman = match_stickman(script)
    
    # 5. 合成视频
    ffmpeg_compose(audio, slides, stickman, srt)
```

---

## 8. 目录结构

```
output/content/
├── articles/           # 源文章 (已有14篇)
├── assets/
│   ├── covers/         # 封面图 (14张)
│   ├── diagrams/       # 架构图
│   ├── stickman/       # 火柴人素材 (10个)
│   └── audio/          # TTS音频
├── platforms/
│   ├── xiaohongshu/    # 小红书适配
│   │   ├── L1-01/      # 每篇独立目录
│   │   │   ├── cover.png
│   │   │   ├── content.md
│   │   │   ├── images/
│   │   │   └── video.mp4
│   │   └── ...
│   └── wechat/         # 公众号适配
│       ├── L1-01/
│       │   ├── cover.png
│       │   ├── content.html
│       │   └── summary.txt
│       └── ...
├── videos/
│   ├── short/          # 短视频成品
│   └── long/           # 长视频成品
└── scripts/
    ├── extract-meta.py     # 元数据提取
    ├── gen-cover.py        # 封面生成
    ├── gen-tts.py          # TTS生成
    ├── gen-video.py        # 视频合成
    └── adapt-platform.py   # 平台适配
```

---

## 9. 任务拆解

### EPIC-CONTENT: 内容生产流水线

| Ticket | 标题 | 依赖 | 优先级 |
|--------|------|------|--------|
| TASK-C01 | 火柴人素材库 (10姿态) | - | P0 |
| TASK-C02 | 封面模板设计 (Canva) | - | P0 |
| TASK-C03 | TTS脚本开发 (Edge TTS) | - | P0 |
| TASK-C04 | 元数据提取脚本 | - | P1 |
| TASK-C05 | 视频合成脚本 (FFmpeg) | C01,C03 | P1 |
| TASK-C06 | 小红书适配模板 | C02 | P1 |
| TASK-C07 | 公众号适配模板 | C02 | P1 |
| TASK-C08 | L1系列素材生产 (3篇) | C01-C07 | P2 |
| TASK-C09 | L2系列素材生产 (4篇) | C08 | P2 |
| TASK-C10 | L3系列素材生产 (3篇) | C09 | P2 |
| TASK-C11 | L4系列素材生产 (4篇) | C10 | P2 |

### 关键路径

```
C01 ─┬─→ C05 ─┐
C02 ─┼─→ C06 ─┼─→ C08 → C09 → C10 → C11
C03 ─┤   C07 ─┘
C04 ─┘
```

---

## 10. 验收标准

### P0 基建完成
- [ ] 10个火柴人SVG素材
- [ ] 封面Canva模板可复用
- [ ] TTS脚本一键生成音频+字幕

### P1 模板就绪
- [ ] 小红书图文/视频模板
- [ ] 公众号图文模板
- [ ] 视频合成脚本可运行

### P2 内容产出
- [ ] 14篇文章 → 14套小红书素材
- [ ] 14篇文章 → 14套公众号素材
- [ ] 5个短视频 + 4个长视频
