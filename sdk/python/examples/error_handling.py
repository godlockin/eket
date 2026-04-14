#!/usr/bin/env python3
"""
Example: Error Handling

Demonstrates how to handle common EKET SDK errors gracefully.

Error types:
  - ValidationError  : invalid request data (e.g., missing required fields)
  - AuthenticationError : invalid or expired JWT token
  - NotFoundError    : resource does not exist (agent / task / PR)
  - ConflictError    : resource already claimed or duplicated
  - ServerError      : 5xx response from server
  - EketError        : base class; also covers timeout & connection failures
"""

from eket_sdk import (
    EketClient,
    AgentType,
    AgentRole,
    AgentSpecialty,
    EketError,
    AuthenticationError,
    ValidationError,
    NotFoundError,
    ConflictError,
    ServerError,
)

SERVER_URL = "http://localhost:8080"

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def section(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


# ---------------------------------------------------------------------------
# 1. ValidationError — server rejects bad data (or client-side guard fires)
# ---------------------------------------------------------------------------

section("1. ValidationError — missing / invalid fields")

client = EketClient(server_url=SERVER_URL)

try:
    # deregister_agent() without prior registration → client raises ValidationError
    # because instance_id is None
    client.deregister_agent()
except ValidationError as e:
    print("[CAUGHT ValidationError]")
    print(f"  code    : {e.code}")
    print(f"  message : {e.message}")
    print(f"  details : {e.details}")

# ---------------------------------------------------------------------------
# 2. NotFoundError — resource does not exist
# ---------------------------------------------------------------------------

section("2. NotFoundError — resource not found")

try:
    # Manually set an instance_id so client doesn't raise ValidationError,
    # then attempt to fetch a non-existent agent from the server.
    client.instance_id = "non-existent-agent-id"
    client.get_agent()
except NotFoundError as e:
    print("[CAUGHT NotFoundError]")
    print(f"  code    : {e.code}")
    print(f"  message : {e.message}")
except EketError as e:
    # Server not running → connection error falls under EketError
    print("[CAUGHT EketError — server likely offline]")
    print(f"  code    : {e.code}")
    print(f"  message : {e.message}")
finally:
    client.instance_id = None   # reset

# ---------------------------------------------------------------------------
# 3. AuthenticationError — bad / missing JWT
# ---------------------------------------------------------------------------

section("3. AuthenticationError — invalid JWT token")

client_with_bad_token = EketClient(
    server_url=SERVER_URL,
    jwt_token="invalid.jwt.token",
)
client_with_bad_token.instance_id = "some-instance"

try:
    client_with_bad_token.send_heartbeat()
except AuthenticationError as e:
    print("[CAUGHT AuthenticationError]")
    print(f"  code    : {e.code}")
    print(f"  message : {e.message}")
except EketError as e:
    print("[CAUGHT EketError — server likely offline]")
    print(f"  code    : {e.code}")
    print(f"  message : {e.message}")
finally:
    client_with_bad_token.close()

# ---------------------------------------------------------------------------
# 4. ConflictError — task already claimed
# ---------------------------------------------------------------------------

section("4. ConflictError — task already claimed by another agent")

client.instance_id = "agent-abc"

try:
    client.claim_task("TASK-ALREADY-CLAIMED")
except ConflictError as e:
    print("[CAUGHT ConflictError]")
    print(f"  code    : {e.code}")
    print(f"  message : {e.message}")
except EketError as e:
    print("[CAUGHT EketError — server likely offline]")
    print(f"  code    : {e.code}")
    print(f"  message : {e.message}")
finally:
    client.instance_id = None

# ---------------------------------------------------------------------------
# 5. Connection / timeout — server offline
# ---------------------------------------------------------------------------

section("5. EketError — connection failure (server offline)")

offline_client = EketClient(
    server_url="http://localhost:19999",   # port that is not listening
    timeout=3,
)

try:
    offline_client.health_check()
except EketError as e:
    print("[CAUGHT EketError]")
    print(f"  code    : {e.code}")
    print(f"  message : {e.message}")
finally:
    offline_client.close()

# ---------------------------------------------------------------------------
# 6. Generic catch-all pattern (recommended in production code)
# ---------------------------------------------------------------------------

section("6. Recommended catch-all pattern")


def safe_register(server_url: str) -> None:
    """Register agent with graceful degradation."""
    c = EketClient(server_url=server_url, timeout=5)
    try:
        agent = c.register_agent(
            agent_type=AgentType.CUSTOM,
            role=AgentRole.SLAVER,
            specialty=AgentSpecialty.BACKEND,
        )
        print(f"[OK] Registered as {agent.instance_id}")

    except ValidationError as e:
        print(f"[ERROR] Bad request — fix your parameters: {e.message}")

    except AuthenticationError as e:
        print(f"[ERROR] Auth failed — check your JWT token: {e.message}")

    except ServerError as e:
        print(f"[ERROR] Server error — retry later: {e.message}")

    except EketError as e:
        # Covers: connection errors, timeouts, unexpected HTTP codes
        print(f"[ERROR] SDK error ({e.code}): {e.message}")

    finally:
        c.close()


safe_register(SERVER_URL)

# ---------------------------------------------------------------------------

print(f"\n{'=' * 60}")
print("  Error handling examples complete.")
print("  (NetworkError shown when EKET server is not running)")
print(f"{'=' * 60}\n")
