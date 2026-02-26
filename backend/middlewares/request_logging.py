from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from middlewares.request_context import set_request_id

logger = logging.getLogger("api.request")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Attach request id and emit one structured log line per request."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        set_request_id(request_id)
        request.state.request_id = request_id

        start = time.perf_counter()
        status_code = 500
        try:
            response: Response = await call_next(request)
            status_code = response.status_code
        except Exception:
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.exception(
                "request_failed method=%s path=%s status=%s duration_ms=%s request_id=%s",
                request.method,
                request.url.path,
                status_code,
                duration_ms,
                request_id,
            )
            raise

        duration_ms = int((time.perf_counter() - start) * 1000)
        logger.info(
            "request_completed method=%s path=%s status=%s duration_ms=%s request_id=%s",
            request.method,
            request.url.path,
            status_code,
            duration_ms,
            request_id,
        )
        response.headers["X-Request-ID"] = request_id
        return response
