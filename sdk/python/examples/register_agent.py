#!/usr/bin/env python3
"""
Example: Register an Agent

This example shows how to register an AI agent with the EKET server.
"""

from eket_sdk import EketClient, AgentType, AgentRole, AgentSpecialty

# Initialize client
client = EketClient(server_url="http://localhost:8080")

# Register agent
agent = client.register_agent(
    agent_type=AgentType.CUSTOM,
    role=AgentRole.SLAVER,
    specialty=AgentSpecialty.BACKEND,
    capabilities=["python", "fastapi", "postgresql"],
    metadata={
        "user": "developer",
        "machine": "workstation-01",
        "timezone": "Asia/Shanghai",
    },
)

print(f"✅ Agent registered successfully!")
print(f"   Instance ID: {agent.instance_id}")
print(f"   Role: {agent.role.value}")
print(f"   Specialty: {agent.specialty.value}")
print(f"   Status: {agent.status.value}")
print(f"\n💡 JWT Token stored in client (for future requests)")

# Check server health
health = client.health_check()
print(f"\n🏥 Server Health:")
print(f"   Status: {health.get('status')}")
print(f"   Version: {health.get('version')}")
print(f"   Uptime: {health.get('uptime')}s")

# List all agents
print(f"\n👥 All Registered Agents:")
all_agents = client.list_agents()
for a in all_agents:
    print(f"   - {a.instance_id} ({a.role.value}/{a.specialty.value if a.specialty else 'N/A'})")

# Clean up
client.close()
