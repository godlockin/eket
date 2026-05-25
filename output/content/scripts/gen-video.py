#!/usr/bin/env python3
"""
视频合成脚本 - 基于 PPT 式切换 + 火柴人 + TTS 合成短视频

依赖: pip install moviepy pillow
系统依赖: ffmpeg (brew install ffmpeg)

简化版：生成静态图片序列 + 音频，用 FFmpeg 合成
"""

import json
from pathlib import Path
from typing import Optional
import subprocess
import shutil

# 配置
BASE_DIR = Path(__file__).parent.parent
ASSETS_DIR = BASE_DIR / "assets"
AUDIO_DIR = ASSETS_DIR / "audio"
STICKMAN_DIR = ASSETS_DIR / "stickman"
COVERS_DIR = ASSETS_DIR / "covers/generated"
OUTPUT_DIR = BASE_DIR / "videos/short"

# L1 视频配置
L1_VIDEOS = [
    {
        "id": "L1-01",
        "title": "AI总忘事？试试这招",
        "duration": 75,
        "audio": "L1-01.mp3",
        "cover": "L1-01-cover.svg",
    },
    {
        "id": "L1-02",
        "title": "让AI学会分工协作",
        "duration": 80,
        "audio": "L1-02.mp3",
        "cover": "L1-02-cover.svg",
    },
    {
        "id": "L1-03",
        "title": "AI健忘症怎么治？",
        "duration": 85,
        "audio": "L1-03.mp3",
        "cover": "L1-03-cover.svg",
    },
]


def check_ffmpeg() -> bool:
    """检查 FFmpeg 是否安装"""
    return shutil.which("ffmpeg") is not None


def svg_to_png(svg_path: Path, png_path: Path, width: int = 1080, height: int = 1920) -> bool:
    """将 SVG 转换为 PNG（竖屏视频尺寸）"""
    try:
        # 使用 rsvg-convert 或 cairosvg
        # 先尝试 rsvg-convert
        result = subprocess.run(
            ["rsvg-convert", "-w", str(width), "-h", str(height),
             "-o", str(png_path), str(svg_path)],
            capture_output=True
        )
        if result.returncode == 0:
            return True
    except FileNotFoundError:
        pass

    # 回退：使用 ImageMagick convert
    try:
        result = subprocess.run(
            ["convert", "-resize", f"{width}x{height}",
             str(svg_path), str(png_path)],
            capture_output=True
        )
        return result.returncode == 0
    except FileNotFoundError:
        pass

    # 回退：使用 cairosvg (Python)
    try:
        import cairosvg
        cairosvg.svg2png(
            url=str(svg_path),
            write_to=str(png_path),
            output_width=width,
            output_height=height
        )
        return True
    except ImportError:
        pass

    print(f"⚠️  无法转换 SVG: {svg_path}")
    print("   请安装: brew install librsvg 或 pip install cairosvg")
    return False


def create_video_from_image_and_audio(
    image_path: Path,
    audio_path: Path,
    output_path: Path,
    duration: Optional[float] = None
) -> bool:
    """
    用 FFmpeg 将静态图片 + 音频合成视频

    如果指定 duration，视频时长为 duration 秒
    否则使用音频时长
    """
    if not check_ffmpeg():
        print("❌ FFmpeg 未安装，请运行: brew install ffmpeg")
        return False

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # FFmpeg 命令
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",                    # 循环图片
        "-i", str(image_path),           # 输入图片
        "-i", str(audio_path),           # 输入音频
        "-c:v", "libx264",               # 视频编码
        "-tune", "stillimage",           # 静态图片优化
        "-c:a", "aac",                   # 音频编码
        "-b:a", "192k",                  # 音频比特率
        "-pix_fmt", "yuv420p",           # 像素格式
        "-shortest",                      # 以最短输入为准
    ]

    if duration:
        cmd.extend(["-t", str(duration)])

    cmd.append(str(output_path))

    result = subprocess.run(cmd, capture_output=True)
    return result.returncode == 0


def generate_simple_video(video_config: dict) -> bool:
    """
    生成简化版视频（封面图 + 音频）

    完整版需要逐帧渲染 PPT + 火柴人，这里先用封面图演示流程
    """
    video_id = video_config["id"]
    print(f"\n🎬 处理 {video_id}: {video_config['title']}")

    cover_svg = COVERS_DIR / video_config["cover"]
    audio_mp3 = AUDIO_DIR / video_config["audio"]
    output_mp4 = OUTPUT_DIR / f"{video_id}.mp4"

    # 临时 PNG
    temp_png = OUTPUT_DIR / f"{video_id}-temp.png"

    # 检查输入文件
    if not cover_svg.exists():
        print(f"  ⚠️  封面不存在: {cover_svg}")
        return False

    if not audio_mp3.exists():
        print(f"  ⚠️  音频不存在: {audio_mp3}")
        return False

    # SVG → PNG
    print(f"  📷 转换封面...")
    if not svg_to_png(cover_svg, temp_png):
        # 如果 SVG 转换失败，创建纯色占位图
        print(f"  ⚠️  SVG 转换失败，使用占位图")
        # 用 FFmpeg 生成纯色图片
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", f"color=c=#1a1a2e:s=1080x1920:d=1",
            "-frames:v", "1",
            str(temp_png)
        ], capture_output=True)

    # 合成视频
    print(f"  🎥 合成视频...")
    success = create_video_from_image_and_audio(
        temp_png, audio_mp3, output_mp4
    )

    # 清理临时文件
    if temp_png.exists():
        temp_png.unlink()

    if success:
        print(f"  ✅ 完成: {output_mp4}")
        return True
    else:
        print(f"  ❌ 合成失败")
        return False


def main():
    print("=" * 50)
    print("L1 系列短视频合成")
    print("=" * 50)

    # 检查依赖
    if not check_ffmpeg():
        print("\n❌ 需要安装 FFmpeg:")
        print("   brew install ffmpeg")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    success_count = 0
    for video in L1_VIDEOS:
        if generate_simple_video(video):
            success_count += 1

    print(f"\n{'=' * 50}")
    print(f"完成: {success_count}/{len(L1_VIDEOS)} 个视频")
    print(f"输出目录: {OUTPUT_DIR}")

    # 列出生成的文件
    print("\n生成的文件:")
    for f in OUTPUT_DIR.glob("*.mp4"):
        size_mb = f.stat().st_size / (1024 * 1024)
        print(f"  {f.name} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
