#!/usr/bin/env python3
"""
平台适配脚本 - 将文章转换为小红书/公众号格式

读取 USER-INSIGHT.md 和 TITLE-OPTIMIZATION.md 指导内容优化
"""

import re
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).parent.parent
ARTICLES_DIR = BASE_DIR / "articles"
PLATFORMS_DIR = BASE_DIR / "platforms"

# 话题标签（来自 USER-INSIGHT.md）
TAGS = {
    "L1": ["#AI开发", "#效率工具", "#程序员日常", "#AI技巧", "#科技分享"],
    "L2": ["#系统架构", "#后端开发", "#技术干货", "#编程学习", "#开发者"],
    "L3": ["#架构设计", "#技术选型", "#CTO必看", "#技术决策", "#工程实践"],
    "L4": ["#踩坑经验", "#编程教训", "#程序员必看", "#避坑指南", "#实战经验"],
}

# 优化后的标题（来自 TITLE-OPTIMIZATION.md）
OPTIMIZED_TITLES = {
    "L1-01": {
        "xiaohongshu": "3个AI打架怎么办",
        "wechat": "3个AI同时改代码打起来了，我用这招解决",
    },
    "L1-02": {
        "xiaohongshu": "AI也要分工协作",
        "wechat": "让AI学会分工：一个管需求，一个写代码",
    },
    "L1-03": {
        "xiaohongshu": "AI总忘事怎么办",
        "wechat": "聊了两小时AI说忘了？三招解决健忘症",
    },
    "L2-01": {
        "xiaohongshu": "系统永不宕机的秘密",
        "wechat": "凌晨3点系统崩了？四级降级架构拯救你",
    },
    "L2-02": {
        "xiaohongshu": "Rust+Node双轨切换",
        "wechat": "性能要快还是稳？Rust和Node.js我全都要",
    },
    "L2-03": {
        "xiaohongshu": "AI越用越聪明的秘密",
        "wechat": "让AI越用越聪明：知识飞轮系统实战",
    },
    "L2-04": {
        "xiaohongshu": "系统过载保险丝",
        "wechat": "请求暴涨10倍也不崩：断路器模式详解",
    },
    "L3-01": {
        "xiaohongshu": "代码分三个仓库？",
        "wechat": "为什么我把代码分成三个仓库？架构决策复盘",
    },
    "L3-02": {
        "xiaohongshu": "Rust vs Node选哪个",
        "wechat": "Rust vs Node.js：我选了两个都用",
    },
    "L3-03": {
        "xiaohongshu": "文件比数据库好用？",
        "wechat": "分布式通信用文件还是数据库？我的取舍",
    },
    "L4-01": {
        "xiaohongshu": "90%覆盖率的陷阱",
        "wechat": "90%测试覆盖率=代码质量高？我被坑惨了",
    },
    "L4-02": {
        "xiaohongshu": "AI说做完了但没做",
        "wechat": "AI说任务完成了，但代码是空的——幻觉防治指南",
    },
    "L4-03": {
        "xiaohongshu": "多AI并行踩坑实录",
        "wechat": "让3个AI并行开发，结果git死锁了",
    },
    "L4-04": {
        "xiaohongshu": "Token烧了50刀",
        "wechat": "一下午Token烧了50刀：上下文爆炸实战",
    },
}

# 文章映射
ARTICLE_FILES = {
    "L1-01": "L1-overview/01-what-is-eket.md",
    "L1-02": "L1-overview/02-master-slaver.md",
    "L1-03": "L1-overview/03-context-problem.md",
    "L2-01": "L2-modules/01-degradation.md",
    "L2-02": "L2-modules/02-dual-track.md",
    "L2-03": "L2-modules/03-knowledge-flywheel.md",
    "L2-04": "L2-modules/04-circuit-breaker.md",
    "L3-01": "L3-decisions/01-three-repo.md",
    "L3-02": "L3-decisions/02-rust-vs-node.md",
    "L3-03": "L3-decisions/03-file-vs-db.md",
    "L4-01": "L4-lessons/01-coverage-trap.md",
    "L4-02": "L4-lessons/02-agent-hallucination.md",
    "L4-03": "L4-lessons/03-git-deadlock.md",
    "L4-04": "L4-lessons/04-context-explosion.md",
}


def extract_summary(content: str, max_length: int = 100) -> str:
    """提取文章摘要"""
    # 移除 frontmatter
    content = re.sub(r'^---[\s\S]*?---', '', content)
    # 移除标题
    content = re.sub(r'^#+.*$', '', content, flags=re.MULTILINE)
    # 移除代码块
    content = re.sub(r'```[\s\S]*?```', '', content)
    # 移除图片
    content = re.sub(r'!\[.*?\]\(.*?\)', '', content)
    # 移除链接
    content = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', content)
    # 移除 Markdown 标记
    content = re.sub(r'[*_#>`-]', '', content)
    # 清理空白
    content = re.sub(r'\n+', ' ', content).strip()

    if len(content) > max_length:
        content = content[:max_length-3] + "..."

    return content


def condense_for_xiaohongshu(content: str, max_length: int = 800) -> str:
    """压缩内容适配小红书"""
    # 移除代码块（小红书不适合展示代码）
    content = re.sub(r'```[\s\S]*?```', '\n[代码略]\n', content)
    # 移除复杂表格
    content = re.sub(r'\|.*\|.*\n', '', content)
    # 简化标题
    content = re.sub(r'^##+ ', '📌 ', content, flags=re.MULTILINE)
    # 移除图片语法
    content = re.sub(r'!\[.*?\]\(.*?\)', '', content)

    if len(content) > max_length:
        # 按段落截断
        paragraphs = content.split('\n\n')
        result = []
        current_len = 0
        for p in paragraphs:
            if current_len + len(p) > max_length:
                break
            result.append(p)
            current_len += len(p)
        content = '\n\n'.join(result) + "\n\n👆 完整版见公众号"

    return content


def adapt_xiaohongshu(article_id: str) -> dict:
    """生成小红书格式内容"""
    level = article_id.split('-')[0]
    article_path = ARTICLES_DIR / ARTICLE_FILES[article_id]

    if not article_path.exists():
        return {"error": f"文章不存在: {article_path}"}

    content = article_path.read_text(encoding='utf-8')
    title = OPTIMIZED_TITLES.get(article_id, {}).get("xiaohongshu", article_id)
    tags = TAGS.get(level, [])

    return {
        "title": title,
        "content": condense_for_xiaohongshu(content),
        "tags": " ".join(tags),
        "cover": f"{article_id}-cover.svg",
    }


def adapt_wechat(article_id: str) -> dict:
    """生成公众号格式内容"""
    level = article_id.split('-')[0]
    article_path = ARTICLES_DIR / ARTICLE_FILES[article_id]

    if not article_path.exists():
        return {"error": f"文章不存在: {article_path}"}

    content = article_path.read_text(encoding='utf-8')
    title = OPTIMIZED_TITLES.get(article_id, {}).get("wechat", article_id)
    summary = extract_summary(content, 120)

    return {
        "title": title,
        "summary": summary,
        "content": content,  # 公众号保留完整内容
        "cover": f"{article_id}-cover.svg",
    }


def generate_all():
    """批量生成所有平台适配内容"""

    # 小红书
    xhs_dir = PLATFORMS_DIR / "xiaohongshu"
    xhs_dir.mkdir(parents=True, exist_ok=True)

    # 公众号
    wechat_dir = PLATFORMS_DIR / "wechat"
    wechat_dir.mkdir(parents=True, exist_ok=True)

    for article_id in ARTICLE_FILES.keys():
        print(f"📝 处理 {article_id}...")

        # 小红书
        xhs_output = xhs_dir / article_id
        xhs_output.mkdir(exist_ok=True)

        xhs_content = adapt_xiaohongshu(article_id)
        if "error" not in xhs_content:
            (xhs_output / "content.md").write_text(
                f"# {xhs_content['title']}\n\n"
                f"{xhs_content['content']}\n\n"
                f"---\n{xhs_content['tags']}",
                encoding='utf-8'
            )
            print(f"   ✅ 小红书: {xhs_output}")

        # 公众号
        wechat_output = wechat_dir / article_id
        wechat_output.mkdir(exist_ok=True)

        wechat_content = adapt_wechat(article_id)
        if "error" not in wechat_content:
            (wechat_output / "title.txt").write_text(
                wechat_content['title'],
                encoding='utf-8'
            )
            (wechat_output / "summary.txt").write_text(
                wechat_content['summary'],
                encoding='utf-8'
            )
            (wechat_output / "content.md").write_text(
                wechat_content['content'],
                encoding='utf-8'
            )
            print(f"   ✅ 公众号: {wechat_output}")

    print(f"\n完成！输出目录: {PLATFORMS_DIR}")


if __name__ == "__main__":
    generate_all()
