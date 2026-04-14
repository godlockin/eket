#!/usr/bin/env python3
"""
Example: Claim and Work on a Task

This example shows how to claim a task and update its progress.
"""

import time
from eket_sdk import EketClient, AgentType, AgentRole, AgentStatus, TaskStatus

# Initialize and register
client = EketClient(server_url="http://localhost:8080")
agent = client.register_agent(
    agent_type=AgentType.CUSTOM,
    role=AgentRole.SLAVER,
    specialty=None,
)

print(f"✅ Registered as {agent.instance_id}")

# List available tasks
print("\n📋 Available Tasks:")
tasks = client.list_tasks(status=TaskStatus.READY)

if not tasks:
    print("   No tasks available at the moment.")
    client.close()
    exit(0)

for task in tasks:
    print(
        f"   - {task.id}: {task.title} [{task.priority.value}] ({task.estimate or 'no estimate'})"
    )

# Claim first task
task = tasks[0]
print(f"\n🎯 Claiming task: {task.id}")

try:
    claimed_task = client.claim_task(task.id)
    print("   ✅ Task claimed successfully!")
    print(f"   Status: {claimed_task.status.value}")
    print(f"   Assigned to: {claimed_task.assigned_to}")
except Exception as e:
    print(f"   ❌ Failed to claim task: {e}")
    client.close()
    exit(1)

# Simulate work with progress updates
print("\n💼 Working on task...")

for progress in [0.25, 0.5, 0.75, 1.0]:
    time.sleep(1)  # Simulate work

    # Send heartbeat with progress
    heartbeat = client.send_heartbeat(
        status=AgentStatus.BUSY, current_task=claimed_task.id, progress=progress
    )

    # Update task progress
    updated_task = client.update_task(claimed_task.id, progress=progress)

    print(f"   Progress: {int(progress * 100)}%")

    # Check for messages
    messages = heartbeat.get("messages", [])
    if messages:
        print(f"   📨 Received {len(messages)} message(s)")

# Mark task as complete
print("\n✅ Task completed! Updating status...")
completed_task = client.update_task(
    claimed_task.id,
    status=TaskStatus.REVIEW,
    progress=1.0,
    notes="Implementation completed, ready for review",
)

print(f"   Task status: {completed_task.status.value}")
print(f"   Updated at: {completed_task.updated_at}")

# Clean up
client.deregister_agent()
print("\n👋 Agent deregistered")

client.close()
