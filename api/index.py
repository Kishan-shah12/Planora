"""Vercel serverless function entrypoint for Planora."""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root is in sys.path so 'app' and 'wsgi' modules resolve correctly
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from wsgi import app

# Export for Vercel WSGI runtime
handler = app
