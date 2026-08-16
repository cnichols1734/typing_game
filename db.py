from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent
INSTANCE = ROOT / "instance"
DB_PATH = INSTANCE / "aphelion.db"

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USING_PG = DATABASE_URL.startswith("postgres")
SCHEMA_LOCK_KEY = 728401

_schema_lock = threading.Lock()
_schema_ready = False


def _sql(query: str) -> str:
    return query.replace("?", "%s") if USING_PG else query


class Connection:
    def __init__(self, raw: Any):
        self.raw = raw

    def execute(self, query: str, params: Iterable[Any] = ()):
        cur = self.raw.cursor()
        cur.execute(_sql(query), tuple(params))
        return Cursor(cur)

    def commit(self) -> None:
        self.raw.commit()

    def close(self) -> None:
        self.raw.close()


class Cursor:
    def __init__(self, raw: Any):
        self.raw = raw

    def fetchone(self) -> Any:
        return self.raw.fetchone()

    def fetchall(self) -> list[Any]:
        return list(self.raw.fetchall())

    @property
    def lastrowid(self) -> int | None:
        return getattr(self.raw, "lastrowid", None)


def connect() -> Connection:
    if USING_PG:
        import psycopg
        from psycopg.rows import dict_row

        return Connection(psycopg.connect(DATABASE_URL, row_factory=dict_row))

    INSTANCE.mkdir(exist_ok=True)
    raw = sqlite3.connect(DB_PATH)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA foreign_keys = ON")
    return Connection(raw)


def ensure_schema() -> None:
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        db = connect()
        try:
            init_schema(db)
            _schema_ready = True
        finally:
            db.close()


def init_schema(db: Connection) -> None:
    if USING_PG:
        db.execute("SELECT pg_advisory_xact_lock(?)", (SCHEMA_LOCK_KEY,))
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS scores (
                id SERIAL PRIMARY KEY,
                callsign TEXT NOT NULL,
                score INTEGER NOT NULL,
                round INTEGER NOT NULL,
                wpm DOUBLE PRECISION NOT NULL,
                accuracy DOUBLE PRECISION NOT NULL,
                best_streak INTEGER NOT NULL,
                mode TEXT NOT NULL,
                seed TEXT,
                platform TEXT NOT NULL DEFAULT 'desktop',
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_challenges (
                date TEXT PRIMARY KEY,
                seed TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_scores_mode_score
            ON scores (mode, score DESC, created_at ASC)
            """
        )
    else:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                callsign TEXT NOT NULL,
                score INTEGER NOT NULL,
                round INTEGER NOT NULL,
                wpm REAL NOT NULL,
                accuracy REAL NOT NULL,
                best_streak INTEGER NOT NULL,
                mode TEXT NOT NULL,
                seed TEXT,
                platform TEXT NOT NULL DEFAULT 'desktop',
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_challenges (
                date TEXT PRIMARY KEY,
                seed TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_scores_mode_score
            ON scores (mode, score DESC, created_at ASC)
            """
        )
    _ensure_platform_column(db)
    db.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_scores_platform_score
        ON scores (platform, score DESC, created_at ASC)
        """
    )
    db.commit()


def _ensure_platform_column(db: Connection) -> None:
    if USING_PG:
        row = db.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'scores'
              AND column_name = 'platform'
            """
        ).fetchone()
        if row:
            return
        db.execute(
            """
            ALTER TABLE scores
            ADD COLUMN platform TEXT NOT NULL DEFAULT 'desktop'
            """
        )
        return
    cols = {row["name"] for row in db.execute("PRAGMA table_info(scores)").fetchall()}
    if "platform" not in cols:
        db.execute(
            "ALTER TABLE scores ADD COLUMN platform TEXT NOT NULL DEFAULT 'desktop'"
        )


def insert_score(db: Connection, values: tuple[Any, ...]) -> int:
    if USING_PG:
        row = db.execute(
            """
            INSERT INTO scores (
                callsign, score, round, wpm, accuracy, best_streak, mode, seed, platform, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            values,
        ).fetchone()
        db.commit()
        return int(row["id"])
    cur = db.execute(
        """
        INSERT INTO scores (
            callsign, score, round, wpm, accuracy, best_streak, mode, seed, platform, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        values,
    )
    db.commit()
    return int(cur.lastrowid or 0)
