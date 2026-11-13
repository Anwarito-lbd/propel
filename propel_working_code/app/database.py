from __future__ import annotations
from contextlib import closing
import os
import sqlite3
from pathlib import Path
from typing import Any, Iterable

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "propel.db"


def get_db_path() -> Path:
    return Path(os.getenv("PROPEL_DB", str(DEFAULT_DB_PATH)))


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect()) as conn, conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                name TEXT DEFAULT '',
                field TEXT DEFAULT '',
                target_location TEXT DEFAULT '',
                target_duration TEXT DEFAULT '',
                resume_text TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                job_id TEXT NOT NULL,
                title TEXT NOT NULL,
                company TEXT NOT NULL,
                url TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'saved',
                note TEXT DEFAULT '',
                UNIQUE(email, job_id)
            );
            """
        )


def execute(query: str, params: Iterable[Any] = ()) -> int:
    with closing(connect()) as conn, conn:
        cur = conn.execute(query, tuple(params))
        return cur.rowcount


def fetchone(query: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
    with closing(connect()) as conn, conn:
        return conn.execute(query, tuple(params)).fetchone()


def fetchall(query: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
    with closing(connect()) as conn, conn:
        return conn.execute(query, tuple(params)).fetchall()
