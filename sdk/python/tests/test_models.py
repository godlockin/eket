"""
Unit tests for data models

Run with: pytest test_models.py
"""

import pytest
from eket_sdk.models import (
    Agent,
    Task,
    Message,
    PR,
    AgentType,
    AgentRole,
    AgentStatus,
    TaskStatus,
    MessageType,
    PRStatus,
    AcceptanceCriterion,
)


class TestAgent:
    """Test Agent model."""

    def test_agent_creation(self):
        agent = Agent(
            instance_id="slaver_001",
            agent_type=AgentType.CUSTOM,
            role=AgentRole.SLAVER,
            status=AgentStatus.ACTIVE,
        )

        assert agent.instance_id == "slaver_001"
        assert agent.agent_type == AgentType.CUSTOM
        assert agent.role == AgentRole.SLAVER
        assert agent.status == AgentStatus.ACTIVE

    def test_is_active(self):
        agent = Agent(
            instance_id="test",
            agent_type=AgentType.CUSTOM,
            role=AgentRole.SLAVER,
            status=AgentStatus.ACTIVE,
        )
        assert agent.is_active() is True

        agent.status = AgentStatus.IDLE
        assert agent.is_active() is False

    def test_is_available(self):
        agent = Agent(
            instance_id="test",
            agent_type=AgentType.CUSTOM,
            role=AgentRole.SLAVER,
            status=AgentStatus.ACTIVE,
        )
        assert agent.is_available() is True

        agent.current_task = "FEAT-001"
        assert agent.is_available() is False


class TestTask:
    """Test Task model."""

    def test_task_creation(self):
        task = Task(
            id="FEAT-001",
            title="Test task",
            type="feature",
            priority="P1",
            status="ready",
        )

        assert task.id == "FEAT-001"
        assert task.title == "Test task"

    def test_is_available(self):
        task = Task(
            id="FEAT-001",
            title="Test",
            type="feature",
            priority="P1",
            status=TaskStatus.READY,
        )
        assert task.is_available() is True

        task.assigned_to = "slaver_001"
        assert task.is_available() is False

    def test_is_completed(self):
        task = Task(
            id="FEAT-001", title="Test", type="feature", priority="P1", status=TaskStatus.DONE
        )
        assert task.is_completed() is True

        task.status = TaskStatus.IN_PROGRESS
        assert task.is_completed() is False


class TestMessage:
    """Test Message model."""

    def test_message_creation(self):
        msg = Message(
            from_id="slaver_001",
            to_id="master_001",
            type=MessageType.STATUS_UPDATE,
            payload={"status": "working"},
            timestamp="2026-04-07T12:00:00Z",
        )

        assert msg.from_id == "slaver_001"
        assert msg.to_id == "master_001"
        assert msg.type == MessageType.STATUS_UPDATE

    def test_is_reply(self):
        msg = Message(
            from_id="test1",
            to_id="test2",
            type=MessageType.STATUS_UPDATE,
            payload={},
            timestamp="2026-04-07T12:00:00Z",
        )
        assert msg.is_reply() is False

        msg.correlation_id = "msg_123"
        assert msg.is_reply() is True


class TestPR:
    """Test PR model."""

    def test_pr_creation(self):
        pr = PR(
            task_id="FEAT-001",
            instance_id="slaver_001",
            branch="feature/FEAT-001",
            description="Test PR",
        )

        assert pr.task_id == "FEAT-001"
        assert pr.status == PRStatus.PENDING_REVIEW

    def test_is_approved(self):
        pr = PR(
            task_id="FEAT-001",
            instance_id="slaver_001",
            branch="feature/FEAT-001",
            description="Test",
        )
        assert pr.is_approved() is False

        pr.review_status = "approved"
        assert pr.is_approved() is True

    def test_is_merged(self):
        pr = PR(
            task_id="FEAT-001",
            instance_id="slaver_001",
            branch="feature/FEAT-001",
            description="Test",
        )
        assert pr.is_merged() is False

        pr.status = PRStatus.MERGED
        assert pr.is_merged() is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
