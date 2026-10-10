"""
Folders in the Document Manager, for organizing documents and signature
requests (for example one folder per property or client).

Documents live in the index server; which folder each one is in is kept here,
keyed by document ID, so indexing isn't involved. Signature requests have a
folder_id column of their own. Folders can have one level of subfolders.

- GET    /folders                 the account's folders (with item counts)
- POST   /folders                 {name, parent_id?}
- PATCH  /folders/<id>            {name}
- DELETE /folders/<id>            its contents (and subfolders) move up a level
- POST   /folders/move            {folder_id (null = no folder), document_ids, request_ids}
"""

import uuid
from datetime import datetime, timezone

from flask import Blueprint, current_app, g, jsonify, request

from db import connect_db

folders_bp = Blueprint("folders", __name__)

MAX_NAME = 80
SIGNATURE_REQUESTS_FOLDER = "Signature requests"
MAX_FOLDERS = 500


def init_folders():
    with connect_db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                name TEXT NOT NULL,
                parent_id TEXT,
                created_at TEXT NOT NULL
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS folders_owner ON folders (owner_id)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS document_folders (
                doc_id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                folder_id TEXT NOT NULL
            )"""
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(signature_requests)")}
        if columns and "folder_id" not in columns:
            conn.execute("ALTER TABLE signature_requests ADD COLUMN folder_id TEXT")
        # Once: requests sent before the Signature requests folder existed move into it
        conn.execute("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, done_at TEXT NOT NULL)")
        done = conn.execute("SELECT 1 FROM app_migrations WHERE name = 'signature_requests_folder'").fetchone()
        if columns and not done:
            owners = [row["owner_id"] for row in conn.execute(
                "SELECT DISTINCT owner_id FROM signature_requests WHERE folder_id IS NULL")]
            for owner_id in owners:
                conn.execute("UPDATE signature_requests SET folder_id = ? WHERE owner_id = ? AND folder_id IS NULL",
                             (signature_requests_folder(conn, owner_id), owner_id))
            conn.execute("INSERT INTO app_migrations (name, done_at) VALUES (?, ?)",
                         ("signature_requests_folder", datetime.now(timezone.utc).isoformat()))


def signature_requests_folder(conn, owner_id):
    """The account's top-level "Signature requests" folder, where requests are
    filed unless another folder is chosen. Made the first time it's needed."""
    row = conn.execute(
        "SELECT id FROM folders WHERE owner_id = ? AND parent_id IS NULL AND lower(name) = lower(?)",
        (owner_id, SIGNATURE_REQUESTS_FOLDER),
    ).fetchone()
    if row:
        return row["id"]
    folder_id = uuid.uuid4().hex
    conn.execute("INSERT INTO folders (id, owner_id, name, parent_id, created_at) VALUES (?, ?, ?, NULL, ?)",
                 (folder_id, owner_id, SIGNATURE_REQUESTS_FOLDER, datetime.now(timezone.utc).isoformat()))
    return folder_id


def _error(message, status):
    return jsonify({"error": message}), status


def _account():
    """The signed-in account's ID, or None for guests."""
    user = getattr(g, "user", None)
    return None if not user or user.get("guest") else user["id"]


def owned_folder(conn, owner_id, folder_id):
    if not folder_id:
        return None
    row = conn.execute("SELECT * FROM folders WHERE id = ? AND owner_id = ?", (folder_id, owner_id)).fetchone()
    return dict(row) if row else None


def document_folder_map(owner_id):
    """{doc_id: folder_id} for the account's filed documents."""
    with connect_db() as conn:
        return {row["doc_id"]: row["folder_id"] for row in conn.execute(
            "SELECT doc_id, folder_id FROM document_folders WHERE owner_id = ?", (owner_id,))}


def forget_document(owner_id, doc_id):
    """A deleted document leaves its folder."""
    with connect_db() as conn:
        conn.execute("DELETE FROM document_folders WHERE owner_id = ? AND doc_id = ?", (owner_id, doc_id))


def _clean_name(raw):
    name = " ".join(str(raw or "").split())
    if not name:
        return None, "Give the folder a name."
    if len(name) > MAX_NAME:
        return None, f"Folder names can be up to {MAX_NAME} characters."
    return name, None


def _name_taken(conn, owner_id, parent_id, name, exclude_id=None):
    row = conn.execute(
        "SELECT 1 FROM folders WHERE owner_id = ? AND COALESCE(parent_id, '') = ? AND lower(name) = lower(?)"
        " AND id != ?", (owner_id, parent_id or "", name, exclude_id or ""),
    ).fetchone()
    return row is not None


def _folder_json(row, counts):
    return {"id": row["id"], "name": row["name"], "parent_id": row["parent_id"], "created_at": row["created_at"],
            "document_count": counts["documents"].get(row["id"], 0),
            "request_count": counts["requests"].get(row["id"], 0)}


@folders_bp.route("/folders", methods=["GET"])
def list_folders():
    owner_id = _account()
    if owner_id is None:
        return _error("Create a free account to use folders.", 401)
    with connect_db() as conn:
        rows = conn.execute("SELECT * FROM folders WHERE owner_id = ? ORDER BY lower(name)", (owner_id,)).fetchall()
        documents = dict(conn.execute(
            "SELECT folder_id, COUNT(*) FROM document_folders WHERE owner_id = ? GROUP BY folder_id", (owner_id,)
        ).fetchall())
        requests_ = dict(conn.execute(
            "SELECT folder_id, COUNT(*) FROM signature_requests WHERE owner_id = ? AND folder_id IS NOT NULL"
            " GROUP BY folder_id", (owner_id,)
        ).fetchall())
    counts = {"documents": documents, "requests": requests_}
    return jsonify({"folders": [_folder_json(row, counts) for row in rows]})


@folders_bp.route("/folders", methods=["POST"])
def create_folder():
    owner_id = _account()
    if owner_id is None:
        return _error("Create a free account to use folders.", 401)
    data = request.get_json(silent=True) or {}
    name, problem = _clean_name(data.get("name"))
    if problem:
        return _error(problem, 400)
    parent_id = data.get("parent_id") or None
    with connect_db() as conn:
        if parent_id:
            parent = owned_folder(conn, owner_id, parent_id)
            if parent is None:
                return _error("That folder doesn't exist.", 404)
            if parent["parent_id"]:
                return _error("Folders can only go one level deep.", 400)
        if conn.execute("SELECT COUNT(*) FROM folders WHERE owner_id = ?", (owner_id,)).fetchone()[0] >= MAX_FOLDERS:
            return _error(f"You can have up to {MAX_FOLDERS} folders.", 400)
        if _name_taken(conn, owner_id, parent_id, name):
            return _error(f"There's already a folder called “{name}” here.", 409)
        folder = {"id": uuid.uuid4().hex, "name": name, "parent_id": parent_id,
                  "created_at": datetime.now(timezone.utc).isoformat()}
        conn.execute("INSERT INTO folders (id, owner_id, name, parent_id, created_at) VALUES (?, ?, ?, ?, ?)",
                     (folder["id"], owner_id, name, parent_id, folder["created_at"]))
    return jsonify({"folder": {**folder, "document_count": 0, "request_count": 0}}), 201


@folders_bp.route("/folders/<folder_id>", methods=["PATCH"])
def rename_folder(folder_id):
    owner_id = _account()
    if owner_id is None:
        return _error("Create a free account to use folders.", 401)
    name, problem = _clean_name((request.get_json(silent=True) or {}).get("name"))
    if problem:
        return _error(problem, 400)
    with connect_db() as conn:
        folder = owned_folder(conn, owner_id, folder_id)
        if folder is None:
            return _error("That folder doesn't exist.", 404)
        if _name_taken(conn, owner_id, folder["parent_id"], name, exclude_id=folder_id):
            return _error(f"There's already a folder called “{name}” here.", 409)
        conn.execute("UPDATE folders SET name = ? WHERE id = ?", (name, folder_id))
    return jsonify({"folder": {**folder, "name": name}})


@folders_bp.route("/folders/<folder_id>", methods=["DELETE"])
def delete_folder(folder_id):
    """Delete a folder; nothing in it is deleted: its documents, requests and
    subfolders move to the folder above (or out of any folder)."""
    owner_id = _account()
    if owner_id is None:
        return _error("Create a free account to use folders.", 401)
    with connect_db() as conn:
        folder = owned_folder(conn, owner_id, folder_id)
        if folder is None:
            return _error("That folder doesn't exist.", 404)
        parent_id = folder["parent_id"]
        # Subfolders move up; on a name clash, the subfolder's name gets a suffix
        for sub in conn.execute("SELECT * FROM folders WHERE owner_id = ? AND parent_id = ?",
                                (owner_id, folder_id)).fetchall():
            name = sub["name"]
            while _name_taken(conn, owner_id, parent_id, name, exclude_id=sub["id"]):
                name = f"{name} (moved)"
            conn.execute("UPDATE folders SET parent_id = ?, name = ? WHERE id = ?", (parent_id, name, sub["id"]))
        if parent_id:
            conn.execute("UPDATE document_folders SET folder_id = ? WHERE owner_id = ? AND folder_id = ?",
                         (parent_id, owner_id, folder_id))
        else:
            conn.execute("DELETE FROM document_folders WHERE owner_id = ? AND folder_id = ?", (owner_id, folder_id))
        conn.execute("UPDATE signature_requests SET folder_id = ? WHERE owner_id = ? AND folder_id = ?",
                     (parent_id, owner_id, folder_id))
        conn.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
    return jsonify({"deleted": True})


@folders_bp.route("/folders/move", methods=["POST"])
def move_items():
    """Put documents and/or signature requests in a folder (folder_id null: no folder)."""
    owner_id = _account()
    if owner_id is None:
        return _error("Create a free account to use folders.", 401)
    data = request.get_json(silent=True) or {}
    folder_id = data.get("folder_id") or None
    document_ids = [str(d) for d in (data.get("document_ids") or [])][:500]
    request_ids = [str(r) for r in (data.get("request_ids") or [])][:500]

    if document_ids:
        # Only the account's own documents (the index server knows who owns what)
        manager = current_app.config["INDEX_MANAGER"]()
        owned = {doc["id"] for doc in manager.get_documents_list(owner_id)._getvalue()}
        if any(doc_id not in owned for doc_id in document_ids):
            return _error("One of the documents wasn't found.", 404)

    with connect_db() as conn:
        if folder_id and owned_folder(conn, owner_id, folder_id) is None:
            return _error("That folder doesn't exist.", 404)
        if request_ids:
            found = conn.execute(
                f"SELECT COUNT(*) FROM signature_requests WHERE owner_id = ? AND id IN ({','.join('?' * len(request_ids))})",
                (owner_id, *request_ids),
            ).fetchone()[0]
            if found != len(set(request_ids)):
                return _error("One of the signature requests wasn't found.", 404)
        for doc_id in document_ids:
            if folder_id:
                conn.execute(
                    "INSERT INTO document_folders (doc_id, owner_id, folder_id) VALUES (?, ?, ?)"
                    " ON CONFLICT(doc_id) DO UPDATE SET folder_id = excluded.folder_id",
                    (doc_id, owner_id, folder_id),
                )
            else:
                conn.execute("DELETE FROM document_folders WHERE owner_id = ? AND doc_id = ?", (owner_id, doc_id))
        for request_id in request_ids:
            conn.execute("UPDATE signature_requests SET folder_id = ? WHERE owner_id = ? AND id = ?",
                         (folder_id, owner_id, request_id))
    return jsonify({"moved": len(document_ids) + len(request_ids), "folder_id": folder_id})
