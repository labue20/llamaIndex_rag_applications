"""
Server-side copy of every signature audit record (the audit trail page in the
PDF can be removed by whoever holds the file; this record can't).
"""

import json

from db import connect_db


def init_signature_log():
    with connect_db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS signature_audit (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                signer TEXT NOT NULL,
                ip_address TEXT,
                signed_at TEXT NOT NULL,
                file_name TEXT NOT NULL,
                placements TEXT NOT NULL,
                original_sha256 TEXT NOT NULL,
                signed_sha256 TEXT NOT NULL,
                final_sha256 TEXT NOT NULL,
                audit_page INTEGER NOT NULL
            )"""
        )


def save_signature_record(record, user_id):
    with connect_db() as conn:
        conn.execute(
            """INSERT INTO signature_audit
               (id, user_id, signer, ip_address, signed_at, file_name, placements,
                original_sha256, signed_sha256, final_sha256, audit_page)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (record["id"], user_id, record["signer"], record["ip_address"], record["signed_at"],
             record["file_name"], json.dumps(record["placements"]), record["original_sha256"],
             record["signed_sha256"], record["final_sha256"], int(record["audit_page"])),
        )


def get_signature_record(record_id):
    with connect_db() as conn:
        row = conn.execute("SELECT * FROM signature_audit WHERE id = ?", (record_id,)).fetchone()
    return dict(row) if row else None
