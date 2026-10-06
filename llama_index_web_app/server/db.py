"""SQLite database for accounts and usage."""

import os
import sqlite3

DB_PATH = os.environ.get("USERS_DB_PATH", "instance/users.db")


def connect_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
