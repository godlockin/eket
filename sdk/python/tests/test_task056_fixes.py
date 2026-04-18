"""
Unit tests for TASK-056 bug fixes:
  Bug-1: token=None → AuthenticationError
  Bug-2: AgentType enum deserialization fallback to CUSTOM
  Bug-3: review_pr() status uses ReviewStatus enum
  Bug-4: datetime.utcnow() replaced with datetime.now(timezone.utc)
"""

import pytest
from unittest.mock import patch, Mock
from datetime import datetime, timezone

from eket_sdk import EketClient, AgentType, AgentRole, AgentSpecialty, ReviewStatus
from eket_sdk.exceptions import AuthenticationError


@pytest.fixture
def client():
    return EketClient(server_url="http://localhost:8080")


# ============================================================================
# Bug-1: token=None raises AuthenticationError
# ============================================================================

class TestBug1TokenNone:
    @patch("eket_sdk.client.requests.Session.request")
    def test_register_raises_when_token_none(self, mock_request, client):
        """register_agent() must raise AuthenticationError if server returns no token."""
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "instance_id": "agent_001",
            # "token" key intentionally absent
        }

        with pytest.raises(AuthenticationError):
            client.register_agent(agent_type=AgentType.CUSTOM, role=AgentRole.SLAVER)

    @patch("eket_sdk.client.requests.Session.request")
    def test_register_raises_when_token_explicitly_none(self, mock_request, client):
        """register_agent() must raise AuthenticationError if token is explicitly None."""
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "instance_id": "agent_001",
            "token": None,
        }

        with pytest.raises(AuthenticationError):
            client.register_agent(agent_type=AgentType.CUSTOM, role=AgentRole.SLAVER)

    @patch("eket_sdk.client.requests.Session.request")
    def test_register_success_sets_auth_header(self, mock_request, client):
        """Valid token must not produce 'Bearer None' in session headers."""
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "instance_id": "agent_001",
            "token": "valid_jwt_token",
        }

        client.register_agent(agent_type=AgentType.CUSTOM, role=AgentRole.SLAVER)

        auth_header = client.session.headers.get("Authorization", "")
        assert auth_header == "Bearer valid_jwt_token"
        assert "None" not in auth_header


# ============================================================================
# Bug-2: AgentType enum fallback to CUSTOM on unknown value
# ============================================================================

class TestBug2EnumFallback:
    @patch("eket_sdk.client.requests.Session.request")
    def test_get_agent_unknown_type_falls_back_to_custom(self, mock_request, client):
        """get_agent() must not raise ValueError for unknown agent_type values."""
        client.instance_id = "agent_001"
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "agent": {
                "instance_id": "agent_001",
                "agent_type": "new_future_type",  # unknown value
                "role": "slaver",
                "status": "active",
            }
        }

        # Should NOT raise ValueError
        agent = client.get_agent()
        assert agent.agent_type == AgentType.CUSTOM

    @patch("eket_sdk.client.requests.Session.request")
    def test_list_agents_unknown_type_falls_back_to_custom(self, mock_request, client):
        """list_agents() must not raise ValueError for unknown agent_type values."""
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "agents": [
                {
                    "instance_id": "agent_001",
                    "agent_type": "completely_unknown_agent",
                    "role": "master",
                    "status": "active",
                }
            ]
        }

        agents = client.list_agents()
        assert len(agents) == 1
        assert agents[0].agent_type == AgentType.CUSTOM

    @patch("eket_sdk.client.requests.Session.request")
    def test_list_agents_known_type_preserved(self, mock_request, client):
        """list_agents() must correctly deserialize known agent_type values."""
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "agents": [
                {
                    "instance_id": "agent_001",
                    "agent_type": "claude_code",
                    "role": "master",
                    "status": "active",
                }
            ]
        }

        agents = client.list_agents()
        assert agents[0].agent_type == AgentType.CLAUDE_CODE


# ============================================================================
# Bug-3: review_pr() uses ReviewStatus enum
# ============================================================================

class TestBug3ReviewStatus:
    @patch("eket_sdk.client.requests.Session.request")
    def test_review_pr_with_enum(self, mock_request, client):
        """review_pr() must accept ReviewStatus enum values."""
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {"pr": {"status": "approved"}}

        result = client.review_pr(
            task_id="FEAT-001",
            reviewer="master_001",
            status=ReviewStatus.APPROVED,
        )
        assert result == {"status": "approved"}

        # Verify the serialized value sent to server
        call_kwargs = mock_request.call_args
        import json
        sent_data = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json", {})
        assert sent_data["status"] == "approved"

    @patch("eket_sdk.client.requests.Session.request")
    def test_review_pr_changes_requested(self, mock_request, client):
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {"pr": {}}

        # Must not raise TypeError
        client.review_pr(
            task_id="FEAT-001",
            reviewer="master_001",
            status=ReviewStatus.CHANGES_REQUESTED,
        )

    def test_review_status_enum_values(self):
        """ReviewStatus must have the three required values."""
        assert ReviewStatus.APPROVED.value == "approved"
        assert ReviewStatus.CHANGES_REQUESTED.value == "changes_requested"
        assert ReviewStatus.REJECTED.value == "rejected"


# ============================================================================
# Bug-4: no datetime.utcnow() usage (timezone-aware datetimes)
# ============================================================================

class TestBug4DatetimeUtcNow:
    @patch("eket_sdk.client.requests.Session.request")
    def test_register_agent_timestamps_are_timezone_aware(self, mock_request, client):
        """Timestamps in registered Agent must be timezone-aware (UTC)."""
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {
            "success": True,
            "instance_id": "agent_001",
            "token": "valid_token",
        }

        agent = client.register_agent(agent_type=AgentType.CUSTOM, role=AgentRole.SLAVER)

        # Parse back the ISO strings and verify they carry UTC offset
        registered_at = datetime.fromisoformat(agent.registered_at)
        last_heartbeat = datetime.fromisoformat(agent.last_heartbeat)

        assert registered_at.tzinfo is not None, "registered_at must be timezone-aware"
        assert last_heartbeat.tzinfo is not None, "last_heartbeat must be timezone-aware"

    @patch("eket_sdk.client.requests.Session.request")
    def test_send_message_timestamp_is_timezone_aware(self, mock_request, client):
        """Timestamp in send_message payload must be timezone-aware."""
        mock_request.return_value.ok = True
        mock_request.return_value.json.return_value = {"message_id": "msg_001"}

        from eket_sdk import MessageType
        client.send_message(
            from_id="slaver_001",
            to_id="master_001",
            msg_type=MessageType.STATUS_UPDATE,
            payload={"status": "ok"},
        )

        call_kwargs = mock_request.call_args
        sent_data = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json", {})
        ts = datetime.fromisoformat(sent_data["timestamp"])
        assert ts.tzinfo is not None, "send_message timestamp must be timezone-aware"

    def test_no_utcnow_in_client_source(self):
        """Ensure datetime.utcnow() is not present in client.py source."""
        import inspect
        import eket_sdk.client as client_module
        source = inspect.getsource(client_module)
        assert "utcnow()" not in source, "datetime.utcnow() still present in client.py"
