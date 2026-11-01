"""Unit tests for planner orchestration and error branches."""
from datetime import timedelta

import pytest

from app.planner import PlanInputError, build_core_plan


def test_build_core_plan_success(valid_wedding_request, today):
    """build_core_plan produces complete core plan with budget, milestones, and vendors."""
    core = build_core_plan(valid_wedding_request, today)
    assert core.days_until == 90
    assert core.per_guest == 5000
    assert len(core.budget_lines) > 0
    assert len(core.milestones) > 0
    assert len(core.vendor_checklist) > 0


def test_build_core_plan_extremely_tight_budget(valid_wedding_request, today):
    """When budget is severely below threshold, advisory warning is surfaced."""
    # Min per guest for wedding is 1500, min/2 is 750. Budget 100,000 / 200 = 500
    tight_req = valid_wedding_request.model_copy(update={"budget": 100_000})
    core = build_core_plan(tight_req, today)
    assert any("significantly below typical averages" in w for w in core.warnings)


def test_build_core_plan_date_in_past(valid_wedding_request, today):
    """build_core_plan raises PlanInputError when date is in the past."""
    past_req = valid_wedding_request.model_copy(update={"event_date": today - timedelta(days=5)})
    with pytest.raises(PlanInputError) as exc:
        build_core_plan(past_req, today)
    assert exc.value.field == "event_date"
    assert "past" in str(exc.value)


def test_build_core_plan_date_too_far_future(valid_wedding_request, today):
    """build_core_plan raises PlanInputError when date is > 3 years ahead."""
    future_req = valid_wedding_request.model_copy(update={"event_date": today + timedelta(days=365 * 4)})
    with pytest.raises(PlanInputError) as exc:
        build_core_plan(future_req, today)
    assert exc.value.field == "event_date"
    assert "next 3 years" in str(exc.value)
