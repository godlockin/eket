#!/usr/bin/env python3
"""
Example: Auto Heartbeat

This example shows how to run automatic heartbeat in background.
"""

import time
import threading
from eket_sdk import EketClient, AgentType, AgentRole, AgentStatus

# Initialize and register
client = EketClient(server_url="http://localhost:8080")
agent = client.register_agent(
    agent_type=AgentType.CUSTOM,
    role=AgentRole.SLAVER,
)

print(f"✅ Registered as {agent.instance_id}")


# Heartbeat thread
class HeartbeatThread(threading.Thread):
    def __init__(self, client: EketClient, interval: int = 60):
        super().__init__(daemon=True)
        self.client = client
        self.interval = interval
        self.running = True
        self.current_task = None
        self.current_status = AgentStatus.IDLE

    def run(self):
        """Send periodic heartbeats."""
        while self.running:
            try:
                response = self.client.send_heartbeat(
                    status=self.current_status, current_task=self.current_task
                )

                # Check for messages
                messages = response.get("messages", [])
                if messages:
                    print(f"📨 Received {len(messages)} message(s)")
                    for msg in messages:
                        print(f"   - {msg.get('type')}: {msg.get('payload')}")

                print(f"💓 Heartbeat sent (status: {self.current_status.value})")

            except Exception as e:
                print(f"❌ Heartbeat failed: {e}")

            time.sleep(self.interval)

    def stop(self):
        """Stop heartbeat thread."""
        self.running = False


# Start heartbeat
heartbeat_thread = HeartbeatThread(client, interval=30)
heartbeat_thread.start()

print("\n💓 Heartbeat started (every 30s)")
print("   Press Ctrl+C to stop\n")

# Simulate work
try:
    for i in range(10):
        time.sleep(5)

        # Simulate status changes
        if i % 3 == 0:
            heartbeat_thread.current_status = AgentStatus.IDLE
        else:
            heartbeat_thread.current_status = AgentStatus.ACTIVE

except KeyboardInterrupt:
    print("\n\n⏹️  Stopping...")

# Clean up
heartbeat_thread.stop()
client.deregister_agent()
client.close()

print("👋 Agent deregistered")
