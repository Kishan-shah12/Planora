"""Deterministic planning orchestration module.

Synthesizes budget allocation, adaptive timelines, and vendor checklists
entirely in deterministic code with zero AI dependency.
"""
from __future__ import annotations

from datetime import date

from .budget_engine import (
    BUDGET_PROFILES,
    allocate_budget_largest_remainder,
    compute_adjusted_splits,
)
from .models import CorePlan, PlanRequest
from .timeline_engine import build_adaptive_timeline
from .vendor_engine import build_vendor_groups


class PlanInputError(ValueError):
    """Raised when request data is well-formed schema-wise but violates business constraints."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field


def build_core_plan(request: PlanRequest, today: date) -> CorePlan:
    """Produce the complete deterministic plan structure."""
    days_until = (request.event_date - today).days
    if days_until < 0:
        raise PlanInputError("event_date", "The celebration date cannot be in the past.")
    if days_until > 365 * 3:
        raise PlanInputError("event_date", "Please choose a date within the next 3 years.")

    per_guest = request.budget // max(1, request.guest_count)

    # 1. Budget allocation
    splits, budget_notes = compute_adjusted_splits(request, days_until)
    budget_lines = allocate_budget_largest_remainder(request.budget, splits, request.event_type)

    # 2. Adaptive timeline
    milestones, timeline_notes = build_adaptive_timeline(request, today)

    # 3. Vendor checklists
    vendor_checklist = build_vendor_groups(request.event_type)

    # 4. Warnings aggregation
    all_warnings: list[str] = []
    all_warnings.extend(budget_notes)
    all_warnings.extend(timeline_notes)

    profile = BUDGET_PROFILES[request.event_type]
    if per_guest < (profile.min_per_guest_threshold // 2):
        all_warnings.append(
            f"Note: Rs {per_guest:,} per guest is significantly below typical averages for {request.event_type}s. "
            "Consider hosting at a home/community facility or reducing the guest list."
        )

    return CorePlan(
        days_until=days_until,
        per_guest=per_guest,
        budget_lines=budget_lines,
        milestones=milestones,
        vendor_checklist=vendor_checklist,
        warnings=all_warnings,
    )
