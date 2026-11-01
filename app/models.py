"""Pydantic v2 data models: validated requests, deterministic plans, and AI insights."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .security import clean_text, looks_like_injection

EventType = Literal["wedding", "birthday", "community"]
TaskPriority = Literal["critical", "high", "medium", "normal", "low"]


class PlanRequest(BaseModel):
    """User input for planning an event. Unknown fields are strictly forbidden."""

    model_config = ConfigDict(extra="forbid")

    event_type: EventType
    title: str = Field(min_length=1, max_length=80, description="Name or title of the celebration")
    guest_count: int = Field(ge=1, le=5000, description="Expected guest attendance")
    budget: int = Field(ge=1_000, le=100_000_000, description="Total celebration budget in INR")
    event_date: date = Field(description="Target date of the event")
    city: str = Field(min_length=1, max_length=60, description="City or venue location")
    preferences: str = Field(default="", max_length=500, description="Dietary, cultural, or personal preferences")
    style_priorities: str = Field(default="", max_length=300, description="Theme, style, and celebration priorities")
    planning_notes: str = Field(default="", max_length=500, description="Optional extra planning notes")

    @field_validator("title", "city", "preferences", "style_priorities", "planning_notes", mode="before")
    @classmethod
    def _clean_and_screen(cls, value: object) -> str:
        if not isinstance(value, str):
            raise TypeError("Field must be text.")
        cleaned = clean_text(value)
        if looks_like_injection(cleaned):
            raise ValueError("Please provide descriptive event details only; assistant directives are forbidden.")
        return cleaned


class BudgetLine(BaseModel):
    """Individual category budget allocation computed deterministically."""

    category: str
    percent: int
    amount_paise: int
    amount: int
    estimated_amount: int
    actual_amount: int = 0
    is_essential: bool = False
    description: str = ""


class BudgetRecalculationRequest(BaseModel):
    """Payload for live budget reconciliation with user-entered actual costs."""

    model_config = ConfigDict(extra="forbid")

    total_budget: int = Field(ge=1_000, le=100_000_000)
    actuals: dict[str, int] = Field(description="Map of category names to actual amounts spent in INR")


class CategoryVariance(BaseModel):
    """Variance analysis for a single budget category."""

    category: str
    planned_amount: int
    actual_amount: int
    variance: int  # positive means unspent, negative means overspent
    is_overspent: bool


class BudgetRecalculationResult(BaseModel):
    """Result of budget ledger calculation."""

    total_budget: int
    total_actual_spent: int
    remaining_budget: int
    is_overspent: bool
    overspent_amount: int
    contingency_balance: int
    category_variances: list[CategoryVariance]
    warnings: list[str]


class Milestone(BaseModel):
    """Adaptive chronological milestone."""

    id: str
    due_date: date
    days_from_today: int
    task: str
    category: str
    priority: TaskPriority
    is_urgent: bool = False


class VendorTask(BaseModel):
    """Interactive vendor checklist task with tracking metadata."""

    id: str
    vendor_category: str
    title: str
    description: str = ""
    priority: Literal["high", "medium", "low"] = "medium"
    estimated_cost: int = 0
    actual_cost: int = 0
    is_completed: bool = False
    due_date: date | None = None
    vendor_name: str = ""


class VendorGroup(BaseModel):
    """Group of vendor checklist tasks under a functional discipline."""

    vendor: str
    tasks: list[VendorTask]


class Idea(BaseModel):
    """Creative thematic or decorative concept."""

    title: str
    description: str


class ChecklistExtra(BaseModel):
    """Custom checklist item suggested by AI or domain intelligence."""

    category: str
    item: str


class AIInsights(BaseModel):
    """Structured insights schema delivered by Gemini or offline fallback."""

    summary: str
    ideas: list[Idea]
    checklist_extras: list[ChecklistExtra]
    saving_tips: list[str]
    contingency_advice: str = ""


class CorePlan(BaseModel):
    """Deterministic planning outputs calculated without LLM dependency."""

    days_until: int
    per_guest: int
    budget_lines: list[BudgetLine]
    milestones: list[Milestone]
    vendor_checklist: list[VendorGroup]
    warnings: list[str]


class PlanResult(BaseModel):
    """Complete client-facing plan response."""

    title: str
    event_type: EventType
    event_date: date
    city: str
    guest_count: int
    budget: int
    preferences: str = ""
    style_priorities: str = ""
    planning_notes: str = ""
    days_until: int
    per_guest: int
    budget_lines: list[BudgetLine]
    milestones: list[Milestone]
    vendor_checklist: list[VendorGroup]
    warnings: list[str]
    insights: AIInsights
    ai_source: Literal["gemini", "fallback"]
