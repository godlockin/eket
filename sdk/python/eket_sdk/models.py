"""
EKET SDK Data Models

Data classes for EKET Protocol entities.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


# ============================================================================
# Enums
# ============================================================================


class AgentType(str, Enum):
    """Agent type enumeration."""

    CLAUDE_CODE = "claude_code"
    OPENCLAW = "openclaw"
    CURSOR = "cursor"
    WINDSURF = "windsurf"
    GEMINI = "gemini"
    CUSTOM = "custom"


class AgentRole(str, Enum):
    """Agent role enumeration."""

    MASTER = "master"
    SLAVER = "slaver"


class AgentSpecialty(str, Enum):
    """Agent specialty enumeration."""

    FRONTEND = "frontend"
    BACKEND = "backend"
    FULLSTACK = "fullstack"
    QA = "qa"
    DEVOPS = "devops"
    DESIGNER = "designer"
    GENERAL = "general"


class AgentStatus(str, Enum):
    """Agent status enumeration."""

    ACTIVE = "active"
    IDLE = "idle"
    BUSY = "busy"
    STALE = "stale"


class TaskType(str, Enum):
    """Task type enumeration."""

    FEATURE = "feature"
    BUGFIX = "bugfix"
    TASK = "task"
    TEST = "test"
    DOC = "doc"
    REFACTOR = "refactor"


class TaskPriority(str, Enum):
    """Task priority enumeration."""

    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class TaskStatus(str, Enum):
    """Task status enumeration."""

    BACKLOG = "backlog"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    DONE = "done"


class MessageType(str, Enum):
    """Message type enumeration."""

    PR_REVIEW_REQUEST = "pr_review_request"
    TASK_CLAIMED = "task_claimed"
    HELP_REQUEST = "help_request"
    STATUS_UPDATE = "status_update"
    TASK_ASSIGNED = "task_assigned"
    PR_APPROVED = "pr_approved"
    PR_REJECTED = "pr_rejected"
    BLOCKER_ALERT = "blocker_alert"


class MessagePriority(str, Enum):
    """Message priority enumeration."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class PRStatus(str, Enum):
    """Pull request status enumeration."""

    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"
    REJECTED = "rejected"
    MERGED = "merged"


class TestStatus(str, Enum):
    """Test status enumeration."""

    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


class ReviewStatus(str, Enum):
    """Pull request review decision enumeration."""

    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"
    REJECTED = "rejected"


# ============================================================================
# Data Models
# ============================================================================


@dataclass
class Agent:
    """
    Agent representation.

    Attributes:
        instance_id: Unique agent instance identifier
        agent_type: Type of AI agent
        role: Agent role (master/slaver)
        status: Current agent status
        specialty: Agent's technical specialty
        registered_at: Registration timestamp (ISO 8601)
        last_heartbeat: Last heartbeat timestamp (ISO 8601)
        current_task: Currently assigned task ID
        capabilities: List of agent capabilities
        metadata: Additional metadata
    """

    instance_id: str
    agent_type: AgentType
    role: AgentRole
    status: AgentStatus
    specialty: Optional[AgentSpecialty] = None
    registered_at: Optional[str] = None
    last_heartbeat: Optional[str] = None
    current_task: Optional[str] = None
    capabilities: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def is_active(self) -> bool:
        """Check if agent is currently active."""
        return self.status == AgentStatus.ACTIVE

    def is_available(self) -> bool:
        """Check if agent is available for work."""
        return self.status in (AgentStatus.ACTIVE, AgentStatus.IDLE) and not self.current_task


@dataclass
class AcceptanceCriterion:
    """Task acceptance criterion."""

    description: str
    completed: bool = False


@dataclass
class Task:
    """
    Task representation.

    Attributes:
        id: Task ID (e.g., FEAT-001)
        title: Task title
        type: Task type
        priority: Task priority
        status: Current task status
        assigned_to: Instance ID of assigned agent
        created_at: Creation timestamp (ISO 8601)
        updated_at: Last update timestamp (ISO 8601)
        description: Detailed task description
        acceptance_criteria: List of acceptance criteria
        tags: Task tags
        estimate: Time estimate (e.g., "8h", "2d")
        progress: Task progress (0.0 to 1.0)
    """

    id: str
    title: str
    type: TaskType
    priority: TaskPriority
    status: TaskStatus
    assigned_to: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    description: Optional[str] = None
    acceptance_criteria: List[AcceptanceCriterion] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    estimate: Optional[str] = None
    progress: float = 0.0

    def is_available(self) -> bool:
        """Check if task is available to claim."""
        return self.status == TaskStatus.READY and not self.assigned_to

    def is_completed(self) -> bool:
        """Check if task is completed."""
        return self.status == TaskStatus.DONE


@dataclass
class Message:
    """
    Inter-agent message.

    Attributes:
        id: Message ID
        from_id: Sender instance ID
        to_id: Recipient instance ID
        type: Message type
        payload: Message payload data
        timestamp: Message timestamp (ISO 8601)
        priority: Message priority
        correlation_id: ID of message this is replying to
        ttl: Time-to-live in seconds
    """

    from_id: str
    to_id: str
    type: MessageType
    payload: Dict[str, Any]
    timestamp: str
    id: Optional[str] = None
    priority: MessagePriority = MessagePriority.NORMAL
    correlation_id: Optional[str] = None
    ttl: Optional[int] = None

    def is_reply(self) -> bool:
        """Check if this message is a reply to another."""
        return self.correlation_id is not None


@dataclass
class PRComment:
    """Pull request review comment."""

    file: str
    line: int
    comment: str


@dataclass
class PR:
    """
    Pull request representation.

    Attributes:
        task_id: Associated task ID
        instance_id: Submitter instance ID
        branch: Source branch name
        description: PR description
        status: PR status
        test_status: Test execution status
        created_at: Creation timestamp (ISO 8601)
        review_status: Review decision status
        reviewer: Reviewer instance ID
        review_comments: List of review comments
        review_summary: Review summary
        reviewed_at: Review timestamp (ISO 8601)
        merge_commit: Merge commit hash
        merged_at: Merge timestamp (ISO 8601)
        merger: Merger instance ID
        target_branch: Target branch name
    """

    task_id: str
    instance_id: str
    branch: str
    description: str
    status: PRStatus = PRStatus.PENDING_REVIEW
    test_status: Optional[TestStatus] = None
    created_at: Optional[str] = None
    review_status: Optional[str] = None
    reviewer: Optional[str] = None
    review_comments: List[PRComment] = field(default_factory=list)
    review_summary: Optional[str] = None
    reviewed_at: Optional[str] = None
    merge_commit: Optional[str] = None
    merged_at: Optional[str] = None
    merger: Optional[str] = None
    target_branch: Optional[str] = None

    def is_approved(self) -> bool:
        """Check if PR is approved."""
        return self.review_status == "approved"

    def is_merged(self) -> bool:
        """Check if PR is merged."""
        return self.status == PRStatus.MERGED


# ============================================================================
# Helper Functions
# ============================================================================


def parse_iso_datetime(iso_str: Optional[str]) -> Optional[datetime]:
    """
    Parse ISO 8601 datetime string.

    Args:
        iso_str: ISO 8601 datetime string

    Returns:
        datetime object or None if input is None
    """
    if iso_str is None:
        return None
    return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
