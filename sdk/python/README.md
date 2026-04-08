# EKET SDK for Python

[![Python Version](https://img.shields.io/badge/python-3.8%2B-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Protocol Version](https://img.shields.io/badge/protocol-v1.0.0-orange.svg)](https://eket.dev/protocol)

Python client library for [EKET Agent Collaboration Protocol v1.0.0](../../docs/protocol/EKET_PROTOCOL_V1.md).

EKET SDK simplifies AI agent integration with EKET framework, enabling heterogeneous AI tools (Claude Code, OpenCLAW, Cursor, etc.) to collaborate on software development projects.

## Features

- ✅ **Complete Protocol Support**: Full implementation of EKET Protocol v1.0.0
- 🔐 **JWT Authentication**: Automatic token management
- 🔄 **Auto Retry**: Built-in exponential backoff for network errors
- 📝 **Type Hints**: Full type annotation support
- 🧪 **Well Tested**: Comprehensive unit tests
- 📚 **Rich Documentation**: Detailed docstrings and examples
- 🎯 **Simple API**: Pythonic and intuitive interface

## Installation

### From PyPI (future)

```bash
pip install eket-sdk
```

### From Source

```bash
cd sdk/python
pip install -e .
```

### Development Installation

```bash
pip install -e ".[dev]"
```

## Quick Start

### 1. Register an Agent

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

print(f"Registered as {agent.instance_id}")
```

### 2. Claim and Work on a Task

```python
from eket_sdk import TaskStatus

# List available tasks
tasks = client.list_tasks(status=TaskStatus.READY)

# Claim first task
task = client.claim_task(tasks[0].id)
print(f"Claimed task: {task.id}")

# Update progress
client.update_task(
    task.id,
    status=TaskStatus.REVIEW,
    progress=1.0,
    notes="Implementation completed"
)
```

### 3. Submit a Pull Request

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

# Send review request to master
masters = client.list_agents(role=AgentRole.MASTER)
client.send_message(
    from_id=agent.instance_id,
    to_id=masters[0].instance_id,
    msg_type=MessageType.PR_REVIEW_REQUEST,
    payload={"task_id": "FEAT-001", "pr_id": pr_id},
)
```

### 4. Context Manager

```python
# Automatic cleanup with context manager
with EketClient(server_url="http://localhost:8080") as client:
    agent = client.register_agent(
        agent_type=AgentType.CUSTOM,
        role=AgentRole.SLAVER,
    )
    # ... work ...
    client.deregister_agent()
# Session automatically closed
```

## API Reference

### EketClient

Main client class for interacting with EKET servers.

#### Agent Management

```python
# Register agent
agent = client.register_agent(
    agent_type: AgentType,
    role: AgentRole,
    specialty: Optional[AgentSpecialty] = None,
    capabilities: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Agent

# Deregister agent
client.deregister_agent(instance_id: Optional[str] = None) -> bool

# Send heartbeat
response = client.send_heartbeat(
    instance_id: Optional[str] = None,
    status: AgentStatus = AgentStatus.ACTIVE,
    current_task: Optional[str] = None,
    progress: Optional[float] = None,
) -> Dict[str, Any]

# Get agent details
agent = client.get_agent(instance_id: Optional[str] = None) -> Agent

# List agents
agents = client.list_agents(
    role: Optional[AgentRole] = None,
    status: Optional[AgentStatus] = None,
) -> List[Agent]
```

#### Task Management

```python
# List tasks
tasks = client.list_tasks(
    status: Optional[TaskStatus] = None,
    assigned_to: Optional[str] = None,
    tags: Optional[List[str]] = None,
) -> List[Task]

# Get task details
task = client.get_task(task_id: str) -> Task

# Claim task
task = client.claim_task(
    task_id: str,
    instance_id: Optional[str] = None,
) -> Task

# Update task
task = client.update_task(
    task_id: str,
    status: Optional[TaskStatus] = None,
    progress: Optional[float] = None,
    notes: Optional[str] = None,
) -> Task
```

#### Messaging

```python
# Send message
message_id = client.send_message(
    from_id: str,
    to_id: str,
    msg_type: MessageType,
    payload: Dict[str, Any],
    priority: MessagePriority = MessagePriority.NORMAL,
    correlation_id: Optional[str] = None,
    ttl: Optional[int] = None,
) -> str

# Get messages
messages = client.get_messages(
    instance_id: Optional[str] = None,
    since: Optional[int] = None,
    limit: int = 50,
) -> List[Message]
```

#### Pull Request Workflow

```python
# Submit PR
pr_id = client.submit_pr(
    instance_id: str,
    task_id: str,
    branch: str,
    description: str,
    test_status: TestStatus = TestStatus.PASSED,
) -> str

# Review PR
pr = client.review_pr(
    task_id: str,
    reviewer: str,
    status: str,  # "approved" | "changes_requested" | "rejected"
    comments: Optional[List[Dict[str, Any]]] = None,
    summary: Optional[str] = None,
) -> Dict[str, Any]

# Merge PR
result = client.merge_pr(
    task_id: str,
    merger: str,
    target_branch: str = "main",
    squash: bool = False,
) -> Dict[str, Any]
```

### Data Models

#### Enums

```python
AgentType: CLAUDE_CODE | OPENCLAW | CURSOR | WINDSURF | GEMINI | CUSTOM
AgentRole: MASTER | SLAVER
AgentSpecialty: FRONTEND | BACKEND | FULLSTACK | QA | DEVOPS | DESIGNER | GENERAL
AgentStatus: ACTIVE | IDLE | BUSY | STALE
TaskType: FEATURE | BUGFIX | TASK | TEST | DOC | REFACTOR
TaskPriority: P0 | P1 | P2 | P3
TaskStatus: BACKLOG | READY | IN_PROGRESS | REVIEW | DONE
MessageType: PR_REVIEW_REQUEST | TASK_CLAIMED | HELP_REQUEST | STATUS_UPDATE | ...
MessagePriority: LOW | NORMAL | HIGH | CRITICAL
PRStatus: PENDING_REVIEW | APPROVED | CHANGES_REQUESTED | REJECTED | MERGED
TestStatus: PASSED | FAILED | SKIPPED
```

#### Classes

```python
@dataclass
class Agent:
    instance_id: str
    agent_type: AgentType
    role: AgentRole
    status: AgentStatus
    specialty: Optional[AgentSpecialty]
    registered_at: Optional[str]
    last_heartbeat: Optional[str]
    current_task: Optional[str]
    capabilities: List[str]
    metadata: Dict[str, Any]

@dataclass
class Task:
    id: str
    title: str
    type: TaskType
    priority: TaskPriority
    status: TaskStatus
    assigned_to: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]
    description: Optional[str]
    acceptance_criteria: List[AcceptanceCriterion]
    tags: List[str]
    estimate: Optional[str]
    progress: float

@dataclass
class Message:
    from_id: str
    to_id: str
    type: MessageType
    payload: Dict[str, Any]
    timestamp: str
    id: Optional[str]
    priority: MessagePriority
    correlation_id: Optional[str]
    ttl: Optional[int]

@dataclass
class PR:
    task_id: str
    instance_id: str
    branch: str
    description: str
    status: PRStatus
    test_status: Optional[TestStatus]
    # ... additional fields
```

## Error Handling

The SDK provides typed exceptions for different error scenarios:

```python
from eket_sdk import (
    EketError,           # Base exception
    AuthenticationError, # 401 errors
    ValidationError,     # 400 errors
    NotFoundError,       # 404 errors
    ConflictError,       # 409 errors (e.g., task already claimed)
    ServerError,         # 500 errors
)

try:
    task = client.claim_task("FEAT-001")
except ConflictError as e:
    print(f"Task already claimed: {e.message}")
    print(f"Claimed by: {e.details.get('assigned_to')}")
except NotFoundError:
    print("Task not found")
except EketError as e:
    print(f"Error {e.code}: {e.message}")
```

## Advanced Usage

### Automatic Heartbeat

```python
import threading
import time

def heartbeat_loop(client, interval=60):
    """Send periodic heartbeats."""
    while True:
        try:
            response = client.send_heartbeat(
                status=AgentStatus.ACTIVE
            )
            # Process messages
            messages = response.get("messages", [])
            for msg in messages:
                handle_message(msg)
        except Exception as e:
            print(f"Heartbeat failed: {e}")
        time.sleep(interval)

# Run in background
heartbeat_thread = threading.Thread(
    target=heartbeat_loop,
    args=(client, 30),
    daemon=True
)
heartbeat_thread.start()
```

### Retry with Backoff

```python
from eket_sdk.utils import retry_with_backoff

@retry_with_backoff(max_retries=5, initial_delay=1.0)
def claim_task_with_retry(client, task_id):
    """Claim task with automatic retry."""
    return client.claim_task(task_id)

try:
    task = claim_task_with_retry(client, "FEAT-001")
except Exception as e:
    print(f"Failed after retries: {e}")
```

### Custom Timeout

```python
# Set custom timeout (default: 30s)
client = EketClient(
    server_url="http://localhost:8080",
    timeout=60  # 60 seconds
)
```

## Examples

Complete examples are available in the `examples/` directory:

- [`register_agent.py`](examples/register_agent.py) - Register and list agents
- [`claim_task.py`](examples/claim_task.py) - Claim and work on tasks
- [`submit_pr.py`](examples/submit_pr.py) - Submit pull requests
- [`auto_heartbeat.py`](examples/auto_heartbeat.py) - Automatic heartbeat

Run examples:

```bash
cd examples
python register_agent.py
```

## Testing

Run tests with pytest:

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run all tests
pytest

# Run with coverage
pytest --cov=eket_sdk --cov-report=html

# Run specific test file
pytest tests/test_client.py -v
```

## Development

### Code Style

This project follows PEP 8 style guidelines:

```bash
# Format code
black eket_sdk/ tests/ examples/

# Lint code
flake8 eket_sdk/ tests/ examples/

# Type check
mypy eket_sdk/
```

### Project Structure

```
sdk/python/
├── eket_sdk/           # SDK source code
│   ├── __init__.py     # Package initialization
│   ├── client.py       # EketClient main class
│   ├── models.py       # Data models
│   ├── exceptions.py   # Custom exceptions
│   └── utils.py        # Utility functions
├── examples/           # Usage examples
│   ├── register_agent.py
│   ├── claim_task.py
│   ├── submit_pr.py
│   └── auto_heartbeat.py
├── tests/              # Unit tests
│   ├── test_client.py
│   └── test_models.py
├── setup.py            # Package setup
├── requirements.txt    # Dependencies
└── README.md           # This file
```

## Requirements

- Python 3.8+
- requests >= 2.31.0

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Support

- **Documentation**: https://eket.dev/docs/sdk/python
- **Issues**: https://github.com/eket-framework/python-sdk/issues
- **Protocol Spec**: [EKET_PROTOCOL_V1.md](../../docs/protocol/EKET_PROTOCOL_V1.md)
- **OpenAPI Spec**: [openapi.yaml](../../docs/protocol/openapi.yaml)

## Related Projects

- [EKET Framework](../../README.md) - Main framework repository
- [EKET Protocol](../../docs/protocol/EKET_PROTOCOL_V1.md) - Protocol specification
- [EKET Server](../../node/src/api/eket-server.ts) - TypeScript server implementation

## Changelog

### v1.0.0 (2026-04-07)

- Initial release
- Full EKET Protocol v1.0.0 support
- Agent lifecycle management
- Task management
- Messaging system
- Pull request workflow
- Comprehensive error handling
- Type hints and documentation

---

Built with ❤️ by the EKET Framework Team
