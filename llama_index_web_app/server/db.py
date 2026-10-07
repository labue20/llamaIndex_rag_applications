"""SQLite database for accounts and usage."""

import os
import sqlite3

DB_PATH = os.environ.get("USERS_DB_PATH", "instance/users.db")


class _Connection(sqlite3.Connection):
    """`with connect_db() as conn:` commits (or rolls back) and then closes.
    Plain sqlite3 connections only commit, leaving the connection open."""

    def __exit__(self, *exc):
        try:
            return super().__exit__(*exc)
        finally:
            self.close()


def connect_db():
    # Wait for a busy database instead of failing at once (the API runs several threads)
    conn = sqlite3.connect(DB_PATH, timeout=15, factory=_Connection)
    conn.row_factory = sqlite3.Row
    return conn


def enable_wal():
    """Write-ahead logging lets reads continue while another thread writes."""
    with connect_db() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
