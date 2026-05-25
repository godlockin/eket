# TASK-C03: TTS脚本开发

## 元数据
- **EPIC**: EPIC-015
- **优先级**: P0
- **状态**: done
- **预估**: 3h
- **类型**: script

## 描述

开发 TTS 生成脚本，将文章解说词转换为音频 + 字幕。

## 技术选型

**Edge TTS** (edge-tts)
- 免费
- 中文质量好
- 支持多音色

## 推荐音色

| 音色 | ID | 风格 |
|------|-----|------|
| 晓晓 | zh-CN-XiaoxiaoNeural | 自然、专业 |
| 云希 | zh-CN-YunxiNeural | 男声、稳重 |
| 晓伊 | zh-CN-XiaoyiNeural | 活泼、年轻 |

## 脚本功能

```python
# scripts/gen-tts.py

def generate_tts(
    text: str,           # 解说词
    output_audio: str,   # 输出音频路径
    output_srt: str,     # 输出字幕路径
    voice: str = 'zh-CN-XiaoxiaoNeural',
    rate: str = '+0%',   # 语速调节
):
    """生成 TTS 音频和字幕"""
    pass
```

## 输入格式

```markdown
# 解说词脚本

## 段落1
这是第一段解说词，介绍背景。

## 段落2
这是第二段，讲解核心概念。
```

## 输出格式

- 音频: MP3 (比特率 192kbps)
- 字幕: SRT (按段落分割)

## 验收标准

- [x] `gen-tts.py` 可运行
- [x] 支持指定音色和语速
- [x] 自动生成 SRT 字幕
- [x] 处理长文本分段

## 输出位置

- 脚本: `output/content/scripts/gen-tts.py`
- 音频: `output/content/assets/audio/`

## 依赖

```bash
pip install edge-tts pysrt
```

## 被依赖

- TASK-C05 (视频合成脚本)
