"""
EKET SDK Utilities

Helper functions and utilities for EKET SDK.
"""

import time
from typing import Callable, TypeVar, Any
from functools import wraps

T = TypeVar("T")


def retry_with_backoff(
    max_retries: int = 5,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    max_delay: float = 60.0,
):
    """
    Decorator for retrying functions with exponential backoff.

    Args:
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
        backoff_factor: Multiplier for delay after each retry
        max_delay: Maximum delay between retries

    Example:
        >>> @retry_with_backoff(max_retries=3)
        ... def unstable_operation():
        ...     # might fail sometimes
        ...     pass
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            delay = initial_delay
            last_exception = None

            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt == max_retries - 1:
                        raise

                    # Calculate next delay
                    time.sleep(min(delay, max_delay))
                    delay *= backoff_factor

            # This should never be reached, but satisfy type checker
            if last_exception:
                raise last_exception
            return func(*args, **kwargs)

        return wrapper

    return decorator


def validate_task_id(task_id: str) -> bool:
    """
    Validate task ID format.

    Task IDs should match pattern: [A-Z]+-\\d+ (e.g., FEAT-001)

    Args:
        task_id: Task ID to validate

    Returns:
        True if valid, False otherwise
    """
    import re

    return bool(re.match(r"^[A-Z]+-\d+$", task_id))


def format_duration(seconds: float) -> str:
    """
    Format duration in human-readable format.

    Args:
        seconds: Duration in seconds

    Returns:
        Formatted string (e.g., "2h 30m", "45s")
    """
    if seconds < 60:
        return f"{int(seconds)}s"

    minutes = int(seconds // 60)
    if minutes < 60:
        return f"{minutes}m"

    hours = minutes // 60
    remaining_minutes = minutes % 60
    if remaining_minutes > 0:
        return f"{hours}h {remaining_minutes}m"
    return f"{hours}h"


def parse_estimate(estimate: str) -> int:
    """
    Parse time estimate to seconds.

    Supports formats: 8h, 2d, 30m

    Args:
        estimate: Time estimate string

    Returns:
        Duration in seconds
    """
    import re

    match = re.match(r"^(\d+)([hdmw])$", estimate.lower())
    if not match:
        raise ValueError(f"Invalid estimate format: {estimate}")

    value, unit = match.groups()
    value = int(value)

    multipliers = {
        "m": 60,  # minutes
        "h": 3600,  # hours
        "d": 86400,  # days
        "w": 604800,  # weeks
    }

    return value * multipliers[unit]


def truncate_string(text: str, max_length: int = 80, suffix: str = "...") -> str:
    """
    Truncate string to maximum length.

    Args:
        text: Text to truncate
        max_length: Maximum length
        suffix: Suffix to append if truncated

    Returns:
        Truncated string
    """
    if len(text) <= max_length:
        return text
    return text[: max_length - len(suffix)] + suffix
