"""
EKET Slaver Agent 配置
"""

import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# EKET Server URL
SERVER_URL = os.getenv('EKET_SERVER_URL', 'http://localhost:8080')

# Agent 配置
AGENT_TYPE = 'custom'
AGENT_ROLE = 'slaver'
AGENT_SPECIALTY = 'backend'
AGENT_CAPABILITIES = ['python', 'fastapi', 'postgresql', 'redis']
AGENT_VERSION = '1.0.0'

# 心跳间隔（秒）
HEARTBEAT_INTERVAL = 30

# 模拟工作延迟（秒）
WORK_DELAY = 3

# 日志级别
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

# 超时设置（秒）
REQUEST_TIMEOUT = 30
