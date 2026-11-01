"""Unit tests for budget calculations, largest-remainder allocation, and live expense ledger."""
import pytest

from app.budget_engine import (
    BUDGET_PROFILES,
    CONTINGENCY,
    allocate_budget_largest_remainder,
    compute_adjusted_splits,
    reconcile_budget_ledger,
)
from app.models import BudgetLine


@pytest.mark.parametrize("budget", [1_000, 1_001, 7_777, 25_000, 100_003, 1_234_567, 50_000_000, 100_000_000])
@pytest.mark.parametrize("event_type", ["wedding", "birthday", "community"])
def test_budget_largest_remainder_exact_sum(budget, event_type):
    """The sum of allocated category amounts must exactly equal the budget for any number."""
    profile = BUDGET_PROFILES[event_type]
    lines = allocate_budget_largest_remainder(budget, profile.base_splits, event_type)

    total_allocated = sum(b.amount for b in lines)
    assert total_allocated == budget, f"Expected {budget}, got {total_allocated}"

    total_paise = sum(b.amount_paise for b in lines)
    assert total_paise == budget * 100, f"Expected {budget * 100} paise, got {total_paise}"

    total_pct = sum(b.percent for b in lines)
    assert total_pct == 100


def test_budget_splits_total_100_validation():
    """allocate_budget_largest_remainder raises ValueError if percentages do not sum to 100."""
    invalid_splits = {"Venue": 50, "Catering": 40}  # 90%
    with pytest.raises(ValueError, match="Category splits must sum to exactly 100%"):
        allocate_budget_largest_remainder(10_000, invalid_splits, "wedding")


def test_tight_budget_shifts_points(valid_wedding_request):
    """When budget per guest is low, points shift from flex category to essential category."""
    # Normal per-guest for wedding: 1,000,000 / 200 = 5,000 (well above min 1,500)
    splits_normal, notes_normal = compute_adjusted_splits(valid_wedding_request, days_until=90)
    assert not any("lean" in n for n in notes_normal)

    # Tight per-guest: 200,000 / 200 = 1,000 (< 1,500)
    tight_req = valid_wedding_request.model_copy(update={"budget": 200_000})
    splits_tight, notes_tight = compute_adjusted_splits(tight_req, days_until=90)

    assert splits_tight["Catering & Dining"] == splits_normal["Catering & Dining"] + 5
    assert splits_tight["Decor, Floral & Lighting"] == splits_normal["Decor, Floral & Lighting"] - 5
    assert any("lean" in n for n in notes_tight)


def test_large_guest_count_expands_contingency(valid_wedding_request):
    """A large guest list (>= 300) raises contingency reserve by 2%."""
    large_req = valid_wedding_request.model_copy(update={"guest_count": 400})
    splits, notes = compute_adjusted_splits(large_req, days_until=90)

    base_contingency = BUDGET_PROFILES["wedding"].base_splits[CONTINGENCY]
    assert splits[CONTINGENCY] >= base_contingency + 2
    assert any("Large gathering" in n for n in notes)


def test_short_notice_expands_contingency(valid_wedding_request):
    """Short notice (< 14 days) raises contingency reserve by 3% for rush procurement."""
    splits, notes = compute_adjusted_splits(valid_wedding_request, days_until=7)
    base_contingency = BUDGET_PROFILES["wedding"].base_splits[CONTINGENCY]
    assert splits[CONTINGENCY] >= base_contingency + 3
    assert any("Short lead time" in n for n in notes)


def test_reconcile_budget_ledger_no_actuals():
    """Reconciling budget with zero actual spending yields full budget remaining and no overruns."""
    lines = [
        BudgetLine(category="Venue", percent=40, amount_paise=400000, amount=4000, estimated_amount=4000),
        BudgetLine(category="Catering", percent=50, amount_paise=500000, amount=5000, estimated_amount=5000),
        BudgetLine(category=CONTINGENCY, percent=10, amount_paise=100000, amount=1000, estimated_amount=1000),
    ]
    res = reconcile_budget_ledger(10_000, lines, {})
    assert res.total_actual_spent == 0
    assert res.remaining_budget == 10_000
    assert not res.is_overspent
    assert res.contingency_balance == 1000
    assert len(res.warnings) == 0


def test_reconcile_budget_ledger_with_overrun():
    """When an individual category exceeds planned, contingency absorbs it."""
    lines = [
        BudgetLine(category="Venue", percent=40, amount_paise=400000, amount=4000, estimated_amount=4000),
        BudgetLine(category="Catering", percent=50, amount_paise=500000, amount=5000, estimated_amount=5000),
        BudgetLine(category=CONTINGENCY, percent=10, amount_paise=100000, amount=1000, estimated_amount=1000),
    ]
    # Venue spent 4,400 (over by 400). Contingency remaining should be 1000 - 400 = 600.
    actuals = {"Venue": 4400, "Catering": 4000}
    res = reconcile_budget_ledger(10_000, lines, actuals)

    assert res.total_actual_spent == 8400
    assert res.remaining_budget == 1600
    assert not res.is_overspent
    assert res.contingency_balance == 600
    assert any("Budget overrun detected" in w for w in res.warnings)


def test_reconcile_budget_ledger_total_overspend():
    """When total spending exceeds budget, total overspend is flagged."""
    lines = [
        BudgetLine(category="Venue", percent=50, amount_paise=500000, amount=5000, estimated_amount=5000),
        BudgetLine(category="Catering", percent=50, amount_paise=500000, amount=5000, estimated_amount=5000),
    ]
    actuals = {"Venue": 6000, "Catering": 6000}  # 12,000 on 10,000 budget
    res = reconcile_budget_ledger(10_000, lines, actuals)

    assert res.total_actual_spent == 12_000
    assert res.remaining_budget == -2_000
    assert res.is_overspent
    assert res.overspent_amount == 2_000
    assert any("Caution: Total expenditures exceed" in w for w in res.warnings)
