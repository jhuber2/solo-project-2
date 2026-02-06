from __future__ import annotations

import json
import os
import re
import threading
from datetime import datetime, timedelta
from uuid import uuid4

from flask import Flask, jsonify, request, send_from_directory

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(APP_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "workouts.json")

PAGE_SIZE = 10
ALLOWED_TYPES = {"Strength", "Cardio", "Endurance"}

lock = threading.Lock()
app = Flask(__name__, static_folder="static", static_url_path="")


# ----------------------------
# Persistence helpers
# ----------------------------
def _read_all() -> list[dict]:
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def _write_all(items: list[dict]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2)
    os.replace(tmp, DATA_FILE)


def _seed_30() -> list[dict]:
    # Create 30 records, newest first, like your original seed feel.
    # Mixes Strength/Cardio/Endurance similar to your seed.js.
    base_date = datetime(2026, 1, 23)
    patterns = [
        ("Bench Press", "Strength", 2, 6, 185, 20),
        ("Squat", "Strength", 2, 6, 225, 30),
        ("Deadlift", "Strength", 2, 4, 275, 30),
        ("Overhead Press", "Strength", 2, 5, 120, 20),
        ("Pull Ups", "Strength", 2, 4, 80, 15),
        ("Running", "Cardio", 0, 0, 0, 35),
        ("Cycling", "Cardio", 0, 0, 0, 45),
        ("Basketball", "Cardio", 0, 0, 0, 30),
        ("Swimming", "Cardio", 0, 0, 0, 35),
        ("Hiking", "Endurance", 0, 0, 0, 65),
        ("Cycling", "Endurance", 0, 0, 0, 75),
        ("Walking", "Endurance", 0, 0, 0, 45),
    ]

    items = []
    for i in range(30):
        ex, typ, sets, reps, wt, dur = patterns[i % len(patterns)]
        d = (base_date - timedelta(days=i)).strftime("%Y-%m-%d")
        items.append(
            {
                "id": str(uuid4()),
                "date": d,
                "exercise": ex,
                "type": typ,
                "sets": sets,
                "reps": reps,
                "weight": wt,
                "duration": dur,
            }
        )
    return items


def _ensure_seeded() -> None:
    with lock:
        items = _read_all()
        if len(items) < 30:
            items = _seed_30()
            _write_all(items)


# ----------------------------
# Validation + normalization
# ----------------------------
_date_re = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _to_number(value, default=0):
    try:
        # allow ints/floats/strings
        n = float(value)
        if n != n:  # NaN
            return default
        # if it's an integer-ish float, keep it clean
        if abs(n - int(n)) < 1e-9:
            return int(n)
        return n
    except Exception:
        return default


def validate_and_normalize(payload: dict, existing_id: str | None = None) -> tuple[list[str], dict]:
    errors = []

    w = {
        "id": existing_id if existing_id else str(uuid4()),
        "date": (payload.get("date") or "").strip(),
        "exercise": (payload.get("exercise") or "").strip(),
        "type": (payload.get("type") or "").strip(),
        "duration": _to_number(payload.get("duration"), 0),
        "sets": _to_number(payload.get("sets"), 0),
        "reps": _to_number(payload.get("reps"), 0),
        "weight": _to_number(payload.get("weight"), 0),
    }

    # Required fields
    if not w["date"]:
        errors.append("Date is required.")
    if not w["exercise"]:
        errors.append("Exercise is required.")
    if not w["type"]:
        errors.append("Type is required.")

    # Date format check (basic, but good)
    if w["date"] and not _date_re.match(w["date"]):
        errors.append("Date must be in YYYY-MM-DD format.")
    else:
        # verify it’s a real date
        try:
            if w["date"]:
                datetime.strptime(w["date"], "%Y-%m-%d")
        except ValueError:
            errors.append("Date is invalid.")

    # Length/type constraints (match your UI intent)
    if w["exercise"] and len(w["exercise"]) > 40:
        errors.append("Exercise must be 40 characters or fewer.")

    if w["type"] and w["type"] not in ALLOWED_TYPES:
        errors.append("Type must be Strength, Cardio, or Endurance.")

    # Numeric constraints
    for field in ["duration", "sets", "reps", "weight"]:
        if w[field] < 0:
            errors.append("Numeric values must be 0 or higher.")
            break

    has_strength = (w["sets"] > 0) or (w["reps"] > 0) or (w["weight"] > 0)
    has_duration = w["duration"] > 0

    if not has_strength and not has_duration:
        errors.append("Enter duration or sets/reps/weight.")

    return errors, w


# ----------------------------
# Sorting + paging
# ----------------------------
def sort_workouts(items: list[dict]) -> list[dict]:
    # Newest date first (same as your UI render sort)
    # Secondary tie-break by id (stable)
    return sorted(items, key=lambda x: (x.get("date", ""), x.get("id", "")), reverse=True)


def paginate(items: list[dict], page: int) -> dict:
    total = len(items)
    total_pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    page = max(1, min(page, total_pages))

    start = (page - 1) * PAGE_SIZE
    end = start + PAGE_SIZE
    page_items = items[start:end]

    return {
        "items": page_items,
        "page": page,
        "pageSize": PAGE_SIZE,
        "total": total,
        "totalPages": total_pages,
    }


# ----------------------------
# API routes
# ----------------------------
@app.get("/api/workouts")
def api_list_workouts():
    _ensure_seeded()

    page = _to_number(request.args.get("page", 1), 1)
    if isinstance(page, float):
        page = int(page)

    with lock:
        items = sort_workouts(_read_all())

    return jsonify(paginate(items, page))


@app.get("/api/workouts/<workout_id>")
def api_get_workout(workout_id: str):
    _ensure_seeded()
    with lock:
        items = _read_all()
        found = next((w for w in items if w.get("id") == workout_id), None)

    if not found:
        return jsonify({"error": "Not found"}), 404
    return jsonify(found)


@app.post("/api/workouts")
def api_create_workout():
    _ensure_seeded()
    payload = request.get_json(silent=True) or {}
    errors, w = validate_and_normalize(payload)

    if errors:
        return jsonify({"errors": errors}), 400

    with lock:
        items = _read_all()
        items.append(w)
        _write_all(items)

    return jsonify(w), 201


@app.put("/api/workouts/<workout_id>")
def api_update_workout(workout_id: str):
    _ensure_seeded()
    payload = request.get_json(silent=True) or {}

    with lock:
        items = _read_all()
        idx = next((i for i, w in enumerate(items) if w.get("id") == workout_id), None)

        if idx is None:
            return jsonify({"error": "Not found"}), 404

        errors, normalized = validate_and_normalize(payload, existing_id=workout_id)
        if errors:
            return jsonify({"errors": errors}), 400

        items[idx] = normalized
        _write_all(items)

    return jsonify(normalized)


@app.delete("/api/workouts/<workout_id>")
def api_delete_workout(workout_id: str):
    _ensure_seeded()

    with lock:
        items = _read_all()
        before = len(items)
        items = [w for w in items if w.get("id") != workout_id]

        if len(items) == before:
            return jsonify({"error": "Not found"}), 404

        _write_all(items)

    return jsonify({"ok": True})


# ----------------------------
# Serve frontend (local dev)
# ----------------------------
@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    _ensure_seeded()
    app.run(host="0.0.0.0", port=5000, debug=True)