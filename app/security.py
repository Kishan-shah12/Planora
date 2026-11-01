"""Input sanitisation, prompt-injection screening, sliding-window rate limiting, and HTTP security headers."""
from __future__ import annotations

import re
import threading
import time
import unicodedata
from collections import deque
from collections.abc import Callable

from flask import Response, request

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_ANGLE_BRACKETS = re.compile(r"[<>]")
_WHITESPACE = re.compile(r"\s+")

# Comprehensive prompt injection detection covering evasive directives, role impersonation, and delimiter exploits
_INJECTION_PATTERN = re.compile(
    r"(ignore|disregard|forget|override|bypass)\s+(all\s+|any\s+|the\s+|your\s+|previous\s+|prior\s+|above\s+)*"
    r"(instructions?|prompts?|rules?|directives?)"
    r"|system\s+prompt|developer\s+(message|mode|instructions?)"
    r"|you\s+are\s+now\s+(an?|the|unrestricted)?"
    r"|act\s+as\s+(\w+|an?|the)"
    r"|reveal\s+(your|the)\s+(prompt|instructions|system\s+rules)"
    r"|<system>|\[SYSTEM\]|<\/?event_data>"
    r"|jailbreak|\bDAN\b|DAN\s+mode|unrestricted\s+mode",
    re.IGNORECASE,
)


def clean_text(value: str) -> str:
    """Normalise free text: Unicode NFKC, strip control chars and angle brackets, collapse whitespace."""
    if not isinstance(value, str):
        return ""
    text = unicodedata.normalize("NFKC", value)
    text = _CONTROL_CHARS.sub(" ", text)
    text = _ANGLE_BRACKETS.sub("", text)
    return _WHITESPACE.sub(" ", text).strip()


def looks_like_injection(value: str) -> bool:
    """Return True when text resembles an attempt to override model instructions."""
    if not value or not isinstance(value, str):
        return False
    return bool(_INJECTION_PATTERN.search(value))


class RateLimiter:
    """Thread-safe sliding-window rate limiter keyed by client identifier."""

    _SWEEP_THRESHOLD = 5_000

    def __init__(
        self,
        limit: int = 30,
        window_seconds: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._limit = limit
        self._window = window_seconds
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> tuple[bool, int]:
        """Record a hit. Returns (allowed, retry_after_seconds)."""
        now = self._clock()
        with self._lock:
            if len(self._hits) > self._SWEEP_THRESHOLD:
                self._sweep(now)
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= self._window:
                hits.popleft()
            if len(hits) >= self._limit:
                retry_after = max(1, int(self._window - (now - hits[0])) + 1)
                return False, retry_after
            hits.append(now)
            return True, 0

    def _sweep(self, now: float) -> None:
        stale = [k for k, h in self._hits.items() if not h or now - h[-1] >= self._window]
        for key in stale:
            del self._hits[key]


def get_client_ip() -> str:
    """Safely extract the client IP address from proxy headers or remote address."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # First IP in the list is the client IP
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "127.0.0.1"


_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: https:; "
    "connect-src 'self'; "
    "base-uri 'none'; "
    "form-action 'self'; "
    "frame-ancestors 'none'"
)


def apply_security_headers(response: Response) -> Response:
    """Attach defensive HTTP security headers to every response."""
    response.headers["Content-Security-Policy"] = _CSP
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    elif request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response
