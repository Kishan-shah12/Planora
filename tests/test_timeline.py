"""Unit tests for adaptive milestone timeline generation and date edge cases."""
from datetime import date, timedelta

import pytest

from app.models import PlanRequest
from app.timeline_engine import build_adaptive_timeline


def test_timeline_chronological_ordering(valid_wedding_request, today):
    """Generated milestones must be strictly sorted chronologically."""
    milestones, _ = build_adaptive_timeline(valid_wedding_request, today)
    assert len(milestones) > 0
    for i in range(len(milestones) - 1):
        assert milestones[i].due_date <= milestones[i + 1].due_date


def test_timeline_never_schedules_in_the_past(valid_wedding_request, today):
    """No milestone due date may precede the 'today' reference date."""
    # Test short notice where ideal offsets would have fallen weeks before today
    short_req = valid_wedding_request.model_copy(update={"event_date": today + timedelta(days=5)})
    milestones, warnings = build_adaptive_timeline(short_req, today)

    for m in milestones:
        assert m.due_date >= today, f"Milestone '{m.task}' due {m.due_date} is in the past relative to {today}"
    assert any("Urgent timeline" in w for w in warnings)


def test_timeline_event_today(valid_birthday_request, today):
    """An event scheduled for today sets all prep tasks due today with critical priority."""
    today_req = valid_birthday_request.model_copy(update={"event_date": today})
    milestones, warnings = build_adaptive_timeline(today_req, today)

    assert any("TODAY" in w for w in warnings)
    prep_milestones = [m for m in milestones if m.category != "Post Event"]
    for m in prep_milestones:
        assert m.due_date == today
        assert m.is_urgent is True


def test_timeline_past_date_raises_error(valid_wedding_request, today):
    """An event date in the past must be rejected."""
    past_req = valid_wedding_request.model_copy(update={"event_date": today - timedelta(days=1)})
    with pytest.raises(ValueError, match="Event date cannot be in the past"):
        build_adaptive_timeline(past_req, today)


def test_timeline_beyond_max_planning_window(valid_wedding_request, today):
    """Dates beyond 3 years ahead must be rejected."""
    future_req = valid_wedding_request.model_copy(update={"event_date": today + timedelta(days=365 * 4)})
    with pytest.raises(ValueError, match="within the next 3 years"):
        build_adaptive_timeline(future_req, today)


def test_timeline_leap_year_handling():
    """Milestone generation across leap year boundary (February 29) succeeds accurately."""
    # Reference year 2028 is a leap year
    ref_today = date(2028, 1, 15)
    leap_event_date = date(2028, 3, 5)  # 50 days ahead, spans Feb 29, 2028
    req = PlanRequest(
        event_type="wedding",
        title="Leap Year Celebration",
        guest_count=100,
        budget=500_000,
        event_date=leap_event_date,
        city="Chennai",
    )
    milestones, _ = build_adaptive_timeline(req, ref_today)
    assert any(m.due_date.month == 2 for m in milestones)
    for m in milestones:
        assert m.due_date >= ref_today


def test_timeline_month_boundary_transitions(today):
    """Timeline calculation cleanly spans calendar month boundaries without offsets."""
    req = PlanRequest(
        event_type="community",
        title="Holi Festival",
        guest_count=300,
        budget=200_000,
        event_date=date(2026, 12, 5),  # Month transition from Nov to Dec
        city="Delhi",
    )
    milestones, _ = build_adaptive_timeline(req, today)
    assert len(milestones) > 0
    assert milestones[-1].due_date >= req.event_date
