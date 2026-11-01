"""Flask application factory."""
from __future__ import annotations

from typing import Any

from flask import Flask, jsonify

from .config import Config
from .routes import bp
from .security import apply_security_headers


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    """Create and configure the Flask application instance."""
    app = Flask(__name__)
    app.config.from_object(Config)

    if test_config:
        app.config.update(test_config)

    # Attach defensive security headers
    app.after_request(apply_security_headers)

    # Register blueprints
    app.register_blueprint(bp)

    @app.errorhandler(413)
    def handle_payload_too_large(e: Any):
        return jsonify({"error": "Request payload too large (maximum allowed size is 32 KB)."}), 413

    @app.errorhandler(404)
    def handle_not_found(e: Any):
        return jsonify({"error": "Resource not found."}), 404

    @app.errorhandler(500)
    def handle_internal_error(e: Any):
        return jsonify({"error": "An unexpected server error occurred. Please try again."}), 500

    return app
