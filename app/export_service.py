"""Calendar export service creating standard RFC 5545 iCalendar (.ics) files."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from .models import PlanResult


def ics_escape(text: str) -> str:
    """Escape text according to RFC 5545 standards."""
    if not text:
        return ""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def format_date_only(d: date) -> str:
    """Format date as YYYYMMDD for all-day iCalendar events."""
    return d.strftime("%Y%m%d")


def build_icalendar_stream(plan: PlanResult) -> str:
    """Generate a valid, RFC 5545 compliant iCalendar string containing all event milestones."""
    dtstamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Planora//Celebration Planner//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{ics_escape(plan.title)} Milestones",
    ]

    for idx, milestone in enumerate(plan.milestones):
        start_str = format_date_only(milestone.due_date)
        # RFC 5545 all-day events require DTEND to be the day after DTSTART
        end_date = milestone.due_date + timedelta(days=1)
        end_str = format_date_only(end_date)
        uid = f"planora-{idx + 1}-{start_str}-{plan.event_type}@planora.app"
        summary = f"[{plan.title}] {milestone.task}"
        description = (
            f"Celebration Milestone: {milestone.task}\\n"
            f"Category: {milestone.category}\\n"
            f"Priority: {milestone.priority.upper()}\\n"
            f"Days relative to planning: {milestone.days_from_today} day(s)\\n"
            f"Event Location: {plan.city}"
        )

        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{dtstamp}",
            f"DTSTART;VALUE=DATE:{start_str}",
            f"DTEND;VALUE=DATE:{end_str}",
            f"SUMMARY:{ics_escape(summary)}",
            f"DESCRIPTION:{description}",
            f"CATEGORIES:{ics_escape(milestone.category)}",
            "STATUS:CONFIRMED",
            "TRANSP:TRANSPARENT",
            "END:VEVENT",
        ])

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
