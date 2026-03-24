#!/bin/bash
#
# EKET Docker SQLite 容器管理脚本 v0.6.0
# 用途：启动/停止/管理 SQLite 容器，用于 confluence 文件索引和 jira 管理
#
# 用法：
#   ./scripts/docker-sqlite.sh start    - 启动 SQLite 容器
#   ./scripts/docker-sqlite.sh stop     - 停止 SQLite 容器
#   ./scripts/docker-sqlite.sh restart  - 重启 SQLite 容器
#   ./scripts/docker-sqlite.sh status   - 查看容器状态
#   ./scripts/docker-sqlite.sh logs     - 查看容器日志
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 容器配置
CONTAINER_NAME="eket-sqlite"
IMAGE_NAME="python:3.11-slim"

# 数据卷配置
DATA_DIR="$PROJECT_ROOT/.eket/data/sqlite"
mkdir -p "$DATA_DIR"

# SQLite 数据库文件
SQLITE_DB="$DATA_DIR/eket.db"

# 端口配置（可从配置文件读取）
PORT="${SQLITE_PORT:-8080}"

log() {
    local level="$1"
    local message="$2"
    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
        DEBUG) echo -e "${BLUE}[DEBUG]${NC} $message" ;;
    esac
}

# 检查 Docker 是否可用
check_docker() {
    if ! command -v docker &>/dev/null || ! docker info &>/dev/null; then
        log ERROR "Docker 不可用"
        return 1
    fi
    return 0
}

# 获取容器状态
get_container_status() {
    if docker ps -q --filter "name=$CONTAINER_NAME" &>/dev/null; then
        echo "running"
    elif docker ps -aq --filter "name=$CONTAINER_NAME" &>/dev/null; then
        echo "stopped"
    else
        echo "not_found"
    fi
}

# 创建 SQLite 初始化脚本
create_init_script() {
    local init_script="$DATA_DIR/init_db.py"

    cat > "$init_script" << 'PYTHON_SCRIPT'
#!/usr/bin/env python3
"""EKET SQLite 数据库初始化脚本"""

import sqlite3
import os
from datetime import datetime

DB_PATH = os.environ.get('SQLITE_DB_PATH', '/data/eket.db')

def init_database():
    """初始化数据库表结构"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Confluence 文件索引表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS confluence_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT UNIQUE NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER,
            content_hash TEXT,
            indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            metadata TEXT
        )
    ''')

    # Jira tickets 表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS jira_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            priority TEXT DEFAULT 'normal',
            labels TEXT,
            dependencies TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            content TEXT
        )
    ''')

    # Slaver 进程注册表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS slaver_processes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slaver_name TEXT UNIQUE NOT NULL,
            pid INTEGER NOT NULL,
            task_id TEXT,
            host TEXT NOT NULL,
            port INTEGER,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'active',
            metadata TEXT
        )
    ''')

    # Retrospective 记录表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS retrospectives (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sprint_id TEXT NOT NULL,
            ticket_id TEXT,
            category TEXT NOT NULL,
            content TEXT NOT NULL,
            vote_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT
        )
    ''')

    # 创建索引
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_confluence_files_name ON confluence_files(file_name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_jira_tickets_status ON jira_tickets(status)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_jira_tickets_id ON jira_tickets(ticket_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_slaver_processes_status ON slaver_processes(status)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_retrospectives_sprint ON retrospectives(sprint_id)')

    conn.commit()
    conn.close()
    print(f"数据库初始化完成：{DB_PATH}")

if __name__ == '__main__':
    init_database()
PYTHON_SCRIPT

    log INFO "初始化脚本已创建：$init_script"
}

# 创建容器启动配置
create_dockerfile() {
    local dockerfile="$DATA_DIR/Dockerfile"

    cat > "$dockerfile" << 'DOCKERFILE'
FROM python:3.11-slim

WORKDIR /app

# 安装 SQLite
RUN apt-get update && apt-get install -y \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# 创建数据目录
RUN mkdir -p /data

# 复制初始化脚本
COPY init_db.py /app/init_db.py

# 设置环境变量
ENV SQLITE_DB_PATH=/data/eket.db
ENV PORT=8080

# 暴露端口（用于未来的 HTTP API）
EXPOSE 8080

# 初始化数据库
RUN python /app/init_db.py

# 保持容器运行
CMD ["tail", "-f", "/dev/null"]
DOCKERFILE

    log INFO "Dockerfile 已创建：$dockerfile"
}

# 构建镜像
build_image() {
    local image_name="$1"

    log INFO "构建 Docker 镜像：$image_name"

    cd "$DATA_DIR"

    if docker build -t "$image_name" . &>/dev/null; then
        log INFO "镜像构建成功"
        return 0
    else
        log WARN "镜像构建失败，使用基础镜像"
        return 1
    fi
}

# 启动 SQLite 容器
start_container() {
    log INFO "启动 SQLite 容器..."

    local status=$(get_container_status)

    if [ "$status" = "running" ]; then
        log INFO "容器已在运行"
        return 0
    elif [ "$status" = "stopped" ]; then
        log INFO "启动已存在的容器..."
        docker start "$CONTAINER_NAME"
        log INFO "容器已启动"
        return 0
    fi

    # 创建配置文件
    create_init_script
    create_dockerfile

    # 尝试构建镜像
    if ! build_image "$CONTAINER_NAME"; then
        # 使用基础镜像，运行时初始化
        log INFO "使用基础镜像运行容器..."

        docker run -d \
            --name "$CONTAINER_NAME" \
            -v "$DATA_DIR:/data" \
            -p "$PORT:8080" \
            -e SQLITE_DB_PATH=/data/eket.db \
            -e PORT="$PORT" \
            --restart unless-stopped \
            "$IMAGE_NAME" \
            bash -c "apt-get update && apt-get install -y sqlite3 && python /data/init_db.py 2>/dev/null || true && tail -f /dev/null"
    fi

    # 等待容器启动
    sleep 2

    # 验证容器状态
    if docker ps --filter "name=$CONTAINER_NAME" --format "{{.Status}}" &>/dev/null; then
        log INFO "SQLite 容器启动成功"
        log INFO "  容器名称：$CONTAINER_NAME"
        log INFO "  数据目录：$DATA_DIR"
        log INFO "  数据库文件：$SQLITE_DB"
        log INFO "  暴露端口：$PORT"
        return 0
    else
        log ERROR "SQLite 容器启动失败"
        return 1
    fi
}

# 停止容器
stop_container() {
    log INFO "停止 SQLite 容器..."

    if docker stop "$CONTAINER_NAME" &>/dev/null; then
        log INFO "容器已停止"
        return 0
    else
        log WARN "容器未运行或停止失败"
        return 1
    fi
}

# 重启容器
restart_container() {
    log INFO "重启 SQLite 容器..."
    stop_container
    sleep 1
    start_container
}

# 查看容器状态
show_status() {
    echo "========================================"
    echo "EKET SQLite 容器状态"
    echo "========================================"
    echo ""

    local status=$(get_container_status)
    echo "容器名称：$CONTAINER_NAME"
    echo "状态：$status"
    echo ""

    if [ "$status" = "running" ]; then
        echo "容器信息:"
        docker inspect --format '
  容器 ID: {{.Id}}
  镜像：{{.Config.Image}}
  启动时间：{{.State.StartedAt}}
  运行时间：{{.State.Running}}
' "$CONTAINER_NAME" 2>/dev/null || echo "  无法获取详细信息"

        echo ""
        echo "端口映射:"
        docker port "$CONTAINER_NAME" 2>/dev/null || echo "  无端口映射"

        echo ""
        echo "数据卷:"
        docker inspect --format '{{range .Mounts}}  {{.Source}} -> {{.Destination}}{{end}}' "$CONTAINER_NAME" 2>/dev/null || echo "  无数据卷"
    fi

    echo ""
    echo "数据库文件:"
    if [ -f "$SQLITE_DB" ]; then
        local size=$(du -h "$SQLITE_DB" | cut -f1)
        echo "  路径：$SQLITE_DB"
        echo "  大小：$size"
    else
        echo "  数据库文件不存在"
    fi

    echo ""
}

# 查看日志
show_logs() {
    local lines="${2:-50}"

    if [ "$(get_container_status)" != "running" ]; then
        log ERROR "容器未运行"
        return 1
    fi

    docker logs --tail "$lines" "$CONTAINER_NAME"
}

# 删除容器
remove_container() {
    log WARN "删除 SQLite 容器..."

    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true

    log INFO "容器已删除"
    log WARN "数据文件保留在：$DATA_DIR"
}

# 导出配置
export_config() {
    local config_file="$PROJECT_ROOT/.eket/config/docker-sqlite.yml"
    mkdir -p "$(dirname "$config_file")"

    cat > "$config_file" << EOF
# EKET Docker SQLite 配置
# 自动生成于 $(date -Iseconds)

sqlite:
  container_name: $CONTAINER_NAME
  port: $PORT
  data_dir: $DATA_DIR
  database: $SQLITE_DB
  status: $(get_container_status)
EOF

    log INFO "配置已导出：$config_file"
}

# 主函数
main() {
    case "${1:-}" in
        start)
            check_docker || exit 1
            start_container
            export_config
            ;;
        stop)
            check_docker || exit 1
            stop_container
            ;;
        restart)
            check_docker || exit 1
            restart_container
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs "$@"
            ;;
        remove)
            check_docker || exit 1
            remove_container
            ;;
        export)
            export_config
            ;;
        --help|-h)
            echo "用法：$0 {start|stop|restart|status|logs|remove|export}"
            echo ""
            echo "命令:"
            echo "  start   - 启动 SQLite 容器"
            echo "  stop    - 停止 SQLite 容器"
            echo "  restart - 重启 SQLite 容器"
            echo "  status  - 查看容器状态"
            echo "  logs    - 查看容器日志"
            echo "  remove  - 删除容器（保留数据）"
            echo "  export  - 导出配置到文件"
            ;;
        *)
            echo "用法：$0 {start|stop|restart|status|logs|remove|export}"
            exit 1
            ;;
    esac
}

main "$@"
