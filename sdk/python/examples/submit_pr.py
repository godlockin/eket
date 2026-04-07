#!/usr/bin/env python3
"""
Example: Submit a Pull Request

This example shows how to submit a PR and send a review request message.
"""

from eket_sdk import EketClient, AgentType, AgentRole, MessageType, TestStatus

# Initialize and register
client = EketClient(server_url="http://localhost:8080")
agent = client.register_agent(
    agent_type=AgentType.CUSTOM,
    role=AgentRole.SLAVER,
)

print(f"✅ Registered as {agent.instance_id}")

# Assume we've completed a task
TASK_ID = "FEAT-001"  # Replace with actual task ID
BRANCH = f"feature/{TASK_ID}-user-authentication"

print(f"\n📤 Submitting PR for task {TASK_ID}...")

# Submit PR
pr_id = client.submit_pr(
    instance_id=agent.instance_id,
    task_id=TASK_ID,
    branch=BRANCH,
    description="""
## Summary
Implemented user authentication with JWT tokens.

## Changes
- Added login/logout endpoints
- Implemented JWT token generation and validation
- Added password hashing with bcrypt
- Created user session management

## Test Results
- Unit tests: 42/42 passed
- Integration tests: 15/15 passed
- Coverage: 87%

## Checklist
- [x] Code follows style guidelines
- [x] Tests added and passing
- [x] Documentation updated
- [x] No breaking changes
    """,
    test_status=TestStatus.PASSED,
)

print(f"   ✅ PR submitted: {pr_id}")

# Send review request message to master
print(f"\n📨 Sending review request to master...")

# Find master agent
masters = client.list_agents(role=AgentRole.MASTER)
if not masters:
    print("   ⚠️  No master agents available")
else:
    master_id = masters[0].instance_id
    print(f"   Sending to: {master_id}")

    message_id = client.send_message(
        from_id=agent.instance_id,
        to_id=master_id,
        msg_type=MessageType.PR_REVIEW_REQUEST,
        payload={
            "task_id": TASK_ID,
            "branch": BRANCH,
            "pr_id": pr_id,
            "description": "User authentication feature ready for review",
            "test_status": "passed",
            "test_coverage": 0.87,
            "files_changed": 12,
            "insertions": 450,
            "deletions": 23,
        },
    )

    print(f"   ✅ Message sent: {message_id}")

print(f"\n✅ PR submission complete!")
print(f"   Task: {TASK_ID}")
print(f"   Branch: {BRANCH}")
print(f"   Status: Awaiting review")

# Clean up
client.close()
