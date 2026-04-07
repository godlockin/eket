#!/usr/bin/env python3
"""
Verify EKET SDK Installation

Quick script to verify that EKET SDK is installed correctly.
"""

import sys


def check_import():
    """Check if eket_sdk can be imported."""
    try:
        import eket_sdk

        print(f"✅ eket_sdk imported successfully")
        print(f"   Version: {eket_sdk.__version__}")
        print(f"   Protocol: {eket_sdk.__protocol_version__}")
        return True
    except ImportError as e:
        print(f"❌ Failed to import eket_sdk: {e}")
        return False


def check_dependencies():
    """Check if all dependencies are available."""
    dependencies = {
        "requests": "HTTP client library",
    }

    all_ok = True
    print("\n📦 Checking Dependencies:")
    for dep, desc in dependencies.items():
        try:
            __import__(dep)
            print(f"   ✅ {dep}: {desc}")
        except ImportError:
            print(f"   ❌ {dep}: Missing! ({desc})")
            all_ok = False

    return all_ok


def check_models():
    """Check if models can be imported."""
    try:
        from eket_sdk import (
            Agent,
            Task,
            Message,
            PR,
            AgentType,
            AgentRole,
            AgentStatus,
            TaskStatus,
            MessageType,
        )

        print("\n📋 Checking Models:")
        print("   ✅ All models imported successfully")
        return True
    except ImportError as e:
        print(f"\n❌ Failed to import models: {e}")
        return False


def check_client():
    """Check if client can be instantiated."""
    try:
        from eket_sdk import EketClient

        client = EketClient(server_url="http://localhost:8080")
        print("\n🔧 Checking Client:")
        print("   ✅ EketClient instantiated successfully")
        print(f"   Server URL: {client.server_url}")
        print(f"   Protocol: {client.protocol_version}")
        client.close()
        return True
    except Exception as e:
        print(f"\n❌ Failed to instantiate client: {e}")
        return False


def main():
    """Run all checks."""
    print("=" * 60)
    print("EKET SDK Installation Verification")
    print("=" * 60)

    checks = [
        check_import,
        check_dependencies,
        check_models,
        check_client,
    ]

    results = [check() for check in checks]

    print("\n" + "=" * 60)
    if all(results):
        print("✅ All checks passed!")
        print("\nYou can now use EKET SDK.")
        print("\nQuick start:")
        print("  from eket_sdk import EketClient, AgentType, AgentRole")
        print('  client = EketClient(server_url="http://localhost:8080")')
        print("  agent = client.register_agent(")
        print("      agent_type=AgentType.CUSTOM,")
        print("      role=AgentRole.SLAVER")
        print("  )")
        return 0
    else:
        print("❌ Some checks failed!")
        print("\nPlease install missing dependencies:")
        print("  pip install -e .")
        return 1


if __name__ == "__main__":
    sys.exit(main())
