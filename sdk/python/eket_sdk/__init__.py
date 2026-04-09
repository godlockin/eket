"""
EKET SDK for Python

Python client library for EKET Agent Collaboration Protocol v1.0.0

Example:
    >>> from eket_sdk import EketClient
    >>> client = EketClient(server_url="http://localhost:8080")
    >>> agent = client.register_agent(agent_type="custom", role="slaver", specialty="backend")
    >>> print(f"Registered as {agent.instance_id}")
"""

__version__ = "1.0.0"
__protocol_version__ = "1.0.0"

from .client import EketClient
from .models import Agent, Task, Message, PR, AgentType, AgentRole, AgentSpecialty, AgentStatus, TaskStatus, MessageType, PRStatus
from .exceptions import (
    EketError,
    AuthenticationError,
    ValidationError,
    NotFoundError,
    ConflictError,
    ServerError,
)

__all__ = [
    # Client
    "EketClient",
    # Models
    "Agent",
    "Task",
    "Message",
    "PR",
    # Enums
    "AgentType",
    "AgentRole",
    "AgentSpecialty",
    "AgentStatus",
    "TaskStatus",
    "MessageType",
    "PRStatus",
    # Exceptions
    "EketError",
    "AuthenticationError",
    "ValidationError",
    "NotFoundError",
    "ConflictError",
    "ServerError",
]
