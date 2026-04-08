#!/usr/bin/env python3
"""
EKET Slaver Agent - End-to-End Demo

Slaver Agent 负责：
- 查询并领取任务
- 执行开发工作（模拟）
- 提交 PR
- 发送 Review 请求
"""

import time
import sys
import signal
from datetime import datetime
from typing import Optional
import os

# 添加 SDK 路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../sdk/python'))

from eket_sdk import EketClient
from eket_sdk.models import (
    AgentType,
    AgentRole,
    AgentSpecialty,
    AgentStatus,
    TaskStatus,
    MessageType,
    MessagePriority,
    TestStatus,
)
from eket_sdk.exceptions import EketError, ConflictError, NotFoundError

# ============================================================================
# 配置
# ============================================================================

CONFIG = {
    'server_url': os.getenv('EKET_SERVER_URL', 'http://localhost:8080'),
    'heartbeat_interval': 30,  # 秒
    'work_delay': 3,  # 模拟工作延迟（秒）
}

# ============================================================================
# 工具函数
# ============================================================================

def log(emoji: str, message: str) -> None:
    """打印带时间戳的日志"""
    timestamp = datetime.now().strftime('%H:%M:%S')
    print(f"[{timestamp}] [Slaver] {emoji} {message}")


def sleep(seconds: float) -> None:
    """睡眠指定秒数"""
    time.sleep(seconds)


# ============================================================================
# Slaver Agent 类
# ============================================================================

class SlaverAgent:
    """Slaver Agent 实现"""

    def __init__(self):
        self.client = EketClient(
            server_url=CONFIG['server_url'],
            timeout=30,
        )
        self.instance_id: Optional[str] = None
        self.running = True

    def start(self) -> None:
        """启动 Slaver Agent"""
        try:
            log('🚀', 'Starting Slaver Agent...')

            # 1. 注册为 Slaver
            self.register()

            # 2. 查询可用任务
            tasks = self.find_tasks()

            if not tasks:
                log('⚠️', 'No available tasks found')
                return

            # 3. 领取任务
            task = self.claim_task(tasks[0])

            # 4. 执行开发工作
            self.work_on_task(task)

            # 5. 提交 PR
            self.submit_pr(task)

            # 6. 注销
            self.shutdown()

        except KeyboardInterrupt:
            log('⚠️', 'Interrupted by user')
            self.shutdown()
        except Exception as error:
            log('❌', f'Error: {error}')
            self.shutdown()
            sys.exit(1)

    def register(self) -> None:
        """注册为 Slaver"""
        agent = self.client.register_agent(
            agent_type=AgentType.CUSTOM,
            role=AgentRole.SLAVER,
            specialty=AgentSpecialty.BACKEND,
            capabilities=['python', 'fastapi', 'postgresql', 'redis'],
            metadata={
                'user': 'demo',
                'machine': 'localhost',
                'timezone': 'Asia/Shanghai',
            },
            agent_version='1.0.0',
        )

        self.instance_id = agent.instance_id
        log('✅', f'Registered as {self.instance_id}')

    def find_tasks(self) -> list:
        """查询可用任务"""
        log('📋', 'Querying available tasks...')

        tasks = self.client.list_tasks(status=TaskStatus.READY)

        if tasks:
            for task in tasks:
                log('🎯', f'Found task: {task.id} - {task.title}')

        return tasks

    def claim_task(self, task) -> object:
        """领取任务"""
        try:
            claimed_task = self.client.claim_task(
                task_id=task.id,
                instance_id=self.instance_id,
            )

            log('✅', f'Claimed task {task.id}')
            return claimed_task

        except ConflictError:
            log('⚠️', f'Task {task.id} already claimed by another agent')
            raise
        except NotFoundError:
            log('⚠️', f'Task {task.id} not found')
            raise

    def work_on_task(self, task) -> None:
        """执行开发工作（模拟）"""
        work_stages = [
            (0.25, 'Implemented login API endpoint'),
            (0.50, 'Added database models and migrations'),
            (0.75, 'Completed unit tests'),
            (1.00, 'All tests passing, ready for review'),
        ]

        for progress, note in work_stages:
            sleep(CONFIG['work_delay'])

            log('💼', f'Working on task... (Progress: {int(progress * 100)}%)')

            # 发送心跳
            self.client.send_heartbeat(
                instance_id=self.instance_id,
                status=AgentStatus.ACTIVE,
                current_task=task.id,
                progress=progress,
            )

            log('💓', f'Heartbeat sent: {note}')

            # 更新任务进度
            self.client.update_task(
                task_id=task.id,
                status=TaskStatus.IN_PROGRESS,
                progress=progress,
                notes=note,
            )

    def submit_pr(self, task) -> None:
        """提交 PR"""
        log('📤', f'Submitting PR for {task.id}')

        # 提交 PR
        pr_id = self.client.submit_pr(
            instance_id=self.instance_id,
            task_id=task.id,
            branch=f'feature/{task.id}-user-login',
            description='''
Implemented user login feature:

## Changes
- Added /api/auth/login endpoint
- Implemented JWT token generation
- Added user authentication logic
- Created database models for users

## Testing
- Added unit tests for authentication logic
- Added integration tests for login endpoint
- All tests passing with 100% coverage

## Notes
- Password hashing using bcrypt
- JWT tokens expire after 24 hours
- Added rate limiting on login endpoint
            '''.strip(),
            test_status=TestStatus.PASSED,
        )

        log('✅', f'PR submitted: {pr_id}')

        # 更新任务状态为 review
        self.client.update_task(
            task_id=task.id,
            status=TaskStatus.REVIEW,
            progress=1.0,
            notes='PR submitted, awaiting review',
        )

        # 发送 Review 请求消息给 Master
        log('📨', 'Sending review request to Master')

        message_id = self.client.send_message(
            from_id=self.instance_id,
            to_id='master',  # 发送给所有 Master (服务器会路由)
            msg_type=MessageType.PR_REVIEW_REQUEST,
            payload={
                'task_id': task.id,
                'pr_id': pr_id,
                'branch': f'feature/{task.id}-user-login',
                'description': 'User login feature implementation',
                'test_status': 'passed',
                'test_coverage': 1.0,
                'files_changed': 12,
                'insertions': 450,
                'deletions': 23,
            },
            priority=MessagePriority.HIGH,
            ttl=3600,
        )

        log('✅', f'Review request sent (message: {message_id})')
        log('🎉', f'Task {task.id} completed!')

    def shutdown(self) -> None:
        """关闭 Slaver Agent"""
        log('👋', 'Deregistering...')

        if self.instance_id:
            try:
                self.client.deregister_agent(self.instance_id)
                log('✅', 'Deregistered successfully')
            except Exception as error:
                log('⚠️', f'Deregistration failed: {error}')

        self.client.close()
        log('✅', 'Slaver Agent stopped')


# ============================================================================
# 主程序
# ============================================================================

def main():
    """主函数"""
    print('=== EKET Slaver Agent Demo ===\n')

    slaver = SlaverAgent()

    # 处理退出信号
    def signal_handler(signum, frame):
        print('\n')
        slaver.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    slaver.start()


if __name__ == '__main__':
    main()
