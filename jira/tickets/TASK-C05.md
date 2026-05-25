# TASK-C05: 视频合成脚本

## 元数据
- **EPIC**: EPIC-015
- **优先级**: P1
- **状态**: blocked
- **预估**: 4h
- **类型**: script
- **blocked-by**: TASK-C01, TASK-C03

## 描述

开发 FFmpeg 视频合成脚本，将 PPT 图片 + TTS 音频 + 火柴人素材合成视频。

## 视频风格

- **短视频**: 60-180s，竖屏 9:16
- **长视频**: 5-15min，横屏 16:9
- **风格**: PPT 式切换 + 火柴人演绎

## 合成流程

```
1. 音频分段 (按解说词段落)
2. 匹配 PPT 页面
3. 叠加火柴人 (根据段落情绪)
4. 添加字幕
5. 添加 BGM (可选)
6. 输出视频
```

## 脚本功能

```python
# scripts/gen-video.py

def generate_video(
    article_id: str,      # 文章ID
    audio_path: str,      # TTS音频
    srt_path: str,        # 字幕
    slides: list[str],    # PPT图片列表
    stickman: list[str],  # 火柴人ID列表
    output_path: str,     # 输出视频
    aspect: str = '9:16', # 画面比例
    bgm_path: str = None, # 背景音乐
):
    """合成视频"""
    pass
```

## FFmpeg 命令模板

```bash
# 基础合成
ffmpeg -i audio.mp3 -i slide.png -i stickman.svg \
  -filter_complex "[1:v][2:v]overlay=x=100:y=100" \
  -vf "subtitles=srt:force_style='FontSize=24'" \
  -c:v libx264 -preset fast -crf 23 \
  output.mp4
```

## 转场效果

- **淡入淡出**: `fade=t=in:st=0:d=0.5`
- **滑动**: `xfade=transition=slideleft`

## 验收标准

- [ ] 支持短/长视频两种规格
- [ ] 自动匹配 PPT 和音频时长
- [ ] 火柴人位置可配置
- [ ] 字幕样式统一

## 输出位置

- 脚本: `output/content/scripts/gen-video.py`
- 短视频: `output/content/videos/short/`
- 长视频: `output/content/videos/long/`

## 依赖

- TASK-C01 (火柴人素材)
- TASK-C03 (TTS脚本)

```bash
# 系统依赖
brew install ffmpeg  # macOS
```

## 被依赖

- TASK-C08-C11 (素材生产)
