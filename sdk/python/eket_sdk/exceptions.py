"""
EKET SDK Exceptions

Custom exception classes for EKET SDK error handling.
"""


class EketError(Exception):
    """Base exception for all EKET SDK errors."""

    def __init__(self, message: str, code: str = "UNKNOWN", details: dict = None):
        """
        Initialize EKET error.

        Args:
            message: Human-readable error message
            code: Error code from API
            details: Additional error details
        """
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}

    def __str__(self) -> str:
        """String representation of error."""
        if self.details:
            return f"{self.code}: {self.message} (details: {self.details})"
        return f"{self.code}: {self.message}"


class AuthenticationError(EketError):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Authentication failed", details: dict = None):
        super().__init__(message, "UNAUTHORIZED", details)


class ValidationError(EketError):
    """Raised when request validation fails."""

    def __init__(self, message: str = "Validation error", details: dict = None):
        super().__init__(message, "VALIDATION_ERROR", details)


class NotFoundError(EketError):
    """Raised when a resource is not found."""

    def __init__(self, message: str = "Resource not found", details: dict = None):
        super().__init__(message, "NOT_FOUND", details)


class ConflictError(EketError):
    """Raised when a resource conflict occurs."""

    def __init__(self, message: str = "Resource conflict", details: dict = None):
        super().__init__(message, "CONFLICT", details)


class ServerError(EketError):
    """Raised when the server encounters an error."""

    def __init__(self, message: str = "Server error", details: dict = None):
        super().__init__(message, "INTERNAL_ERROR", details)


class ServiceUnavailableError(EketError):
    """Raised when a service is temporarily unavailable."""

    def __init__(self, message: str = "Service unavailable", details: dict = None):
        super().__init__(message, "SERVICE_UNAVAILABLE", details)
