# EKET Python SDK - Quick Start Guide

**Get started with EKET Python SDK in 5 minutes!**

## Prerequisites

- Python 3.8 or higher
- EKET server running (default: http://localhost:8080)

## Installation

### Option 1: Development Mode (Recommended)

```bash
cd sdk/python
pip install -e .
```

### Option 2: With Development Tools

```bash
cd sdk/python
pip install -e ".[dev]"
```

### Option 3: From requirements.txt

```bash
pip install -r requirements.txt
```

## Verify Installation

```bash
python verify_install.py
```

Expected output:
```
============================================================
EKET SDK Installation Verification
============================================================
✅ eket_sdk imported successfully
   Version: 1.0.0
   Protocol: 1.0.0

📦 Checking Dependencies:
   ✅ requests: HTTP client library

📋 Checking Models:
   ✅ All models imported successfully

🔧 Checking Client:
   ✅ EketClient instantiated successfully
   Server URL: http://localhost:8080
   Protocol: 1.0.0

============================================================
✅ All checks passed!
```

## Your First Agent

### 1. Start EKET Server

```bash
# In EKET project root
cd node
npm run build
node dist/index.js gateway:start --port 8080
```

### 2. Register an Agent

Create `my_agent.py`:

```python
from eket_sdk import EketClient, AgentType, AgentRole, AgentSpecialty

# Initialize client
client = EketClient(server_url="http://localhost:8080")

# Register agent
agent = client.register_agent(
    agent_type=AgentType.CUSTOM,
    role=AgentRole.SLAVER,
    specialty=AgentSpecialty.BACKEND,
    capabilities=["python", "fastapi", "postgresql"],
)

print(f"✅ Registered as {agent.instance_id}")

# Check server health
health = client.health_check()
print(f"Server status: {health['status']}")

# Send heartbeat
response = client.send_heartbeat()
print(f"Heartbeat acknowledged at {response['server_time']}")

# Cleanup
client.deregister_agent()
print("👋 Agent deregistered")
```

Run it:
```bash
python my_agent.py
```

## Run Examples

### Example 1: Register Agent

```bash
python examples/register_agent.py
```

### Example 2: Claim Task

```bash
python examples/claim_task.py
```

### Example 3: Submit PR

```bash
python examples/submit_pr.py
```

### Example 4: Complete Workflow

```bash
python examples/complete_workflow.py
```

## Basic Workflows

### Work on a Task

```python
from eket_sdk import EketClient, TaskStatus

client = EketClient(server_url="http://localhost:8080")

# Register
agent = client.register_agent(...)

# List available tasks
tasks = client.list_tasks(status=TaskStatus.READY)
print(f"Found {len(tasks)} available tasks")

# Claim task
task = client.claim_task(tasks[0].id)
print(f"Claimed: {task.title}")

# Update progress
client.update_task(task.id, progress=0.5)
print("Progress: 50%")

# Mark as complete
client.update_task(
    task.id,
    status=TaskStatus.REVIEW,
    progress=1.0,
    notes="Implementation completed"
)
```

### Submit a Pull Request

```python
from eket_sdk import MessageType, TestStatus

# Submit PR
pr_id = client.submit_pr(
    instance_id=agent.instance_id,
    task_id="FEAT-001",
    branch="feature/FEAT-001-user-auth",
    description="Implemented user authentication",
    test_status=TestStatus.PASSED,
)

# Notify master
masters = client.list_agents(role=AgentRole.MASTER)
if masters:
    client.send_message(
        from_id=agent.instance_id,
        to_id=masters[0].instance_id,
        msg_type=MessageType.PR_REVIEW_REQUEST,
        payload={"task_id": "FEAT-001", "pr_id": pr_id},
    )
```

### Auto Heartbeat

```python
import threading
import time

def heartbeat_worker(client):
    while True:
        client.send_heartbeat()
        time.sleep(60)

# Start background heartbeat
thread = threading.Thread(target=heartbeat_worker, args=(client,), daemon=True)
thread.start()

# Do your work...
```

## Error Handling

```python
from eket_sdk import (
    EketError,
    ConflictError,
    NotFoundError,
    ValidationError,
)

try:
    task = client.claim_task("FEAT-001")
except ConflictError as e:
    print(f"Task already claimed by: {e.details.get('assigned_to')}")
except NotFoundError:
    print("Task not found")
except ValidationError as e:
    print(f"Invalid request: {e.message}")
except EketError as e:
    print(f"Error {e.code}: {e.message}")
```

## Development

### Run Tests

```bash
make test
# or
pytest -v
```

### Code Formatting

```bash
make format
# or
black eket_sdk/ tests/ examples/
```

### Linting

```bash
make lint
# or
flake8 eket_sdk/ tests/ examples/
```

### Type Checking

```bash
make type-check
# or
mypy eket_sdk/
```

## Next Steps

1. **Read the full documentation**: [README.md](README.md)
2. **Explore examples**: Check `examples/` directory
3. **Run tests**: `make test`
4. **Check API reference**: See README for complete API docs
5. **Join the community**: GitHub issues, Discord, etc.

## Common Issues

### Import Error

```
ImportError: No module named 'eket_sdk'
```

**Solution**: Install the package
```bash
pip install -e .
```

### Connection Error

```
ConnectionError: Failed to connect to http://localhost:8080
```

**Solution**: Make sure EKET server is running
```bash
cd node
node dist/index.js gateway:start --port 8080
```

### Authentication Error

```
AuthenticationError: Invalid token
```

**Solution**: Re-register your agent to get a new token

## Getting Help

- **Documentation**: [README.md](README.md)
- **Examples**: [examples/](examples/)
- **Issues**: GitHub Issues
- **Protocol Spec**: [EKET_PROTOCOL_V1.md](../../docs/protocol/EKET_PROTOCOL_V1.md)

## Summary

You've learned how to:
- ✅ Install EKET Python SDK
- ✅ Register an agent
- ✅ Work with tasks
- ✅ Submit pull requests
- ✅ Handle errors
- ✅ Run tests

**Happy coding with EKET! 🚀**

---

For more information, see:
- [README.md](README.md) - Full documentation
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contributing guidelines
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Project overview
