#!/usr/bin/env python3
"""
Example: Complete Workflow

This example demonstrates a complete workflow from registration to PR merge.
"""

import time
from eket_sdk import (
    EketClient,
    AgentType,
    AgentRole,
    AgentSpecialty,
    AgentStatus,
    TaskStatus,
    MessageType,
)
from eket_sdk.models import TestStatus


def main():
    # Initialize client
    print("🚀 Starting EKET Complete Workflow Example\n")
    client = EketClient(server_url="http://localhost:8080")

    # Step 1: Register agent
    print("📝 Step 1: Register Agent")
    agent = client.register_agent(
        agent_type=AgentType.CUSTOM,
        role=AgentRole.SLAVER,
        specialty=AgentSpecialty.FULLSTACK,
        capabilities=["python", "react", "typescript", "postgresql"],
        metadata={"user": "demo_user", "machine": "demo-workstation"},
    )
    print(f"   ✅ Registered as {agent.instance_id}\n")

    # Step 2: Send initial heartbeat
    print("💓 Step 2: Send Initial Heartbeat")
    heartbeat_response = client.send_heartbeat(status=AgentStatus.IDLE)
    print(f"   ✅ Heartbeat acknowledged at {heartbeat_response.get('server_time')}\n")

    # Step 3: List available tasks
    print("📋 Step 3: List Available Tasks")
    tasks = client.list_tasks(status=TaskStatus.READY)
    if not tasks:
        print("   ⚠️  No tasks available")
        client.deregister_agent()
        return

    print(f"   Found {len(tasks)} available task(s):")
    for task in tasks[:3]:
        print(
            f"   - {task.id}: {task.title} [{task.priority.value}] ({task.estimate or 'no estimate'})"
        )
    print()

    # Step 4: Claim a task
    selected_task = tasks[0]
    print(f"🎯 Step 4: Claim Task {selected_task.id}")
    claimed_task = client.claim_task(selected_task.id)
    print(f"   ✅ Task claimed successfully")
    print(f"   Status: {claimed_task.status.value}")
    print(f"   Assigned to: {claimed_task.assigned_to}\n")

    # Step 5: Work on task with progress updates
    print(f"💼 Step 5: Work on Task (simulated)")
    for progress in [0.25, 0.5, 0.75, 1.0]:
        time.sleep(1)  # Simulate work

        # Send heartbeat
        client.send_heartbeat(
            status=AgentStatus.BUSY, current_task=claimed_task.id, progress=progress
        )

        # Update task
        client.update_task(claimed_task.id, progress=progress)
        print(f"   Progress: {int(progress * 100)}%")

    print()

    # Step 6: Update task to review status
    print(f"✅ Step 6: Mark Task as Complete")
    completed_task = client.update_task(
        claimed_task.id,
        status=TaskStatus.REVIEW,
        progress=1.0,
        notes="Implementation completed, ready for review",
    )
    print(f"   Task status: {completed_task.status.value}\n")

    # Step 7: Submit PR
    print(f"📤 Step 7: Submit Pull Request")
    branch = f"feature/{claimed_task.id}-implementation"
    pr_id = client.submit_pr(
        instance_id=agent.instance_id,
        task_id=claimed_task.id,
        branch=branch,
        description=f"""
## Summary
Completed implementation for {claimed_task.title}

## Changes
- Implemented core functionality
- Added unit tests
- Updated documentation

## Test Results
- All tests passing
- Coverage: 85%
        """,
        test_status=TestStatus.PASSED,
    )
    print(f"   ✅ PR submitted: {pr_id}")
    print(f"   Branch: {branch}\n")

    # Step 8: Send PR review request to master
    print(f"📨 Step 8: Send Review Request to Master")
    masters = client.list_agents(role=AgentRole.MASTER)
    if masters:
        master_id = masters[0].instance_id
        message_id = client.send_message(
            from_id=agent.instance_id,
            to_id=master_id,
            msg_type=MessageType.PR_REVIEW_REQUEST,
            payload={
                "task_id": claimed_task.id,
                "branch": branch,
                "pr_id": pr_id,
                "description": completed_task.title,
                "test_status": "passed",
            },
        )
        print(f"   ✅ Review request sent to {master_id}")
        print(f"   Message ID: {message_id}\n")
    else:
        print("   ⚠️  No master agents available\n")

    # Step 9: Check for messages
    print(f"📬 Step 9: Check for Messages")
    messages = client.get_messages()
    if messages:
        print(f"   Received {len(messages)} message(s):")
        for msg in messages:
            print(f"   - {msg.type.value} from {msg.from_id}")
    else:
        print("   No new messages\n")

    # Step 10: Final heartbeat and deregister
    print(f"👋 Step 10: Cleanup")
    client.send_heartbeat(status=AgentStatus.IDLE)
    client.deregister_agent()
    print(f"   ✅ Agent deregistered\n")

    print("✨ Workflow completed successfully!")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⏹️  Interrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback

        traceback.print_exc()
