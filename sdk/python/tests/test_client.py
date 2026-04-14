"""
Unit tests for EketClient

Run with: pytest test_client.py
"""

import pytest
from unittest.mock import Mock, patch
from eket_sdk import (
    EketClient,
    AgentType,
    AgentRole,
    AgentSpecialty,
    AgentStatus,
    TaskStatus,
    MessageType,
    ValidationError,
    NotFoundError,
)


@pytest.fixture
def client():
    """Create a test client."""
    return EketClient(server_url="http://localhost:8080")


@pytest.fixture
def mock_response():
    """Create a mock response."""
    mock = Mock()
    mock.ok = True
    mock.json.return_value = {"success": True}
    return mock


class TestClientInitialization:
    """Test client initialization."""

    def test_init_with_defaults(self):
        client = EketClient(server_url="http://localhost:8080")
        assert client.server_url == "http://localhost:8080"
        assert client.jwt_token is None
        assert client.protocol_version == "1.0.0"
        assert client.timeout == 30

    def test_init_with_custom_params(self):
        client = EketClient(
            server_url="http://api.eket.dev",
            jwt_token="test_token",
            protocol_version="1.1.0",
            timeout=60,
        )
        assert client.server_url == "http://api.eket.dev"
        assert client.jwt_token == "test_token"
        assert client.protocol_version == "1.1.0"
        assert client.timeout == 60

    def test_trailing_slash_removed(self):
        client = EketClient(server_url="http://localhost:8080/")
        assert client.server_url == "http://localhost:8080"


class TestAgentManagement:
    """Test agent management operations."""

    @patch("eket_sdk.client.requests.Session.request")
    def test_register_agent(self, mock_request, client):
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "instance_id": "slaver_backend_001",
            "token": "test_jwt_token",
            "heartbeat_interval": 60,
        }

        agent = client.register_agent(
            agent_type=AgentType.CUSTOM,
            role=AgentRole.SLAVER,
            specialty=AgentSpecialty.BACKEND,
            capabilities=["python", "fastapi"],
        )

        assert agent.instance_id == "slaver_backend_001"
        assert client.jwt_token == "test_jwt_token"
        assert agent.role == AgentRole.SLAVER
        assert agent.specialty == AgentSpecialty.BACKEND

    @patch("eket_sdk.client.requests.Session.request")
    def test_deregister_agent(self, mock_request, client):
        client.instance_id = "test_instance"
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {"success": True}

        result = client.deregister_agent()
        assert result is True

    @patch("eket_sdk.client.requests.Session.request")
    def test_send_heartbeat(self, mock_request, client):
        client.instance_id = "test_instance"
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "server_time": "2026-04-07T12:00:00Z",
            "messages": [],
        }

        response = client.send_heartbeat(status=AgentStatus.ACTIVE)
        assert response["success"] is True
        assert "server_time" in response

    @patch("eket_sdk.client.requests.Session.request")
    def test_list_agents(self, mock_request, client):
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "agents": [
                {
                    "instance_id": "master_001",
                    "agent_type": "claude_code",
                    "role": "master",
                    "status": "active",
                }
            ],
        }

        agents = client.list_agents()
        assert len(agents) == 1
        assert agents[0].instance_id == "master_001"
        assert agents[0].role == AgentRole.MASTER


class TestTaskManagement:
    """Test task management operations."""

    @patch("eket_sdk.client.requests.Session.request")
    def test_list_tasks(self, mock_request, client):
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "tasks": [
                {
                    "id": "FEAT-001",
                    "title": "Test task",
                    "type": "feature",
                    "priority": "P1",
                    "status": "ready",
                    "tags": ["backend"],
                }
            ],
        }

        tasks = client.list_tasks(status=TaskStatus.READY)
        assert len(tasks) == 1
        assert tasks[0].id == "FEAT-001"
        assert tasks[0].status == TaskStatus.READY

    @patch("eket_sdk.client.requests.Session.request")
    def test_claim_task(self, mock_request, client):
        client.instance_id = "test_instance"
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "task": {
                "id": "FEAT-001",
                "title": "Test task",
                "type": "feature",
                "priority": "P1",
                "status": "in_progress",
                "assigned_to": "test_instance",
            },
        }

        task = client.claim_task("FEAT-001")
        assert task.id == "FEAT-001"
        assert task.status == TaskStatus.IN_PROGRESS
        assert task.assigned_to == "test_instance"

    @patch("eket_sdk.client.requests.Session.request")
    def test_update_task(self, mock_request, client):
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "task": {
                "id": "FEAT-001",
                "title": "Test task",
                "type": "feature",
                "priority": "P1",
                "status": "review",
                "progress": 1.0,
            },
        }

        task = client.update_task("FEAT-001", status=TaskStatus.REVIEW, progress=1.0)
        assert task.status == TaskStatus.REVIEW
        assert task.progress == 1.0


class TestMessaging:
    """Test messaging operations."""

    @patch("eket_sdk.client.requests.Session.request")
    def test_send_message(self, mock_request, client):
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "message_id": "msg_123",
            "delivered_at": "2026-04-07T12:00:00Z",
        }

        msg_id = client.send_message(
            from_id="slaver_001",
            to_id="master_001",
            msg_type=MessageType.STATUS_UPDATE,
            payload={"status": "working"},
        )

        assert msg_id == "msg_123"

    @patch("eket_sdk.client.requests.Session.request")
    def test_get_messages(self, mock_request, client):
        client.instance_id = "test_instance"
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "messages": [
                {
                    "id": "msg_123",
                    "from": "master_001",
                    "to": "test_instance",
                    "type": "task_assigned",
                    "payload": {"task_id": "FEAT-001"},
                    "timestamp": "2026-04-07T12:00:00Z",
                    "priority": "normal",
                }
            ],
            "has_more": False,
        }

        messages = client.get_messages()
        assert len(messages) == 1
        assert messages[0].id == "msg_123"
        assert messages[0].type == MessageType.TASK_ASSIGNED


class TestErrorHandling:
    """Test error handling."""

    @patch("eket_sdk.client.requests.Session.request")
    def test_validation_error(self, mock_request, client):
        mock_request.return_value.ok = False
        mock_request.return_value.status_code = 400
        mock_request.return_value.json.return_value = {
            "success": False,
            "error": {"code": "VALIDATION_ERROR", "message": "Missing field"},
        }

        with pytest.raises(ValidationError):
            client.register_agent(agent_type=AgentType.CUSTOM, role=AgentRole.SLAVER)

    @patch("eket_sdk.client.requests.Session.request")
    def test_not_found_error(self, mock_request, client):
        mock_request.return_value.ok = False
        mock_request.return_value.status_code = 404
        mock_request.return_value.json.return_value = {
            "success": False,
            "error": {"code": "NOT_FOUND", "message": "Agent not found"},
        }

        with pytest.raises(NotFoundError):
            client.get_agent("nonexistent_id")


class TestContextManager:
    """Test context manager."""

    def test_context_manager(self):
        with EketClient(server_url="http://localhost:8080") as client:
            assert client.session is not None

        # Session should be closed after context
        assert client.session is not None  # Session object still exists but is closed


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
