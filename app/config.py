"""Application configuration and environment settings."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "planora-celebration-dev-key-change-in-prod")
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    MAX_CONTENT_LENGTH = 32 * 1024  # 32 KB maximum request payload to prevent DoS
    RATE_LIMIT_REQUESTS = int(os.environ.get("RATE_LIMIT_REQUESTS", "30"))
    RATE_LIMIT_WINDOW = float(os.environ.get("RATE_LIMIT_WINDOW", "60.0"))
