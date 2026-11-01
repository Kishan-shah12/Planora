"""Unit tests for calendar RFC 5545 iCalendar (.ics) generation."""
from datetime import date

from app.export_service import build_icalendar_stream, ics_escape
from app.models import AIInsights, BudgetLine, Milestone, PlanResult


def test_ics_escape_characters():
    """ics_escape escapes commas, semicolons, backslashes, and newlines."""
    raw = "Venue, Hall; Main Street \\ Stage\nSecond line"
    escaped = ics_escape(raw)
    assert "\\," in escaped
    assert "\\;" in escaped
    assert "\\\\" in escaped
    assert "\\n" in escaped


def test_build_icalendar_stream_rfc5545_compliance():
    """Generated iCalendar stream adheres strictly to RFC 5545 syntax."""
    plan = PlanResult(
        title="Diya & Aarav's Wedding",
        event_type="wedding",
        event_date=date(2027, 2, 20),
        city="Bengaluru",
        guest_count=200,
        budget=1000000,
        days_until=100,
        per_guest=5000,
        budget_lines=[
            BudgetLine(category="Venue", percent=100, amount_paise=100000000, amount=1000000, estimated_amount=1000000),
        ],
        milestones=[
            Milestone(
                id="m-1",
                due_date=date(2027, 2, 10),
                days_from_today=90,
                task="Confirm venue booking",
                category="Venue",
                priority="critical",
                is_urgent=False,
            ),
            Milestone(
                id="m-2",
                due_date=date(2027, 2, 20),
                days_from_today=100,
                task="Event Day Ceremony",
                category="Event Day",
                priority="critical",
                is_urgent=True,
            ),
        ],
        vendor_checklist=[],
        warnings=[],
        insights=AIInsights(
            summary="Celebration summary",
            ideas=[],
            checklist_extras=[],
            saving_tips=[],
        ),
        ai_source="fallback",
    )

    ics = build_icalendar_stream(plan)

    # RFC 5545 requirements
    assert "BEGIN:VCALENDAR\r\n" in ics
    assert "VERSION:2.0\r\n" in ics
    assert "PRODID:-//Planora//Celebration Planner//EN\r\n" in ics
    assert "END:VCALENDAR\r\n" in ics

    # VEVENT checks
    assert ics.count("BEGIN:VEVENT") == 2
    assert ics.count("END:VEVENT") == 2

    # Date formatting: DTSTART;VALUE=DATE:20270210
    assert "DTSTART;VALUE=DATE:20270210" in ics
    # DTEND should be the day after DTSTART
    assert "DTEND;VALUE=DATE:20270211" in ics
    assert "UID:planora-1-20270210-wedding@planora.app" in ics
    assert "SUMMARY:[Diya & Aarav's Wedding] Confirm venue booking" in ics
