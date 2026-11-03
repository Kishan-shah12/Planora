"""Vercel serverless function entrypoint for Planora."""

from __future__ import annotations

import sys
import traceback
from pathlib import Path
from typing import Any

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

init_error: str | None = None
flask_app: Any = None

try:
    from app import create_app

    template_dir = str((ROOT_DIR / "app" / "templates").resolve())
    static_dir = str((ROOT_DIR / "app" / "static").resolve())

    flask_app = create_app()
    flask_app.template_folder = template_dir
    flask_app.static_folder = static_dir
except Exception:
    init_error = traceback.format_exc()


def app(environ: dict[str, Any], start_response: Any) -> list[bytes]:
    """WSGI callable for Vercel serverless function invocation."""
    if init_error:
        status = "500 Internal Server Error"
        response_headers = [("Content-Type", "text/plain; charset=utf-8")]
        start_response(status, response_headers)
        return [f"Startup Initialization Error:\n\n{init_error}".encode()]
    try:
        # pyrefly: ignore[bad-return]
        return flask_app(environ, start_response)
    except Exception:
        status = "500 Internal Server Error"
        response_headers = [("Content-Type", "text/plain; charset=utf-8")]
        start_response(status, response_headers)
        return [f"Runtime Execution Error:\n\n{traceback.format_exc()}".encode()]


# Handlers for Vercel WSGI detection
handler = app
application = app
