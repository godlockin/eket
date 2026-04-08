#!/usr/bin/env python3
"""
EKET Slaver Agent - E2E Collaboration Demo

This Slaver Agent demonstrates:
- Agent registration
- Task discovery and claiming
- Progress updates via heartbeat
- PR submission
- Communication with Master via messages
"""

import os
import sys
import time
import signal
from typing import Optional

# Add parent directory to path to import eket_sdk
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../sdk/python'))

from eket_sdk import EketClient, TaskStatus

SERVER_URL = os.getenv('EKET_SERVER_URL', 'http://localhost:8080')
TASK_ID = 'FEAT-001'


class SlaverAgent:
    """Slaver Agent for E2E Collaboration Demo"""

    def __init__(self):
        self.client: Optional[EketClient] = None
        self.instance_id: Optional[str] = None
        self.running = True

    async def run(self):
        """Main execution flow"""
        print('=== EKET Slaver Agent Demo ===\n')

        try:
            # 1. Register as Slaver
            print('🚀 Starting Slaver Agent...')
            print(f'📝 Connecting to {SERVER_URL}...')

            self.client = EketClient(server_url=SERVER_URL)
            agent = await self.client.register_agent(
                agent_type='claude_code',
                role='slaver',
                capabilities=['backend', 'api_development', 'testing'],
                specialty='backend',
                metadata={
                    'demo': 'e2e-collaboration',
                    'language': 'python',
                },
            )

            self.instance_id = agent.instance_id
            print(f'✅ Registered as {self.instance_id}')
            print(f'   Token: {self.client.token[:20]}...')

            # 2. Query available tasks
            print('\n📋 Querying available tasks...')
            tasks = await self.client.list_tasks(status=TaskStatus.READY)

            if not tasks:
                print('⚠️  No available tasks found')
                print('   (Make sure Master has created task FEAT-001)')
                return

            # Find our target task
            target_task = None
            for task in tasks:
                if task.task_id == TASK_ID:
                    target_task = task
                    break

            if not target_task:
                print(f'⚠️  Task {TASK_ID} not found')
                print(f'   Available tasks: {[t.task_id for t in tasks]}')
                return

            print(f'✅ Found task: {target_task.task_id}')
            print(f'   Description: {target_task.description}')
            print(f'   Status: {target_task.status}')

            # 3. Claim the task
            print(f'\n🎯 Claiming task {TASK_ID}...')
            claimed_task = await self.client.claim_task(TASK_ID, self.instance_id)
            print(f'✅ Task claimed successfully')

            # 4. Work on the task (simulated)
            print('\n💼 Working on task...')
            await self.simulate_work()

            # 5. Submit PR
            print('\n📤 Submitting PR...')
            pr_id = await self.client.submit_pr(
                instance_id=self.instance_id,
                task_id=TASK_ID,
                branch='feature/FEAT-001-user-login',
                description='Implement user login API endpoint\n\n- Add POST /api/auth/login\n- JWT token generation\n- Password validation\n- Rate limiting',
                changes=[
                    'src/api/auth.py',
                    'src/models/user.py',
                    'tests/test_auth.py',
                ],
            )

            print(f'✅ PR submitted: {pr_id}')

            # 6. Send review request to Master
            print('\n📨 Sending review request to Master...')
            # Get Master instance from agent list
            agents = await self.client.list_agents(role='master')
            if agents:
                master_id = agents[0].instance_id
                await self.client.send_message(
                    from_id=self.instance_id,
                    to_id=master_id,
                    msg_type='pr_review_request',
                    payload={
                        'pr_id': pr_id,
                        'task_id': TASK_ID,
                        'branch': 'feature/FEAT-001-user-login',
                        'description': 'Please review my PR for user login',
                    },
                )
                print(f'✅ Review request sent to {master_id}')
            else:
                print('⚠️  No Master agent found')

            # 7. Wait for review (in real scenario, would listen for messages)
            print('\n⏳ Waiting for PR review...')
            print('   (In real scenario, would receive WebSocket notification)')

            # Keep alive for demo
            print('\n✅ Task completed!')
            print('   Press Ctrl+C to exit\n')

            # Wait for signal
            signal.signal(signal.SIGINT, self.handle_shutdown)
            while self.running:
                await asyncio.sleep(1)

        except Exception as error:
            print(f'\n❌ Error: {error}')
            import traceback
            traceback.print_exc()

        finally:
            await self.cleanup()

    async def simulate_work(self):
        """Simulate development work with progress updates"""
        progress_steps = [0.25, 0.50, 0.75, 1.00]

        for progress in progress_steps:
            print(f'   Progress: {int(progress * 100)}%')

            # Send heartbeat with progress
            await self.client.send_heartbeat(
                self.instance_id,
                status='active',
                current_task=TASK_ID,
                progress=progress,
            )

            print(f'   💓 Heartbeat sent (progress: {progress:.0%})')

            # Simulate work
            await asyncio.sleep(2)

        print('   ✅ Work completed!')

    async def cleanup(self):
        """Cleanup resources"""
        if self.client and self.instance_id:
            try:
                print('\n👋 Deregistering agent...')
                await self.client.deregister_agent(self.instance_id)
                print('✅ Deregistered successfully')
            except Exception as error:
                print(f'❌ Deregistration failed: {error}')

    def handle_shutdown(self, signum, frame):
        """Handle shutdown signal"""
        print('\n\n🛑 Shutdown signal received...')
        self.running = False


async def main():
    """Entry point"""
    agent = SlaverAgent()
    await agent.run()


if __name__ == '__main__':
    import asyncio
    asyncio.run(main())
