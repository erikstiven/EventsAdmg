import logging

from fastapi import HTTPException
from middlewares.request_context import get_request_id


def raise_internal_server_error(
    logger: logging.Logger,
    context: str,
    exc: Exception,
    *,
    expose_exception: bool = True,
) -> None:
    """Log the exception and raise a standardized internal server error."""
    request_id = get_request_id()
    logger.error("%s: %s | request_id=%s", context, str(exc), request_id, exc_info=True)
    detail = f"Internal server error: {str(exc)}" if expose_exception else "Internal server error"
    raise HTTPException(status_code=500, detail=detail)


def raise_bad_request_from_value_error(exc: ValueError) -> None:
    """Convert value errors to HTTP 400 preserving original message."""
    raise HTTPException(status_code=400, detail=str(exc))
