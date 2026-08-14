from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

from db import USING_PG, connect, init_schema, insert_score

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "frontend" / "dist"

NAME_RE = re.compile(r"^[A-Za-z][A-Za-z '\-]{0,22}[A-Za-z]$")
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
BOARD_LIMIT = 5


def normalize_name(raw: object) -> str | None:
    name = re.sub(r"\s+", " ", str(raw or "").strip())
    if not NAME_RE.fullmatch(name):
        return None
    return name


def utc_today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def get_db():
    if "db" not in g:
        g.db = connect()
    return g.db


def init_db() -> None:
    init_schema(get_db())


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)

    @app.before_request
    def _ready() -> None:
        init_db()

    @app.teardown_appcontext
    def _close(_err: object) -> None:
        db = g.pop("db", None)
        if db is not None:
            db.close()

    @app.after_request
    def _cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return resp

    @app.route("/api/health")
    def health():
        return jsonify({"ok": True, "service": "aphelion", "db": "postgres" if USING_PG else "sqlite"})

    @app.route("/api/scores", methods=["GET", "POST", "OPTIONS"])
    def scores():
        if request.method == "OPTIONS":
            return ("", 204)

        db = get_db()

        if request.method == "GET":
            period = request.args.get("period")
            if period is None:
                period = "day" if request.args.get("mode") == "daily" else "all"
            if period not in {"all", "day"}:
                return jsonify({"error": "invalid period"}), 400
            try:
                limit = min(BOARD_LIMIT, max(1, int(request.args.get("limit", BOARD_LIMIT))))
            except ValueError:
                return jsonify({"error": "invalid limit"}), 400

            sql = """
                SELECT id, callsign, score, round, wpm, accuracy, best_streak,
                       mode, seed, created_at
                FROM scores
            """
            params: list[object] = []
            if period == "day":
                day = request.args.get("day", utc_today())
                if not DAY_RE.fullmatch(day):
                    return jsonify({"error": "invalid day"}), 400
                try:
                    tz_min = int(request.args.get("tz", "0"))
                except ValueError:
                    return jsonify({"error": "invalid tz"}), 400
                tz_min = max(-14 * 60, min(14 * 60, tz_min))
                start_utc = datetime.strptime(day, "%Y-%m-%d") + timedelta(minutes=tz_min)
                end_utc = start_utc + timedelta(days=1)
                sql += " WHERE created_at >= ? AND created_at < ?"
                params.extend(
                    [
                        start_utc.strftime("%Y-%m-%d %H:%M:%S"),
                        end_utc.strftime("%Y-%m-%d %H:%M:%S"),
                    ]
                )
            sql += " ORDER BY score DESC, created_at ASC LIMIT ?"
            params.append(limit)
            rows = db.execute(sql, params).fetchall()
            return jsonify({"scores": [dict(r) for r in rows]})

        body = request.get_json(silent=True) or {}
        callsign = normalize_name(body.get("callsign", ""))
        seed = str(body.get("seed", "")).strip()[:64]

        if not callsign:
            return jsonify({"error": "name must be 2–24 letters"}), 400

        try:
            score = int(body["score"])
            round_n = int(body["round"])
            wpm = float(body["wpm"])
            accuracy = float(body["accuracy"])
            best_streak = int(body["best_streak"])
        except (KeyError, TypeError, ValueError):
            return jsonify({"error": "invalid payload"}), 400

        if not (0 <= score <= 10_000_000):
            return jsonify({"error": "score out of range"}), 400
        if not (1 <= round_n <= 999):
            return jsonify({"error": "round out of range"}), 400
        if not (0 <= wpm <= 250):
            return jsonify({"error": "wpm out of range"}), 400
        if not (0 <= accuracy <= 1):
            return jsonify({"error": "accuracy out of range"}), 400
        if not (0 <= best_streak <= 9999):
            return jsonify({"error": "streak out of range"}), 400

        new_id = insert_score(
            db,
            (
                callsign,
                score,
                round_n,
                round(wpm, 1),
                round(accuracy, 4),
                best_streak,
                "arcade",
                seed or None,
                utc_now(),
            ),
        )
        return jsonify({"ok": True, "id": new_id})

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path: str):
        if not DIST.exists():
            return (
                jsonify(
                    {
                        "error": "frontend not built",
                        "hint": "cd frontend && npm install && npm run build",
                    }
                ),
                503,
            )
        target = DIST / path
        if path and target.is_file():
            resp = send_from_directory(DIST, path)
            # Vite fingerprints asset filenames, so they are safe to cache forever.
            if path.startswith("assets/"):
                resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return resp
        # The shell points at the current bundle hash and must never be cached,
        # or a stale index.html keeps loading a previous build's assets.
        resp = send_from_directory(DIST, "index.html")
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=True)
