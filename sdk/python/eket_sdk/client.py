"""
EKET SDK Client

Main client class for interacting with EKET Protocol servers.
"""

import requests
from typing import Optional, List, Dict, Any
from urllib.parse import urljoin
from datetime import datetime

from .models import (
    Agent,
    Task,
    Message,
    AcceptanceCriterion,
    AgentType,
    AgentRole,
    AgentSpecialty,
    AgentStatus,
    TaskType,
    TaskPriority,
    TaskStatus,
    MessageType,
    MessagePriority,
    TestStatus,
)
from .exceptions import (
    EketError,
    AuthenticationError,
    ValidationError,
    NotFoundError,
    ConflictError,
    ServerError,
    ServiceUnavailableError,
)


class EketClient:
    """
    EKET Protocol Client.

    Provides a high-level interface for AI agents to interact with
    EKET Protocol servers.

    Example:
        >>> client = EketClient(server_url="http://localhost:8080")
        >>> agent = client.register_agent(
        ...     agent_type=AgentType.CUSTOM,
        ...     role=AgentRole.SLAVER,
        ...     specialty=AgentSpecialty.BACKEND
        ... )
        >>> print(f"Registered as {agent.instance_id}")
    """

    def __init__(
        self,
        server_url: str,
        jwt_token: Optional[str] = None,
        protocol_version: str = "1.0.0",
        timeout: int = 30,
    ):
        """
        Initialize EKET client.

        Args:
            server_url: Base URL of EKET server (e.g., "http://localhost:8080")
            jwt_token: JWT authentication token (if already registered)
            protocol_version: Protocol version to use
            timeout: Request timeout in seconds
        """
        self.server_url = server_url.rstrip("/")
        self.jwt_token = jwt_token
        self.protocol_version = protocol_version
        self.timeout = timeout
        self.instance_id: Optional[str] = None

        # Session for connection pooling
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def _get_headers(self) -> Dict[str, str]:
        """Get request headers with authentication."""
        headers = {}
        if self.jwt_token:
            headers["Authorization"] = f"Bearer {self.jwt_token}"
        return headers

    def _request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Make HTTP request to server.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (e.g., "/api/v1/agents/register")
            data: Request body data
            params: Query parameters

        Returns:
            Response JSON data

        Raises:
            EketError: On any error
        """
        url = urljoin(self.server_url, endpoint)
        headers = self._get_headers()

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            # Parse response
            try:
                response_data = response.json()
            except ValueError:
                raise ServerError("Invalid JSON response from server")

            # Handle errors
            if not response.ok:
                error = response_data.get("error", {})
                code = error.get("code", "UNKNOWN")
                message = error.get("message", "Unknown error")
                details = error.get("details", {})

                if response.status_code == 401:
                    raise AuthenticationError(message, details)
                elif response.status_code == 400:
                    raise ValidationError(message, details)
                elif response.status_code == 404:
                    raise NotFoundError(message, details)
                elif response.status_code == 409:
                    raise ConflictError(message, details)
                elif response.status_code == 503:
                    raise ServiceUnavailableError(message, details)
                elif response.status_code >= 500:
                    raise ServerError(message, details)
                else:
                    raise EketError(message, code, details)

            return response_data

        except requests.exceptions.Timeout:
            raise EketError(f"Request timeout after {self.timeout}s", "TIMEOUT")
        except requests.exceptions.ConnectionError as e:
            raise EketError(f"Connection error: {e}", "CONNECTION_ERROR")
        except requests.exceptions.RequestException as e:
            raise EketError(f"Request error: {e}", "REQUEST_ERROR")

    # ========================================================================
    # Agent Management
    # ========================================================================

    def register_agent(
        self,
        agent_type: AgentType,
        role: AgentRole,
        specialty: Optional[AgentSpecialty] = None,
        capabilities: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        agent_version: str = "1.0.0",
    ) -> Agent:
        """
        Register a new agent with the server.

        Args:
            agent_type: Type of AI agent
            role: Agent role (master/slaver)
            specialty: Agent's technical specialty
            capabilities: List of agent capabilities
            metadata: Additional metadata (user, machine, timezone, etc.)
            agent_version: Agent software version

        Returns:
            Registered agent with instance_id and token

        Raises:
            ValidationError: If registration data is invalid
            ServerError: If registration fails
        """
        data = {
            "agent_type": agent_type.value if isinstance(agent_type, AgentType) else agent_type,
            "agent_version": agent_version,
            "role": role.value if isinstance(role, AgentRole) else role,
            "protocol_version": self.protocol_version,
        }

        if specialty:
            data["specialty"] = (
                specialty.value if isinstance(specialty, AgentSpecialty) else specialty
            )
        if capabilities:
            data["capabilities"] = capabilities
        if metadata:
            data["metadata"] = metadata

        response = self._request("POST", "/api/v1/agents/register", data=data)

        # Store token and instance_id
        self.jwt_token = response.get("token")
        self.instance_id = response.get("instance_id")

        # Update session headers
        self.session.headers.update({"Authorization": f"Bearer {self.jwt_token}"})

        # Create Agent object
        agent = Agent(
            instance_id=self.instance_id,
            agent_type=agent_type,
            role=role,
            status=AgentStatus.ACTIVE,
            specialty=specialty,
            registered_at=datetime.utcnow().isoformat(),
            last_heartbeat=datetime.utcnow().isoformat(),
            capabilities=capabilities or [],
            metadata=metadata or {},
        )

        return agent

    def deregister_agent(self, instance_id: Optional[str] = None) -> bool:
        """
        Deregister an agent.

        Args:
            instance_id: Instance ID to deregister (defaults to current instance)

        Returns:
            True if successful

        Raises:
            AuthenticationError: If not authenticated
            NotFoundError: If agent not found
        """
        instance_id = instance_id or self.instance_id
        if not instance_id:
            raise ValidationError("No instance_id provided or set")

        response = self._request("DELETE", f"/api/v1/agents/{instance_id}")
        return response.get("success", False)

    def send_heartbeat(
        self,
        instance_id: Optional[str] = None,
        status: AgentStatus = AgentStatus.ACTIVE,
        current_task: Optional[str] = None,
        progress: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Send agent heartbeat to server.

        Args:
            instance_id: Instance ID (defaults to current instance)
            status: Current agent status
            current_task: Currently assigned task ID
            progress: Task progress (0.0 to 1.0)

        Returns:
            Server response with timestamp and pending messages

        Raises:
            AuthenticationError: If not authenticated
        """
        instance_id = instance_id or self.instance_id
        if not instance_id:
            raise ValidationError("No instance_id provided or set")

        data = {
            "status": status.value if isinstance(status, AgentStatus) else status,
        }
        if current_task:
            data["current_task"] = current_task
        if progress is not None:
            data["progress"] = progress

        response = self._request("POST", f"/api/v1/agents/{instance_id}/heartbeat", data=data)
        return response

    def get_agent(self, instance_id: Optional[str] = None) -> Agent:
        """
        Get agent details.

        Args:
            instance_id: Instance ID (defaults to current instance)

        Returns:
            Agent object

        Raises:
            NotFoundError: If agent not found
        """
        instance_id = instance_id or self.instance_id
        if not instance_id:
            raise ValidationError("No instance_id provided or set")

        response = self._request("GET", f"/api/v1/agents/{instance_id}")
        agent_data = response.get("agent", {})

        return Agent(
            instance_id=agent_data.get("instance_id"),
            agent_type=AgentType(agent_data.get("agent_type")),
            role=AgentRole(agent_data.get("role")),
            status=AgentStatus(agent_data.get("status")),
            specialty=AgentSpecialty(agent_data["specialty"])
            if agent_data.get("specialty")
            else None,
            registered_at=agent_data.get("registered_at"),
            last_heartbeat=agent_data.get("last_heartbeat"),
            current_task=agent_data.get("current_task"),
        )

    def list_agents(
        self, role: Optional[AgentRole] = None, status: Optional[AgentStatus] = None
    ) -> List[Agent]:
        """
        List all registered agents.

        Args:
            role: Filter by role
            status: Filter by status

        Returns:
            List of agents
        """
        params = {}
        if role:
            params["role"] = role.value if isinstance(role, AgentRole) else role
        if status:
            params["status"] = status.value if isinstance(status, AgentStatus) else status

        response = self._request("GET", "/api/v1/agents", params=params)
        agents_data = response.get("agents", [])

        return [
            Agent(
                instance_id=a.get("instance_id"),
                agent_type=AgentType(a.get("agent_type")),
                role=AgentRole(a.get("role")),
                status=AgentStatus(a.get("status")),
                specialty=AgentSpecialty(a["specialty"]) if a.get("specialty") else None,
                registered_at=a.get("registered_at"),
                last_heartbeat=a.get("last_heartbeat"),
                current_task=a.get("current_task"),
            )
            for a in agents_data
        ]

    # ========================================================================
    # Task Management
    # ========================================================================

    def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        assigned_to: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> List[Task]:
        """
        List tasks.

        Args:
            status: Filter by status
            assigned_to: Filter by assigned agent
            tags: Filter by tags

        Returns:
            List of tasks
        """
        params = {}
        if status:
            params["status"] = status.value if isinstance(status, TaskStatus) else status
        if assigned_to:
            params["assigned_to"] = assigned_to
        if tags:
            params["tags"] = ",".join(tags)

        response = self._request("GET", "/api/v1/tasks", params=params)
        tasks_data = response.get("tasks", [])

        return [self._parse_task(t) for t in tasks_data]

    def get_task(self, task_id: str) -> Task:
        """
        Get task details.

        Args:
            task_id: Task ID

        Returns:
            Task object

        Raises:
            NotFoundError: If task not found
        """
        response = self._request("GET", f"/api/v1/tasks/{task_id}")
        task_data = response.get("task", {})
        return self._parse_task(task_data)

    def claim_task(self, task_id: str, instance_id: Optional[str] = None) -> Task:
        """
        Claim a task.

        Args:
            task_id: Task ID to claim
            instance_id: Instance ID (defaults to current instance)

        Returns:
            Updated task

        Raises:
            ConflictError: If task already claimed
            NotFoundError: If task not found
        """
        instance_id = instance_id or self.instance_id
        if not instance_id:
            raise ValidationError("No instance_id provided or set")

        data = {"instance_id": instance_id}
        response = self._request("POST", f"/api/v1/tasks/{task_id}/claim", data=data)
        task_data = response.get("task", {})
        return self._parse_task(task_data)

    def update_task(
        self,
        task_id: str,
        status: Optional[TaskStatus] = None,
        progress: Optional[float] = None,
        notes: Optional[str] = None,
    ) -> Task:
        """
        Update task status.

        Args:
            task_id: Task ID
            status: New status
            progress: Progress (0.0 to 1.0)
            notes: Update notes

        Returns:
            Updated task
        """
        data = {}
        if status:
            data["status"] = status.value if isinstance(status, TaskStatus) else status
        if progress is not None:
            data["progress"] = progress
        if notes:
            data["notes"] = notes

        response = self._request("PATCH", f"/api/v1/tasks/{task_id}", data=data)
        task_data = response.get("task", {})
        return self._parse_task(task_data)

    def _parse_task(self, task_data: Dict[str, Any]) -> Task:
        """Parse task data from API response."""
        acceptance_criteria = []
        if task_data.get("acceptance_criteria"):
            for ac in task_data["acceptance_criteria"]:
                acceptance_criteria.append(
                    AcceptanceCriterion(
                        description=ac.get("description", ""),
                        completed=ac.get("completed", False),
                    )
                )

        return Task(
            id=task_data.get("id"),
            title=task_data.get("title"),
            type=TaskType(task_data.get("type")),
            priority=TaskPriority(task_data.get("priority")),
            status=TaskStatus(task_data.get("status")),
            assigned_to=task_data.get("assigned_to"),
            created_at=task_data.get("created_at"),
            updated_at=task_data.get("updated_at"),
            description=task_data.get("description"),
            acceptance_criteria=acceptance_criteria,
            tags=task_data.get("tags", []),
            estimate=task_data.get("estimate"),
            progress=task_data.get("progress", 0.0),
        )

    # ========================================================================
    # Messages
    # ========================================================================

    def send_message(
        self,
        from_id: str,
        to_id: str,
        msg_type: MessageType,
        payload: Dict[str, Any],
        priority: MessagePriority = MessagePriority.NORMAL,
        correlation_id: Optional[str] = None,
        ttl: Optional[int] = None,
    ) -> str:
        """
        Send a message to another agent.

        Args:
            from_id: Sender instance ID
            to_id: Recipient instance ID
            msg_type: Message type
            payload: Message payload data
            priority: Message priority
            correlation_id: ID of message this is replying to
            ttl: Time-to-live in seconds

        Returns:
            Message ID

        Raises:
            ValidationError: If message data is invalid
        """
        data = {
            "from": from_id,
            "to": to_id,
            "type": msg_type.value if isinstance(msg_type, MessageType) else msg_type,
            "payload": payload,
            "timestamp": datetime.utcnow().isoformat(),
            "priority": priority.value if isinstance(priority, MessagePriority) else priority,
        }

        if correlation_id:
            data["correlation_id"] = correlation_id
        if ttl:
            data["ttl"] = ttl

        response = self._request("POST", "/api/v1/messages", data=data)
        return response.get("message_id")

    def get_messages(
        self, instance_id: Optional[str] = None, since: Optional[int] = None, limit: int = 50
    ) -> List[Message]:
        """
        Get messages for an agent.

        Args:
            instance_id: Instance ID (defaults to current instance)
            since: Unix timestamp to get messages since
            limit: Maximum number of messages to retrieve

        Returns:
            List of messages
        """
        instance_id = instance_id or self.instance_id
        if not instance_id:
            raise ValidationError("No instance_id provided or set")

        params = {"limit": limit}
        if since:
            params["since"] = since

        response = self._request("GET", f"/api/v1/agents/{instance_id}/messages", params=params)
        messages_data = response.get("messages", [])

        return [
            Message(
                id=m.get("id"),
                from_id=m.get("from"),
                to_id=m.get("to"),
                type=MessageType(m.get("type")),
                payload=m.get("payload", {}),
                timestamp=m.get("timestamp"),
                priority=MessagePriority(m.get("priority", "normal")),
                correlation_id=m.get("correlation_id"),
                ttl=m.get("ttl"),
            )
            for m in messages_data
        ]

    # ========================================================================
    # Pull Request Workflow
    # ========================================================================

    def submit_pr(
        self,
        instance_id: str,
        task_id: str,
        branch: str,
        description: str,
        test_status: TestStatus = TestStatus.PASSED,
    ) -> str:
        """
        Submit a pull request.

        Args:
            instance_id: Submitter instance ID
            task_id: Associated task ID
            branch: Source branch name
            description: PR description
            test_status: Test execution status

        Returns:
            PR ID (task_id)

        Raises:
            ValidationError: If PR data is invalid
        """
        data = {
            "instance_id": instance_id,
            "task_id": task_id,
            "branch": branch,
            "description": description,
            "test_status": (
                test_status.value if isinstance(test_status, TestStatus) else test_status
            ),
        }

        response = self._request("POST", "/api/v1/prs", data=data)
        return response.get("pr_id")

    def review_pr(
        self,
        task_id: str,
        reviewer: str,
        status: str,
        comments: Optional[List[Dict[str, Any]]] = None,
        summary: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Review a pull request.

        Args:
            task_id: Task/PR ID
            reviewer: Reviewer instance ID
            status: Review status (approved/changes_requested/rejected)
            comments: List of review comments
            summary: Review summary

        Returns:
            Updated PR data

        Raises:
            NotFoundError: If PR not found
        """
        data = {"reviewer": reviewer, "status": status}

        if comments:
            data["comments"] = comments
        if summary:
            data["summary"] = summary

        response = self._request("POST", f"/api/v1/prs/{task_id}/review", data=data)
        return response.get("pr", {})

    def merge_pr(
        self, task_id: str, merger: str, target_branch: str = "main", squash: bool = False
    ) -> Dict[str, Any]:
        """
        Merge a pull request.

        Args:
            task_id: Task/PR ID
            merger: Merger instance ID
            target_branch: Target branch name
            squash: Whether to squash commits

        Returns:
            Merge information (merge_commit, merged_at)

        Raises:
            ValidationError: If PR not approved
            NotFoundError: If PR not found
        """
        data = {"merger": merger, "target_branch": target_branch, "squash": squash}

        response = self._request("POST", f"/api/v1/prs/{task_id}/merge", data=data)
        return {
            "merge_commit": response.get("merge_commit"),
            "merged_at": response.get("merged_at"),
        }

    # ========================================================================
    # Utilities
    # ========================================================================

    def health_check(self) -> Dict[str, Any]:
        """
        Check server health.

        Returns:
            Server status information
        """
        response = self._request("GET", "/health")
        return response

    def close(self):
        """Close the client session."""
        self.session.close()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
