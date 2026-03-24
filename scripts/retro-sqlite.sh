#!/bin/bash
#
# EKET Retrospective SQLite 集成脚本 v0.6.2
# 用途：将 Retrospective 数据存储到 SQLite，支持查询和报告生成
#
# 用法：
#   ./scripts/retro-sqlite.sh init          - 初始化数据库
#   ./scripts/retro-sqlite.sh import        - 导入现有 Retrospective
#   ./scripts/retro-sqlite.sh add           - 添加新的 Retrospective
#   ./scripts/retro-sqlite.sh list          - 列出所有 Retrospective
#   ./scripts/retro-sqlite.sh search        - 搜索 Retrospective
#   ./scripts/retro-sqlite.sh report        - 生成 Sprint 报告
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"
RETRO_DIR="$PROJECT_ROOT/confluence/memory/retrospectives"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level="$1"
    local message="$2"
    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
    esac
}

# 获取 SQLite 数据库路径
get_db_path() {
    local sqlite_config="$CONFIG_DIR/docker-sqlite.yml"
    if [ -f "$sqlite_config" ]; then
        grep "database:" "$sqlite_config" 2>/dev/null | awk '{print $2}' || echo "$PROJECT_ROOT/.eket/data/sqlite/eket.db"
    else
        echo "$PROJECT_ROOT/.eket/data/sqlite/eket.db"
    fi
}

# 初始化数据库表
init_db() {
    local db=$(get_db_path)
    mkdir -p "$(dirname "$db")"

    log INFO "初始化 Retrospective 数据库表..."

    sqlite3 "$db" << 'SQL'
-- Retrospective 主表
CREATE TABLE IF NOT EXISTS retrospectives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sprint_id TEXT NOT NULL,
    file_name TEXT UNIQUE,
    title TEXT NOT NULL,
    date TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Retrospective 内容表
CREATE TABLE IF NOT EXISTS retro_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retro_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    vote_count INTEGER DEFAULT 0,
    created_by TEXT,
    FOREIGN KEY (retro_id) REFERENCES retrospectives(id)
);

-- Retrospective 标签表
CREATE TABLE IF NOT EXISTS retro_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retro_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    FOREIGN KEY (retro_id) REFERENCES retrospectives(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_retro_sprint ON retrospectives(sprint_id);
CREATE INDEX IF NOT EXISTS idx_retro_date ON retrospectives(date);
CREATE INDEX IF NOT EXISTS idx_retro_content_category ON retro_content(category);
CREATE INDEX IF NOT EXISTS idx_retro_tags_tag ON retro_tags(tag);

SQL

    log INFO "数据库表初始化完成：$db"
}

# 导入现有 Retrospective 文件
import_retrospectives() {
    local db=$(get_db_path)

    log INFO "导入现有 Retrospective 文件..."

    if [ ! -d "$RETRO_DIR" ]; then
        log WARN "Retrospective 目录不存在：$RETRO_DIR"
        return 1
    fi

    local count=0

    for retro_file in "$RETRO_DIR"/*.md; do
        if [ -f "$retro_file" ] && [ "$(basename "$retro_file")" != "index.yml" ]; then
            import_single_retro "$db" "$retro_file"
            ((count++))
        fi
    done

    log INFO "已导入 $count 个 Retrospective 文件"
}

# 导入单个 Retrospective 文件
import_single_retro() {
    local db="$1"
    local file="$2"

    local filename=$(basename "$file")
    local title=$(head -1 "$file" 2>/dev/null | sed 's/^# //' || echo "$filename")

    # 提取 Sprint ID (支持 **Sprint**: sprint-001 或 Sprint: sprint-001 格式)
    local sprint_id=$(grep -i "sprint" "$file" 2>/dev/null | grep -v "^#" | head -1 | sed 's/^[^:]*: *//' | tr -d ' **' || echo "unknown")

    # 提取日期 (支持 **时间**: 2026-03-20 或 Date: 格式)
    local date=$(grep -E "^\*\*时间\*\*|^时间:|^date:|^created:" "$file" 2>/dev/null | head -1 | sed 's/^[^:]*: *//' | tr -d ' **' || echo "unknown")

    # 插入主表
    sqlite3 "$db" "INSERT OR REPLACE INTO retrospectives (file_name, title, sprint_id, date) VALUES ('$filename', '$title', '$sprint_id', '$date');"

    # 获取 retro_id
    local retro_id=$(sqlite3 "$db" "SELECT id FROM retrospectives WHERE file_name='$filename';")

    if [ -n "$retro_id" ]; then
        # 解析内容并插入
        parse_and_insert_content "$db" "$retro_id" "$file"
    fi
}

# 解析 Retrospective 内容并插入数据库
parse_and_insert_content() {
    local db="$1"
    local retro_id="$2"
    local file="$3"

    # 简单解析 Markdown 内容
    local current_category=""
    while IFS= read -r line; do
        # 检测标题行（## 开头的行）
        if [[ "$line" =~ ^## ]]; then
            current_category=$(echo "$line" | sed 's/^## //' | tr -d '\r')
        elif [ -n "$current_category" ] && [ -n "$(echo "$line" | tr -d ' \t\r\n')" ]; then
            # 跳过空行和标题行
            if [[ ! "$line" =~ ^- ]] && [[ ! "$line" =~ ^[0-9] ]]; then
                continue
            fi

            # 清理内容
            local content=$(echo "$line" | sed "s/'/''/g" | tr -d '\r')

            if [ -n "$content" ]; then
                sqlite3 "$db" "INSERT INTO retro_content (retro_id, category, content) VALUES ($retro_id, '$current_category', '$content');"
            fi
        fi
    done < "$file"
}

# 列出所有 Retrospective
list_retrospectives() {
    local db=$(get_db_path)

    echo "========================================"
    echo "Retrospective 列表"
    echo "========================================"
    echo ""

    sqlite3 -header -column "$db" "SELECT id, sprint_id, title, date, file_name FROM retrospectives ORDER BY date DESC;"

    echo ""
}

# 搜索 Retrospective
search_retrospectives() {
    local keyword="$1"
    local db=$(get_db_path)

    if [ -z "$keyword" ]; then
        log ERROR "请提供搜索关键词"
        echo "用法：$0 search <关键词>"
        return 1
    fi

    echo "========================================"
    echo "搜索 Retrospective: $keyword"
    echo "========================================"
    echo ""

    # 搜索标题
    echo "【标题匹配】"
    sqlite3 -header -column "$db" "SELECT id, sprint_id, title, date FROM retrospectives WHERE title LIKE '%$keyword%' ORDER BY date DESC;"

    echo ""
    echo "【内容匹配】"
    sqlite3 -header -column "$db" """
        SELECT DISTINCT r.id, r.sprint_id, r.title, r.date, rc.category
        FROM retrospectives r
        JOIN retro_content rc ON r.id = rc.retro_id
        WHERE rc.content LIKE '%$keyword%'
        ORDER BY r.date DESC
        LIMIT 10;
    """

    echo ""
}

# 添加新的 Retrospective
add_retrospective() {
    local sprint_id="$1"
    local title="$2"

    if [ -z "$sprint_id" ] || [ -z "$title" ]; then
        log ERROR "请提供 Sprint ID 和标题"
        echo "用法：$0 add <sprint_id> <title>"
        return 1
    fi

    local db=$(get_db_path)
    local date=$(date -Iseconds)

    # 自动添加 sprint- 前缀（如果用户没有提供）
    local file_sprint_id="$sprint_id"
    if [[ ! "$sprint_id" =~ ^sprint- ]]; then
        file_sprint_id="sprint-${sprint_id}"
    fi

    local filename="${file_sprint_id}-retro.md"
    local filepath="$RETRO_DIR/$filename"

    mkdir -p "$RETRO_DIR"

    # 创建 Markdown 文件
    cat > "$filepath" << EOF
# $title

**Sprint**: $sprint_id
**时间**: $date

---

## 做得好的 (Keep)

-

## 需要改进的 (Problem)

-

## 行动计划 (Try)

-

---

## 参与人员

-

## 投票结果

| 项目 | 票数 |
|------|------|
| | 0 |

EOF

    log INFO "已创建 Retrospective 文件：$filepath"

    # 同步到数据库
    import_single_retro "$db" "$filepath"

    log INFO "已同步到数据库"
}

# 生成 Sprint 报告
generate_report() {
    local sprint_id="$1"
    local db=$(get_db_path)

    echo "========================================"
    echo "Sprint Retrospective 报告"
    if [ -n "$sprint_id" ]; then
        echo "Sprint: $sprint_id"
    fi
    echo "========================================"
    echo ""

    if [ -n "$sprint_id" ]; then
        # 指定 Sprint 的报告
        sqlite3 "$db" """
            SELECT '【' || r.title || '】' as title, r.date, COUNT(rc.id) as items
            FROM retrospectives r
            LEFT JOIN retro_content rc ON r.id = rc.retro_id
            WHERE r.sprint_id = '$sprint_id'
            GROUP BY r.id
            ORDER BY r.date DESC;
        """
    else
        # 所有 Sprint 的汇总报告
        echo "【Retrospective 统计】"
        sqlite3 "$db" """
            SELECT
                COUNT(DISTINCT r.id) as total_retrospectives,
                COUNT(DISTINCT r.sprint_id) as total_sprints,
                COUNT(rc.id) as total_items
            FROM retrospectives r
            LEFT JOIN retro_content rc ON r.id = rc.retro_id;
        """

        echo ""
        echo "【按类别统计】"
        sqlite3 -header -column "$db" """
            SELECT rc.category as category, COUNT(*) as count
            FROM retro_content rc
            GROUP BY rc.category
            ORDER BY count DESC;
        """

        echo ""
        echo "【最近 Retrospective】"
        sqlite3 -header -column "$db" "SELECT sprint_id, title, date FROM retrospectives ORDER BY date DESC LIMIT 5;"
    fi

    echo ""
}

# 显示帮助
show_help() {
    echo "用法：$0 <command> [args]"
    echo ""
    echo "命令:"
    echo "  init              - 初始化数据库表"
    echo "  import            - 导入现有 Retrospective 文件"
    echo "  add <id> <title>  - 添加新的 Retrospective"
    echo "  list              - 列出所有 Retrospective"
    echo "  search <keyword>  - 搜索 Retrospective"
    echo "  report [sprint]   - 生成 Sprint 报告"
    echo "  help              - 显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 init                                    # 初始化数据库"
    echo "  $0 import                                  # 导入所有现有文件"
    echo "  $0 add sprint-001 'Sprint 001 回顾'        # 添加新的 Retrospective"
    echo "  $0 list                                    # 列出所有"
    echo "  $0 search '测试'                           # 搜索包含'测试'的内容"
    echo "  $0 report                                  # 生成汇总报告"
    echo "  $0 report sprint-001                       # 生成指定 Sprint 报告"
}

# 主函数
main() {
    case "${1:-}" in
        init)
            init_db
            ;;
        import)
            import_retrospectives
            ;;
        add)
            add_retrospective "$2" "$3"
            ;;
        list)
            list_retrospectives
            ;;
        search)
            search_retrospectives "$2"
            ;;
        report)
            generate_report "$2"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            show_help
            exit 1
            ;;
    esac
}

main "$@"
