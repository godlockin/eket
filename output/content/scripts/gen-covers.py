#!/usr/bin/env python3
"""
封面生成脚本 - 基于 SVG 模板批量生成封面
"""

import re
from pathlib import Path

# 文章配置
ARTICLES = [
    # L1 入门 (绿色 #4caf50)
    {"id": "L1-01", "title": "AI总忘事？试试这招", "subtitle": "EKET框架入门", "level": "L1", "color": "#4caf50"},
    {"id": "L1-02", "title": "让AI学会分工协作", "subtitle": "Master-Slaver模式", "level": "L1", "color": "#4caf50"},
    {"id": "L1-03", "title": "AI健忘症怎么治？", "subtitle": "上下文管理实战", "level": "L1", "color": "#4caf50"},

    # L2 模块 (蓝色 #2196f3)
    {"id": "L2-01", "title": "系统永不宕机的秘密", "subtitle": "四级降级架构", "level": "L2", "color": "#2196f3"},
    {"id": "L2-02", "title": "Rust+Node双轨切换", "subtitle": "高性能与稳定兼得", "level": "L2", "color": "#2196f3"},
    {"id": "L2-03", "title": "AI越用越聪明", "subtitle": "知识飞轮系统", "level": "L2", "color": "#2196f3"},
    {"id": "L2-04", "title": "系统过载保险丝", "subtitle": "断路器模式详解", "level": "L2", "color": "#2196f3"},

    # L3 决策 (紫色 #9c27b0)
    {"id": "L3-01", "title": "为什么三仓分离？", "subtitle": "架构决策复盘", "level": "L3", "color": "#9c27b0"},
    {"id": "L3-02", "title": "Rust vs Node.js", "subtitle": "性能与效率的平衡", "level": "L3", "color": "#9c27b0"},
    {"id": "L3-03", "title": "文件 vs 数据库", "subtitle": "分布式通信的取舍", "level": "L3", "color": "#9c27b0"},

    # L4 教训 (橙色 #ff9800)
    {"id": "L4-01", "title": "覆盖率陷阱", "subtitle": "测试数字游戏的教训", "level": "L4", "color": "#ff9800"},
    {"id": "L4-02", "title": "AI说完成了但没有", "subtitle": "Agent幻觉防治", "level": "L4", "color": "#ff9800"},
    {"id": "L4-03", "title": "多AI并行踩坑", "subtitle": "git死锁血泪史", "level": "L4", "color": "#ff9800"},
    {"id": "L4-04", "title": "Token烧完了", "subtitle": "上下文爆炸实战", "level": "L4", "color": "#ff9800"},
]

def generate_cover_svg(article: dict, template: str) -> str:
    """生成单个封面 SVG"""
    svg = template
    svg = svg.replace("{{TITLE}}", article["title"])
    svg = svg.replace("{{SUBTITLE}}", article["subtitle"])
    svg = re.sub(r'fill="#4caf50"', f'fill="{article["color"]}"', svg, count=1)
    svg = re.sub(r'>L1<', f'>{article["level"]}<', svg)
    return svg

def main():
    base_dir = Path(__file__).parent.parent
    template_path = base_dir / "assets/covers/template-xiaohongshu.svg"
    output_dir = base_dir / "assets/covers/generated"
    output_dir.mkdir(exist_ok=True)

    template = template_path.read_text(encoding="utf-8")

    for article in ARTICLES:
        svg = generate_cover_svg(article, template)
        output_path = output_dir / f"{article['id']}-cover.svg"
        output_path.write_text(svg, encoding="utf-8")
        print(f"✅ {article['id']}: {article['title']}")

    print(f"\n共生成 {len(ARTICLES)} 个封面，位于 {output_dir}")

if __name__ == "__main__":
    main()
