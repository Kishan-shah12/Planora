"""Pytest test configuration and fixtures."""
from datetime import date, timedelta

import pytest

from app import create_app
from app.models import PlanRequest


@pytest.fixture
def app():
    """Create test application instance with testing configuration."""
    test_config = {
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "GEMINI_API_KEY": "",  # Force deterministic offline mode
        "MAX_CONTENT_LENGTH": 32 * 1024,
    }
    app = create_app(test_config)
    return app


@pytest.fixture
def client(app):
    """Test client for API testing."""
    return app.test_client()


@pytest.fixture
def today():
    """Fixed reference date for consistent test calculations."""
    return date(2026, 11, 1)


@pytest.fixture
def valid_wedding_request(today):
    """A valid wedding planning request fixture."""
    return PlanRequest(
        event_type="wedding",
        title="Pooja & Rohan's Wedding",
        guest_count=200,
        budget=1_000_000,
        event_date=today + timedelta(days=90),
        city="Mumbai",
        preferences="Vegetarian catering, traditional music",
        style_priorities="Temple elegance, high priority on photography",
        planning_notes="Morning ceremony",
    )


@pytest.fixture
def valid_birthday_request(today):
    """A valid birthday planning request fixture."""
    return PlanRequest(
        event_type="birthday",
        title="Ananya's 5th Birthday Party",
        guest_count=40,
        budget=25_000,
        event_date=today + timedelta(days=20),
        city="Bengaluru",
        preferences="Eggless chocolate cake, nut-free snacks",
        style_priorities="Fairytale castle theme",
        planning_notes="Afternoon party",
    )


@pytest.fixture
def valid_community_request(today):
    """A valid community gathering request fixture."""
    return PlanRequest(
        event_type="community",
        title="Diwali Community Melawa",
        guest_count=400,
        budget=300_000,
        event_date=today + timedelta(days=40),
        city="Pune",
        preferences="Step-free wheelchair ramp, vegetarian snacks",
        style_priorities="Cultural dance stage, eco-friendly diyas",
        planning_notes="Police permission till 10 PM",
    )
