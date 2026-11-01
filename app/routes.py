"""Flask route handlers, API endpoints, rate limiting, and error formatting."""
from __future__ import annotations

import logging
from datetime import date

from flask import Blueprint, Response, current_app, jsonify, render_template, request
from pydantic import ValidationError

from .ai import GeminiProvider, InsightsService
from .budget_engine import reconcile_budget_ledger
from .export_service import build_icalendar_stream
from .models import (
    BudgetLine,
    PlanRequest,
    PlanResult,
)
from .planner import PlanInputError, build_core_plan
from .security import RateLimiter, get_client_ip

logger = logging.getLogger(__name__)

bp = Blueprint("main", __name__)
rate_limiter = RateLimiter(limit=30, window_seconds=60.0)

_insights_service: InsightsService | None = None


def get_insights_service() -> InsightsService:
    global _insights_service
    if _insights_service is None:
        api_key = current_app.config.get("GEMINI_API_KEY", "")
        model = current_app.config.get("GEMINI_MODEL", "gemini-2.5-flash")
        provider = GeminiProvider(api_key=api_key, model=model) if api_key else None
        _insights_service = InsightsService(provider=provider)
    return _insights_service


@bp.route("/")
def index() -> str:
    """Serve the single-page celebration planning application."""
    return render_template("index.html")


@bp.route("/api/health")
def health() -> Response:
    """Health status endpoint."""
    return jsonify({"status": "healthy", "service": "planora", "version": "2.0.0"})


@bp.route("/api/plan", methods=["POST"])
def create_plan() -> tuple[Response, int]:
    """Generate a celebration plan combining deterministic calculations with AI insights."""
    client_ip = get_client_ip()
    allowed, retry_after = rate_limiter.allow(client_ip)
    if not allowed:
        resp = jsonify({
            "error": "Rate limit exceeded. Please wait a moment before generating another plan.",
            "retry_after": retry_after,
        })
        resp.headers["Retry-After"] = str(retry_after)
        return resp, 429

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request body; JSON object expected."}), 400

    try:
        plan_req = PlanRequest.model_validate(data)
    except ValidationError as exc:
        details = [
            {"field": str(err["loc"][0]) if err["loc"] else "body", "message": err["msg"]}
            for err in exc.errors()
        ]
        return jsonify({"error": "Validation failed", "details": details}), 422

    today = date.today()
    try:
        core = build_core_plan(plan_req, today)
    except PlanInputError as pie:
        return jsonify({"error": "Planning constraint violation", "details": [{"field": pie.field, "message": str(pie)}]}), 422
    except ValueError as ve:
        return jsonify({"error": "Planning constraint violation", "details": [{"field": "event_date", "message": str(ve)}]}), 422

    insights, source = get_insights_service().get(plan_req, core)

    result = PlanResult(
        title=plan_req.title,
        event_type=plan_req.event_type,
        event_date=plan_req.event_date,
        city=plan_req.city,
        guest_count=plan_req.guest_count,
        budget=plan_req.budget,
        preferences=plan_req.preferences,
        style_priorities=plan_req.style_priorities,
        planning_notes=plan_req.planning_notes,
        days_until=core.days_until,
        per_guest=core.per_guest,
        budget_lines=core.budget_lines,
        milestones=core.milestones,
        vendor_checklist=core.vendor_checklist,
        warnings=core.warnings,
        insights=insights,
        ai_source=source,
    )

    return jsonify(result.model_dump(mode="json")), 200


@bp.route("/api/budget/recalculate", methods=["POST"])
def recalculate_budget() -> tuple[Response, int]:
    """Recalculate budget ledger and overrun detection given actual vendor costs."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request body; JSON object expected."}), 400

    total_budget = data.get("total_budget")
    budget_lines_raw = data.get("budget_lines", [])
    actuals = data.get("actuals", {})

    if not isinstance(total_budget, int) or total_budget <= 0:
        return jsonify({"error": "Positive integer total_budget is required."}), 422

    try:
        budget_lines = [BudgetLine.model_validate(b) for b in budget_lines_raw]
    except ValidationError:
        return jsonify({"error": "Invalid budget lines payload."}), 422

    result = reconcile_budget_ledger(total_budget, budget_lines, actuals)
    return jsonify(result.model_dump(mode="json")), 200


@bp.route("/api/export/ics", methods=["POST"])
def export_ics() -> Response:
    """Generate and download a valid RFC 5545 iCalendar stream."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Plan data required."}), 400

    try:
        plan = PlanResult.model_validate(data)
    except ValidationError as exc:
        return jsonify({"error": "Invalid plan format", "details": str(exc)}), 422

    ics_content = build_icalendar_stream(plan)
    response = Response(ics_content, mimetype="text/calendar; charset=utf-8")
    safe_title = "".join(c for c in plan.title if c.isalnum() or c in ("-", "_")).strip() or "planora"
    response.headers["Content-Disposition"] = f'attachment; filename="{safe_title}-milestones.ics"'
    return response
