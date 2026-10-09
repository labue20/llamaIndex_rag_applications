"""
Deleting an account (DELETE /account): the person removes everything of theirs
from the service, as the privacy policy promises.

Deleted: documents (index entries and uploaded files), folders, signature
requests (with their files), signing audit records, usage counts, the Google
sign-in link and the account. Kept: Stripe's own billing records (invoices,
which the law requires keeping); backups age out within 40 days.

A paid plan that's still renewing has to be cancelled first (in Manage billing),
so nobody is charged after deleting their account.
"""

import logging
import shutil

from flask import Blueprint, current_app, g, jsonify, request, session

from billing import ACTIVE_STATUSES, billing_info
from db import connect_db
from signature_requests import _folder as request_folder

log = logging.getLogger(__name__)

account_bp = Blueprint("account", __name__)

CONFIRMATION = "DELETE"


def _error(message, status, code=None):
    body = {"error": message}
    if code:
        body["code"] = code
    return jsonify(body), status


def delete_account_data(user_id):
    """Remove everything stored for an account (and the account)."""
    # Documents live in the index server, which also deletes the uploaded files
    manager = current_app.config["INDEX_MANAGER"]()
    for document in manager.get_documents_list(user_id)._getvalue():
        result = manager.delete_document(document["id"], user_id)._getvalue()
        if result.get("error"):
            log.error("Deleting account %s: document %s: %s", user_id, document["id"], result["error"])

    with connect_db() as conn:
        request_ids = [row[0] for row in conn.execute(
            "SELECT id FROM signature_requests WHERE owner_id = ?", (user_id,))]
        for request_id in request_ids:
            for table in ("signature_request_fields", "signature_request_events", "signature_request_signers"):
                conn.execute(f"DELETE FROM {table} WHERE request_id = ?", (request_id,))
        conn.execute("DELETE FROM signature_requests WHERE owner_id = ?", (user_id,))
        for table, column in (
            ("document_folders", "owner_id"),
            ("folders", "owner_id"),
            ("signature_audit", "user_id"),
            ("daily_usage", "user_id"),
            ("user_identities", "user_id"),
            ("users", "id"),
        ):
            conn.execute(f"DELETE FROM {table} WHERE {column} = ?", (user_id,))
    for request_id in request_ids:
        shutil.rmtree(request_folder(request_id), ignore_errors=True)


@account_bp.route("/account", methods=["DELETE"])
def delete_account():
    user = getattr(g, "user", None)
    if not user or user.get("guest"):
        return _error("Sign in to delete your account.", 401)
    if str((request.get_json(silent=True) or {}).get("confirm", "")).strip().upper() != CONFIRMATION:
        return _error(f"Type {CONFIRMATION} to confirm.", 400, "confirmation_required")

    billing = billing_info(user["id"])
    if billing and billing["has_subscription"] and billing["status"] in ACTIVE_STATUSES \
            and not billing["cancel_at_period_end"]:
        return _error("Cancel your subscription first, in Manage billing, so you aren't charged again. "
                      "Then you can delete your account.", 409, "subscription_active")

    delete_account_data(user["id"])
    log.info("Account %s deleted at the owner's request", user["id"])
    session.clear()
    return jsonify({"deleted": True})
