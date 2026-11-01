"""Deterministic budget allocation engine with largest-remainder rounding and financial reconciliation.

Axiom: Code does the math, never trust AI-generated arithmetic.
Uses integer paise internally to prevent floating-point inaccuracies.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from .models import (
    BudgetLine,
    BudgetRecalculationResult,
    CategoryVariance,
    PlanRequest,
)

CONTINGENCY = "Contingency & Emergency Reserve"


@dataclass(frozen=True)
class EventBudgetProfile:
    """Base budget distribution profile and adjustment thresholds for an event type."""

    base_splits: dict[str, int]
    essential_category: str
    flex_category: str
    min_per_guest_threshold: int
    large_guest_threshold: int
    category_descriptions: dict[str, str]


BUDGET_PROFILES: dict[str, EventBudgetProfile] = {
    "wedding": EventBudgetProfile(
        base_splits={
            "Venue & Halls": 22,
            "Catering & Dining": 30,
            "Photography & Cinematography": 10,
            "Attire, Jewelry & Styling": 10,
            "Decor, Floral & Lighting": 8,
            "Entertainment & Music": 5,
            "Invitations & Stationery": 2,
            "Transport & Logistics": 3,
            CONTINGENCY: 10,
        },
        essential_category="Catering & Dining",
        flex_category="Decor, Floral & Lighting",
        min_per_guest_threshold=1500,
        large_guest_threshold=300,
        category_descriptions={
            "Venue & Halls": "Main ceremony and reception banquet hall, rentals, and setup permits",
            "Catering & Dining": "Buffet, live counters, appetizers, desserts, and beverage service",
            "Photography & Cinematography": "Candid photography, traditional videography, and family albums",
            "Attire, Jewelry & Styling": "Ceremonial outfits, hair, makeup, and mehendi artists",
            "Decor, Floral & Lighting": "Mandap or stage design, entrance floral arch, and mood lighting",
            "Entertainment & Music": "DJ, live acoustic ensemble or sound system, and MC",
            "Invitations & Stationery": "Digital invitations, printed save-the-dates, and ceremony cards",
            "Transport & Logistics": "Guest shuttle buses, bridal car, and logistics coordination",
            CONTINGENCY: "Buffer for unexpected extra guests, overtime charges, or weather contingencies",
        },
    ),
    "birthday": EventBudgetProfile(
        base_splits={
            "Venue or Party Space": 20,
            "Catering & Custom Cake": 35,
            "Entertainment & Games": 15,
            "Decor, Balloons & Theme": 12,
            "Photography": 5,
            "Invitations & Return Favors": 6,
            CONTINGENCY: 7,
        },
        essential_category="Catering & Custom Cake",
        flex_category="Decor, Balloons & Theme",
        min_per_guest_threshold=500,
        large_guest_threshold=75,
        category_descriptions={
            "Venue or Party Space": "Party hall booking, play zone reservation, or lawn cleaning",
            "Catering & Custom Cake": "Specialty tiered or themed cake, meals, and snacks",
            "Entertainment & Games": "Game host, magician, bouncy castle, or interactive activities",
            "Decor, Balloons & Theme": "Balloon arch, photo booth backdrop, and themed table setups",
            "Photography": "Coverage of cake cutting, party games, and high-res family photos",
            "Invitations & Return Favors": "Themed return gift hampers and digital invites",
            CONTINGENCY: "Buffer for last-minute headcount growth or extra game supplies",
        },
    ),
    "community": EventBudgetProfile(
        base_splits={
            "Venue & Civic Permits": 20,
            "Food & Refreshments": 30,
            "Sound, AV & Stage": 15,
            "Decor & Directional Signage": 8,
            "Publicity, Printing & Flyers": 8,
            "Volunteers, First Aid & Safety": 7,
            CONTINGENCY: 12,
        },
        essential_category="Food & Refreshments",
        flex_category="Decor & Directional Signage",
        min_per_guest_threshold=200,
        large_guest_threshold=200,
        category_descriptions={
            "Venue & Civic Permits": "Community hall or ground rental, electricity, and local authority NOCs",
            "Food & Refreshments": "Community buffet or prasadam, bottled water, and tea service",
            "Sound, AV & Stage": "Microphones, PA speakers, podium, projector, and backup generator",
            "Decor & Directional Signage": "Wayfinding signs, registration banners, and stage backdrop",
            "Publicity, Printing & Flyers": "Posters, WhatsApp banners, brochures, and badges",
            "Volunteers, First Aid & Safety": "Volunteer t-shirts, basic medical kit, crowd barriers, and sanitation",
            CONTINGENCY: "Emergency reserve for weather protection, power equipment, or city inspection fees",
        },
    ),
}


def _shift_percentage_points(splits: dict[str, int], source: str, target: str, points: int) -> int:
    """Safely transfer up to ``points`` percentage points from source to target.
    
    Guarantees the source category retains at least 1 percentage point.
    """
    if source not in splits or target not in splits:
        return 0
    available = max(0, splits[source] - 1)
    to_move = min(points, available)
    if to_move > 0:
        splits[source] -= to_move
        splits[target] += to_move
    return to_move


def compute_adjusted_splits(request: PlanRequest, days_until: int) -> tuple[dict[str, int], list[str]]:
    """Determine category percentages based on event constraints and lead time."""
    profile = BUDGET_PROFILES[request.event_type]
    splits = dict(profile.base_splits)
    notes: list[str] = []

    per_guest = request.budget / max(1, request.guest_count)

    # Rule 1: Tight budget per guest protects essential category (Catering / Food)
    if per_guest < profile.min_per_guest_threshold:
        moved = _shift_percentage_points(splits, profile.flex_category, profile.essential_category, 5)
        if moved > 0:
            notes.append(
                f"Budget per guest (Rs {int(per_guest):,}) is lean: reallocated {moved}% from "
                f"{profile.flex_category} to protect {profile.essential_category}."
            )
        else:
            notes.append("Budget per guest is tight; consider adjusting guest count or trimming non-essentials.")

    # Rule 2: Large guest gatherings require higher contingency for logistics and crowd buffering
    if request.guest_count >= profile.large_guest_threshold:
        moved = _shift_percentage_points(splits, profile.flex_category, CONTINGENCY, 2)
        if moved > 0:
            notes.append(
                f"Large gathering ({request.guest_count} guests): expanded emergency contingency by {moved}% "
                "to buffer against crowd logistics and unexpected surplus attendees."
            )

    # Rule 3: Short lead times (< 14 days) incur rush fees
    if days_until < 14:
        moved = _shift_percentage_points(splits, profile.flex_category, CONTINGENCY, 3)
        if moved > 0:
            notes.append(
                f"Short lead time ({days_until} days): reinforced contingency reserve by {moved}% "
                "for expedited booking and last-minute procurement."
            )

    return splits, notes


def allocate_budget_largest_remainder(budget: int, splits: dict[str, int], event_type: str) -> list[BudgetLine]:
    """Distribute budget across categories using the Largest-Remainder (Hamilton) Method.

    Invariants:
    1. sum(line.amount for line in lines) == budget exactly.
    2. sum(line.amount_paise for line in lines) == budget * 100 exactly.
    3. sum(line.percent for line in lines) == 100.
    """
    total_pct = sum(splits.values())
    if total_pct != 100:
        raise ValueError(f"Category splits must sum to exactly 100%; received {total_pct}%")

    descriptions = BUDGET_PROFILES[event_type].category_descriptions
    essential_cat = BUDGET_PROFILES[event_type].essential_category

    # Integer paise math: 1 Rupee = 100 Paise
    total_paise = budget * 100

    # Step 1: Base allocation in paise using integer division
    base_paise: dict[str, int] = {}
    remainders: list[tuple[int, str]] = []

    for category, pct in splits.items():
        share_paise = (total_paise * pct) // 100
        remainder = (total_paise * pct) % 100
        base_paise[category] = share_paise
        remainders.append((remainder, category))

    # Step 2: Distribute remaining surplus paise by descending remainder
    surplus_paise = total_paise - sum(base_paise.values())
    remainders.sort(key=lambda item: item[0], reverse=True)

    for i in range(surplus_paise):
        cat = remainders[i % len(remainders)][1]
        base_paise[cat] += 1

    # Step 3: Convert paise to whole INR with zero discrepancy
    # Base INR allocation:
    base_inr: dict[str, int] = {cat: p // 100 for cat, p in base_paise.items()}
    inr_remainders = sorted(
        splits.keys(),
        key=lambda c: base_paise[c] % 100,
        reverse=True,
    )
    unassigned_rupees = budget - sum(base_inr.values())
    for cat in inr_remainders[:unassigned_rupees]:
        base_inr[cat] += 1

    lines: list[BudgetLine] = []
    for category, pct in splits.items():
        amount_inr = base_inr[category]
        amount_paise = base_paise[category]
        lines.append(
            BudgetLine(
                category=category,
                percent=pct,
                amount_paise=amount_paise,
                amount=amount_inr,
                estimated_amount=amount_inr,
                actual_amount=0,
                is_essential=(category == essential_cat),
                description=descriptions.get(category, ""),
            )
        )

    return lines


def reconcile_budget_ledger(
    total_budget: int,
    budget_lines: list[BudgetLine],
    actual_spending: Mapping[str, int],
) -> BudgetRecalculationResult:
    """Calculate live budget ledger comparing planned allocation vs actual user spending.
    
    Provides precise overrun detection and contingency drawdown.
    """
    contingency_planned = 0
    for b in budget_lines:
        if CONTINGENCY in b.category:
            contingency_planned = b.amount
            break

    total_actual_spent = 0
    category_variances: list[CategoryVariance] = []
    overspent_categories: list[str] = []
    warnings: list[str] = []

    for b in budget_lines:
        cat = b.category
        planned = b.amount
        actual = max(0, actual_spending.get(cat, 0))
        total_actual_spent += actual
        variance = planned - actual
        is_over = variance < 0
        if is_over:
            overspent_categories.append(f"{cat} (by Rs {abs(variance):,})")

        category_variances.append(
            CategoryVariance(
                category=cat,
                planned_amount=planned,
                actual_amount=actual,
                variance=variance,
                is_overspent=is_over,
            )
        )

    remaining_budget = total_budget - total_actual_spent
    is_overspent = remaining_budget < 0
    overspent_amount = abs(remaining_budget) if is_overspent else 0

    # Calculate net draw on contingency
    net_non_contingency_overrun = sum(
        abs(v.variance) for v in category_variances if v.is_overspent and CONTINGENCY not in v.category
    )
    contingency_balance = max(0, contingency_planned - net_non_contingency_overrun)

    if is_overspent:
        warnings.append(
            f"Caution: Total expenditures exceed allocated budget by Rs {overspent_amount:,}! "
            "Consider reducing flexible categories or re-negotiating supplier quotes."
        )
    elif overspent_categories:
        warnings.append(
            f"Budget overrun detected in: {', '.join(overspent_categories)}. "
            f"Contingency reserve absorbed Rs {net_non_contingency_overrun:,}; "
            f"Remaining contingency buffer is Rs {contingency_balance:,}."
        )

    return BudgetRecalculationResult(
        total_budget=total_budget,
        total_actual_spent=total_actual_spent,
        remaining_budget=remaining_budget,
        is_overspent=is_overspent,
        overspent_amount=overspent_amount,
        contingency_balance=contingency_balance,
        category_variances=category_variances,
        warnings=warnings,
    )
