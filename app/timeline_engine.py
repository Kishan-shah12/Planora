"""Adaptive timeline milestone generator.

Generates chronological, non-overlapping milestones calibrated to actual lead time.
Distinguishes short-notice emergencies (< 14 days) from multi-month planning.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from .models import Milestone, PlanRequest, TaskPriority

MAX_PLANNING_DAYS = 365 * 3  # Up to 3 years ahead


@dataclass(frozen=True)
class MilestoneTemplate:
    """Template for an event milestone with ideal lead time."""

    ideal_days_before: int  # Days before event date (positive = before, 0 = day of, negative = after)
    task: str
    category: str
    default_priority: TaskPriority
    is_critical_path: bool = False


TIMELINE_TEMPLATES: dict[str, list[MilestoneTemplate]] = {
    "wedding": [
        MilestoneTemplate(180, "Establish total budget, define preliminary guest list, and secure celebration date", "Planning", "critical", True),
        MilestoneTemplate(165, "Shortlist and book primary ceremony & reception banquet venues", "Venue", "critical", True),
        MilestoneTemplate(150, "Interview and book premium wedding photographer and videographer", "Vendors", "high", True),
        MilestoneTemplate(120, "Select bridal/groom attire; book makeup, hair, and mehendi artists", "Attire", "high"),
        MilestoneTemplate(90, "Finalise floral theme, mandap/stage styling, and send digital Save-the-Dates", "Decor", "medium"),
        MilestoneTemplate(60, "Dispatch formal invitations, launch RSVP tracker, and confirm DJ/entertainment", "Guests", "high", True),
        MilestoneTemplate(45, "Arrange out-of-town guest accommodations and inter-venue transportation", "Logistics", "medium"),
        MilestoneTemplate(30, "Conduct catering tasting, finalize banquet menu, and check dietary needs", "Catering", "high", True),
        MilestoneTemplate(14, "Re-confirm all vendor contracts, backup power, arrival times, and final RSVPs", "Vendors", "critical", True),
        MilestoneTemplate(7, "Finalise seating layout, bridal procession timeline, and vendor payment schedule", "Logistics", "high"),
        MilestoneTemplate(2, "Pack bridal emergency repair kit and brief master of ceremonies/family leads", "Preparation", "high"),
        MilestoneTemplate(0, "Event Day: Designate single vendor contact lead and execute celebration", "Event Day", "critical", True),
        MilestoneTemplate(-3, "Review photographer sneak-peek preview and settle final vendor balances", "Post Event", "normal"),
        MilestoneTemplate(-7, "Send personalized thank-you messages and archive wedding memories", "Post Event", "normal"),
    ],
    "birthday": [
        MilestoneTemplate(45, "Define party theme, draft guest headcount, and set maximum budget limit", "Planning", "high", True),
        MilestoneTemplate(35, "Reserve private party hall, play arena, or prep home venue setup", "Venue", "critical", True),
        MilestoneTemplate(28, "Book entertainer, game coordinator, magician, or activity booths", "Entertainment", "high"),
        MilestoneTemplate(21, "Order custom centerpiece cake, dessert table, and approve snack menu", "Catering", "high", True),
        MilestoneTemplate(14, "Dispatch digital invitations and request dietary/allergy notes in RSVPs", "Guests", "medium"),
        MilestoneTemplate(7, "Procure party favors, themed decor, balloons, and customized photo backdrop", "Decor", "medium"),
        MilestoneTemplate(3, "Re-confirm final guest headcount with caterer and prepare games playlist", "Vendors", "high", True),
        MilestoneTemplate(1, "Pick up custom cake order, decorate party space, and charge camera gear", "Preparation", "high"),
        MilestoneTemplate(0, "Event Day: Welcome guests, run activities, cake cutting, and group photos", "Event Day", "critical", True),
        MilestoneTemplate(-2, "Send thank-you messages with candid photo album link to families", "Post Event", "normal"),
    ],
    "community": [
        MilestoneTemplate(60, "Establish organizing committee, event purpose, and civic approval scope", "Planning", "critical", True),
        MilestoneTemplate(50, "Submit local municipality/police permissions, safety clearance, and secure ground", "Venue & Permits", "critical", True),
        MilestoneTemplate(40, "Mobilize community volunteer captains and assign functional zone leads", "Volunteers", "high"),
        MilestoneTemplate(30, "Procure high-output sound/PA system, stage riser, and power backup generator", "Equipment", "high", True),
        MilestoneTemplate(21, "Launch public promotional campaign: banners, WhatsApp blasts, and local notices", "Marketing", "medium"),
        MilestoneTemplate(14, "Confirm guest dignitaries, performers, emcee script, and sequence of events", "Program", "high"),
        MilestoneTemplate(7, "Inspect step-free ramps, mark emergency evacuation exits, and prep first-aid tent", "Safety & Inclusivity", "critical", True),
        MilestoneTemplate(2, "Volunteer walkthrough, run audio sound-check, and mount directional signage", "Preparation", "high"),
        MilestoneTemplate(0, "Event Day: Coordinate stage flow, manage crowd movement, and oversee refreshments", "Event Day", "critical", True),
        MilestoneTemplate(-3, "Complete ground teardown, waste recycling audit, and settle volunteer expenses", "Post Event", "high"),
        MilestoneTemplate(-7, "Publish community financial ledger transparency report and community thank-you note", "Post Event", "normal"),
    ],
}


def build_adaptive_timeline(request: PlanRequest, today: date) -> tuple[list[Milestone], list[str]]:
    """Construct an adaptive chronological milestone schedule.

    Adapts proportionally to lead time:
    - Long lead time (> 90 days): comfortable spacing.
    - Medium lead time (15 - 90 days): proportional scaling.
    - Short lead time (< 14 days): urgent compression with staged distribution across available days.
    """
    days_until = (request.event_date - today).days
    warnings: list[str] = []

    if days_until < 0:
        raise ValueError("Event date cannot be in the past.")
    if days_until > MAX_PLANNING_DAYS:
        raise ValueError("Please select a celebration date within the next 3 years.")

    templates = TIMELINE_TEMPLATES[request.event_type]
    longest_ideal = max(t.ideal_days_before for t in templates)

    milestones: list[Milestone] = []

    if days_until == 0:
        warnings.append("Event is happening TODAY! All critical preparation tasks are due immediately.")
        for idx, t in enumerate(templates):
            if t.ideal_days_before >= 0:
                due = today
                prio: TaskPriority = "critical" if t.is_critical_path else "high"
            else:
                due = today + timedelta(days=abs(t.ideal_days_before))
                prio = "normal"
            milestones.append(
                Milestone(
                    id=f"m-{idx + 1}",
                    due_date=due,
                    days_from_today=(due - today).days,
                    task=t.task,
                    category=t.category,
                    priority=prio,
                    is_urgent=(due == today),
                )
            )
    elif days_until < 14:
        warnings.append(
            f"Urgent timeline ({days_until} days to go): Tasks have been compressed into an accelerated track. "
            "Prioritize venue, catering, and core permits today!"
        )
        # Distribute pre-event tasks across [0 .. days_until] to avoid overwhelming day 0
        pre_event_templates = [t for t in templates if t.ideal_days_before > 0]
        post_event_templates = [t for t in templates if t.ideal_days_before <= 0]

        total_pre = len(pre_event_templates)
        for idx, t in enumerate(pre_event_templates):
            # Spread tasks across available days based on urgency ranking
            day_offset = int((idx / max(1, total_pre - 1)) * max(0, days_until - 1))
            due = today + timedelta(days=day_offset)
            days_from_now = (due - today).days
            prio: TaskPriority = "critical" if t.is_critical_path or days_from_now == 0 else t.default_priority
            milestones.append(
                Milestone(
                    id=f"m-{idx + 1}",
                    due_date=due,
                    days_from_today=days_from_now,
                    task=t.task,
                    category=t.category,
                    priority=prio,
                    is_urgent=(days_from_now <= 2),
                )
            )

        # Append event day & post-event tasks
        offset_idx = len(pre_event_templates)
        for idx, t in enumerate(post_event_templates):
            if t.ideal_days_before == 0:
                due = request.event_date
                prio = "critical"
            else:
                due = request.event_date + timedelta(days=abs(t.ideal_days_before))
                prio = t.default_priority
            days_from_now = (due - today).days
            milestones.append(
                Milestone(
                    id=f"m-{offset_idx + idx + 1}",
                    due_date=due,
                    days_from_today=days_from_now,
                    task=t.task,
                    category=t.category,
                    priority=prio,
                    is_urgent=(days_from_now == 0),
                )
            )
    else:
        # Standard or comfortable timeline with proportional scale
        scale = min(1.0, days_until / longest_ideal)
        if scale < 1.0:
            warnings.append(
                f"Timeline adjusted for {days_until} days lead time: early milestones have been accelerated."
            )

        for idx, t in enumerate(templates):
            if t.ideal_days_before > 0:
                scaled_offset = max(1, round(t.ideal_days_before * scale))
                due = request.event_date - timedelta(days=scaled_offset)
                due = max(due, today)  # Never schedule prior to today
            elif t.ideal_days_before == 0:
                due = request.event_date
            else:
                due = request.event_date + timedelta(days=abs(t.ideal_days_before))

            days_from_now = (due - today).days
            is_urgent = (days_from_now <= 3 and t.ideal_days_before >= 0)
            prio = "critical" if (is_urgent and t.is_critical_path) else t.default_priority

            milestones.append(
                Milestone(
                    id=f"m-{idx + 1}",
                    due_date=due,
                    days_from_today=days_from_now,
                    task=t.task,
                    category=t.category,
                    priority=prio,
                    is_urgent=is_urgent,
                )
            )

    # Sort strictly by due date, then by priority weight
    priority_order = {"critical": 0, "high": 1, "medium": 2, "normal": 3, "low": 4}
    milestones.sort(key=lambda m: (m.due_date, priority_order.get(m.priority, 2)))

    return milestones, warnings
