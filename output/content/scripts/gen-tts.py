#!/usr/bin/env python3
"""
TTS 生成脚本 - 使用 Edge TTS

功能:
- 从 Markdown 文件提取解说词
- 调用 edge-tts 生成音频
- 自动生成 SRT 字幕
- 支持指定音色和语速
- 处理长文本分段

依赖: pip install edge-tts
"""

import asyncio
import argparse
import re
import sys
from pathlib import Path
from typing import Optional

# 延迟导入 edge_tts，让 --help 等操作可在无依赖时运行
edge_tts = None


def _ensure_edge_tts():
    """确保 edge_tts 已导入"""
    global edge_tts
    if edge_tts is None:
        try:
            import edge_tts as _edge_tts
            edge_tts = _edge_tts
        except ImportError:
            print("Error: edge-tts not installed. Run: pip install edge-tts", file=sys.stderr)
            sys.exit(1)

# 默认配置
DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'
DEFAULT_RATE = '+0%'
MAX_CHUNK_LENGTH = 3000  # Edge TTS 单次最大文本长度

# 可用音色
VOICES = {
    'xiaoxiao': 'zh-CN-XiaoxiaoNeural',  # 女声，自然专业
    'yunxi': 'zh-CN-YunxiNeural',         # 男声，稳重
    'xiaoyi': 'zh-CN-XiaoyiNeural',       # 女声，活泼年轻
    'yunyang': 'zh-CN-YunyangNeural',     # 男声，新闻播报
}


def extract_script(md_path: str) -> str:
    """
    从 Markdown 提取解说词

    处理:
    - 移除代码块 (```...```)
    - 移除 HTML 标签
    - 移除图片引用
    - 保留标题作为段落分隔
    """
    path = Path(md_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {md_path}")

    content = path.read_text(encoding='utf-8')

    # 移除代码块
    content = re.sub(r'```[\s\S]*?```', '', content)

    # 移除行内代码
    content = re.sub(r'`[^`]+`', '', content)

    # 移除 HTML 标签
    content = re.sub(r'<[^>]+>', '', content)

    # 移除图片引用 ![alt](url)
    content = re.sub(r'!\[[^\]]*\]\([^)]+\)', '', content)

    # 移除链接，保留文本 [text](url) -> text
    content = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', content)

    # 移除 Markdown 标记符号
    content = re.sub(r'^#+\s+', '', content, flags=re.MULTILINE)  # 标题 #
    content = re.sub(r'\*\*([^*]+)\*\*', r'\1', content)  # 粗体
    content = re.sub(r'\*([^*]+)\*', r'\1', content)      # 斜体
    content = re.sub(r'^[-*]\s+', '', content, flags=re.MULTILINE)  # 列表
    content = re.sub(r'^\d+\.\s+', '', content, flags=re.MULTILINE)  # 有序列表

    # 清理多余空行
    content = re.sub(r'\n{3,}', '\n\n', content)

    return content.strip()


def split_text(text: str, max_length: int = MAX_CHUNK_LENGTH) -> list[str]:
    """
    将长文本分割为多个片段

    优先按段落分割，保证语义完整
    """
    if len(text) <= max_length:
        return [text]

    chunks: list[str] = []
    paragraphs = text.split('\n\n')
    current_chunk = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # 段落本身超长，按句子分割
        if len(para) > max_length:
            sentences = re.split(r'([。！？.!?])', para)
            for i in range(0, len(sentences) - 1, 2):
                sentence = sentences[i] + (sentences[i + 1] if i + 1 < len(sentences) else '')
                if len(current_chunk) + len(sentence) > max_length:
                    if current_chunk:
                        chunks.append(current_chunk.strip())
                    current_chunk = sentence
                else:
                    current_chunk += sentence
        else:
            if len(current_chunk) + len(para) + 2 > max_length:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = para
            else:
                current_chunk += ('\n\n' if current_chunk else '') + para

    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks


async def generate_tts_chunk(
    text: str,
    output_audio: Path,
    voice: str,
    rate: str
) -> list[dict]:
    """生成单个 TTS 片段，返回字幕数据"""
    _ensure_edge_tts()
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    subtitles: list[dict] = []

    with open(output_audio, 'wb') as f:
        async for chunk in communicate.stream():
            if chunk['type'] == 'audio':
                f.write(chunk['data'])
            elif chunk['type'] == 'WordBoundary':
                subtitles.append({
                    'offset': chunk['offset'],
                    'duration': chunk['duration'],
                    'text': chunk['text']
                })

    return subtitles


def format_srt_time(microseconds: int) -> str:
    """将微秒转换为 SRT 时间格式 HH:MM:SS,mmm"""
    ms = microseconds // 1000
    seconds = ms // 1000
    ms = ms % 1000
    minutes = seconds // 60
    seconds = seconds % 60
    hours = minutes // 60
    minutes = minutes % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{ms:03d}"


def generate_srt(subtitles: list[dict], output_path: Path) -> None:
    """
    生成 SRT 字幕文件

    将词级别的时间戳合并为句子级别
    """
    if not subtitles:
        output_path.write_text("", encoding='utf-8')
        return

    srt_content = []
    index = 1
    sentence_words: list[dict] = []

    for word in subtitles:
        sentence_words.append(word)
        text = word['text']

        # 遇到句末标点，生成一条字幕
        if text and text[-1] in '。！？.!?,，;；':
            if sentence_words:
                start = sentence_words[0]['offset']
                end = sentence_words[-1]['offset'] + sentence_words[-1]['duration']
                sentence_text = ''.join(w['text'] for w in sentence_words)

                srt_content.append(f"{index}")
                srt_content.append(f"{format_srt_time(start)} --> {format_srt_time(end)}")
                srt_content.append(sentence_text)
                srt_content.append("")

                index += 1
                sentence_words = []

    # 处理剩余文本
    if sentence_words:
        start = sentence_words[0]['offset']
        end = sentence_words[-1]['offset'] + sentence_words[-1]['duration']
        sentence_text = ''.join(w['text'] for w in sentence_words)

        srt_content.append(f"{index}")
        srt_content.append(f"{format_srt_time(start)} --> {format_srt_time(end)}")
        srt_content.append(sentence_text)
        srt_content.append("")

    output_path.write_text('\n'.join(srt_content), encoding='utf-8')


async def generate_tts(
    text: str,
    output_audio: str,
    output_srt: str,
    voice: str = DEFAULT_VOICE,
    rate: str = DEFAULT_RATE
) -> None:
    """
    生成 TTS 音频和字幕

    Args:
        text: 解说词文本
        output_audio: 输出音频路径 (.mp3)
        output_srt: 输出字幕路径 (.srt)
        voice: 音色 ID
        rate: 语速 (如 '+10%', '-20%')
    """
    audio_path = Path(output_audio)
    srt_path = Path(output_srt)

    # 确保输出目录存在
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    srt_path.parent.mkdir(parents=True, exist_ok=True)

    # 分割长文本
    chunks = split_text(text)

    if len(chunks) == 1:
        # 单个片段，直接生成
        subtitles = await generate_tts_chunk(text, audio_path, voice, rate)
        generate_srt(subtitles, srt_path)
    else:
        # 多个片段，需要合并
        import tempfile
        import shutil

        all_subtitles: list[dict] = []
        temp_files: list[Path] = []
        time_offset = 0

        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)

            for i, chunk in enumerate(chunks):
                temp_audio = tmpdir_path / f"chunk_{i}.mp3"
                subtitles = await generate_tts_chunk(chunk, temp_audio, voice, rate)
                temp_files.append(temp_audio)

                # 调整时间偏移
                for sub in subtitles:
                    sub['offset'] += time_offset
                    all_subtitles.append(sub)

                # 计算下一个片段的时间偏移
                if subtitles:
                    time_offset = subtitles[-1]['offset'] + subtitles[-1]['duration']

            # 合并音频文件
            with open(audio_path, 'wb') as outfile:
                for temp_audio in temp_files:
                    outfile.write(temp_audio.read_bytes())

            # 生成字幕
            generate_srt(all_subtitles, srt_path)


async def main():
    parser = argparse.ArgumentParser(
        description='Edge TTS 生成脚本 - 将文本/Markdown 转换为音频和字幕',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 从 Markdown 文件生成
  python gen-tts.py script.md -o output.mp3

  # 直接输入文本
  python gen-tts.py -t "你好，欢迎观看本期视频" -o hello.mp3

  # 指定音色和语速
  python gen-tts.py script.md -o output.mp3 -v yunxi -r "+10%"

可用音色:
  xiaoxiao  - 晓晓（女声，自然专业）[默认]
  yunxi     - 云希（男声，稳重）
  xiaoyi    - 晓伊（女声，活泼年轻）
  yunyang   - 云阳（男声，新闻播报）
"""
    )

    parser.add_argument(
        'input',
        nargs='?',
        help='输入 Markdown 文件路径'
    )
    parser.add_argument(
        '-t', '--text',
        help='直接输入文本（与文件输入二选一）'
    )
    parser.add_argument(
        '-o', '--output',
        help='输出音频文件路径 (.mp3)'
    )
    parser.add_argument(
        '-s', '--srt',
        help='输出字幕文件路径 (.srt)，默认与音频同名'
    )
    parser.add_argument(
        '-v', '--voice',
        default='xiaoxiao',
        choices=list(VOICES.keys()),
        help='音色名称（默认: xiaoxiao）'
    )
    parser.add_argument(
        '-r', '--rate',
        default=DEFAULT_RATE,
        help='语速调节，如 "+10%%" 或 "-20%%" （默认: +0%%）'
    )
    parser.add_argument(
        '--list-voices',
        action='store_true',
        help='列出所有可用音色'
    )

    args = parser.parse_args()

    # 列出音色
    if args.list_voices:
        print("可用音色:")
        for name, voice_id in VOICES.items():
            print(f"  {name:12} - {voice_id}")
        return

    # 获取输入文本
    if args.text:
        text = args.text
    elif args.input:
        text = extract_script(args.input)
    else:
        parser.error('需要提供输入文件或 --text 参数')
        return

    if not text.strip():
        print("Error: 输入文本为空", file=sys.stderr)
        sys.exit(1)

    # 检查输出参数
    if not args.output:
        parser.error('需要提供 -o/--output 参数')
        return

    # 确定输出路径
    output_audio = Path(args.output)
    if args.srt:
        output_srt = Path(args.srt)
    else:
        output_srt = output_audio.with_suffix('.srt')

    # 获取音色 ID
    voice = VOICES.get(args.voice, args.voice)

    print(f"音色: {voice}")
    print(f"语速: {args.rate}")
    print(f"文本长度: {len(text)} 字符")
    print(f"输出音频: {output_audio}")
    print(f"输出字幕: {output_srt}")
    print()

    # 生成 TTS
    await generate_tts(
        text=text,
        output_audio=str(output_audio),
        output_srt=str(output_srt),
        voice=voice,
        rate=args.rate
    )

    print("生成完成!")


if __name__ == '__main__':
    asyncio.run(main())
