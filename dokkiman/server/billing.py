"""
Online payments for Pro with Stripe (subscriptions that renew automatically).

- POST /billing/checkout  starts Stripe Checkout for the monthly or yearly price
- POST /billing/portal    opens Stripe's customer portal (cancel, change card,
                          switch monthly/yearly, invoices)
- POST /billing/webhook   Stripe tells us about payments, renewals and
                          cancellations; this is what actually grants Pro

Pro access is the users.pro_until date (see plans.py): each paid period sets
it to the period's end plus a short grace, so a renewal that's a little late
doesn't interrupt Pro, and a cancelled subscription simply runs out.
Events are mapped to accounts through the Stripe customer ID we store.
"""

import logging
import sqlite3
from datetime import datetime, timedelta, timezone

import stripe
from flask import Blueprint, g, jsonify, request

import config
from db import connect_db
from plans import PLAN_PRO, STATE_PRO, plan_status

log = logging.getLogger(__name__)

billing_bp = Blueprint("billing", __name__, url_prefix="/billing")

LOOKUP_KEYS = {"monthly": "pro_monthly", "yearly": "pro_yearly"}
# Tags our Checkout sessions in the Stripe Dashboard
INTEGRATION_IDENTIFIER = "dokkiman-pro-upgrade-vmvqlnrf"
# A renewal's webhook can arrive a little after the period ends
RENEWAL_GRACE = timedelta(days=2)
ACTIVE_STATUSES = ("active", "trialing", "past_due")  # past_due: Stripe is retrying the card
ENDED_STATUSES = ("canceled", "unpaid", "incomplete_expired", "paused")
HANDLED_EVENTS = (
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
    "invoice.paid",
    "invoice.payment_failed",
)

_price_ids = {}


def payments_enabled():
    return bool(config.STRIPE_SECRET_KEY)


def _client():
    return stripe.StripeClient(config.STRIPE_SECRET_KEY)


def init_billing():
    """Billing columns on users, and the record of Stripe events already handled."""
    with connect_db() as conn:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
        for column, kind in (("stripe_customer_id", "TEXT"), ("stripe_subscription_id", "TEXT"),
                             ("subscription_status", "TEXT"), ("subscription_interval", "TEXT"),
                             ("cancel_at_period_end", "INTEGER NOT NULL DEFAULT 0")):
            if column not in columns:
                conn.execute(f"ALTER TABLE users ADD COLUMN {column} {kind}")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer ON users (stripe_customer_id)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS stripe_events (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                handled_at TEXT NOT NULL
            )"""
        )


def billing_info(user_id):
    """Subscription details for the app (None if the account never subscribed)."""
    with connect_db() as conn:
        row = conn.execute(
            "SELECT stripe_customer_id, stripe_subscription_id, subscription_status, subscription_interval,"
            " cancel_at_period_end, pro_until FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if not row or not row["stripe_customer_id"]:
        return None
    return {
        "has_subscription": bool(row["stripe_subscription_id"]),
        "status": row["subscription_status"],
        "interval": row["subscription_interval"],
        "cancel_at_period_end": bool(row["cancel_at_period_end"]),
        # When the paid period ends (pro_until without the renewal grace)
        "period_end": (datetime.fromisoformat(row["pro_until"]) - RENEWAL_GRACE).isoformat()
        if row["stripe_subscription_id"] and row["pro_until"] else None,
    }


def _error(message, status, code=None):
    body = {"error": message}
    if code:
        body["code"] = code
    return jsonify(body), status


def _price_id(billing):
    """The Stripe price for 'monthly' or 'yearly' (created by stripe_setup.py)."""
    if billing not in _price_ids:
        prices = _client().v1.prices.list({"lookup_keys": [LOOKUP_KEYS[billing]], "active": True, "limit": 1})
        if not prices.data:
            return None
        _price_ids[billing] = prices.data[0].id
    return _price_ids[billing]


def _customer_id_for(user):
    """The account's Stripe customer, created on first use."""
    with connect_db() as conn:
        row = conn.execute("SELECT stripe_customer_id FROM users WHERE id = ?", (user["id"],)).fetchone()
    if row["stripe_customer_id"]:
        return row["stripe_customer_id"]
    customer = _client().v1.customers.create(
        {"email": user["email"], "metadata": {"user_id": user["id"]}},
        {"idempotency_key": f"customer-{user['id']}"},
    )
    with connect_db() as conn:
        conn.execute("UPDATE users SET stripe_customer_id = ? WHERE id = ?", (customer.id, user["id"]))
    return customer.id


def _signed_in_user():
    user = getattr(g, "user", None)
    return None if not user or user.get("guest") else user


@billing_bp.route("/checkout", methods=["POST"])
def checkout():
    if not payments_enabled():
        return _error("Online payments aren't set up yet.", 503)
    user = _signed_in_user()
    if user is None:
        return _error("Sign in to upgrade.", 401)
    billing = (request.get_json(silent=True) or {}).get("billing", "monthly")
    if billing not in LOOKUP_KEYS:
        return _error("Choose monthly or yearly billing.", 400)

    info = billing_info(user["id"])
    if plan_status(user["id"])["state"] == STATE_PRO and info and info["has_subscription"]:
        return _error("You already have Pro. Use Manage billing to change it.", 409, "already_subscribed")

    try:
        price_id = _price_id(billing)
        if not price_id:
            log.error("No Stripe price with lookup key %s; run stripe_setup.py", LOOKUP_KEYS[billing])
            return _error("Online payments aren't set up yet.", 503)
        session = _client().v1.checkout.sessions.create({
            "mode": "subscription",
            "customer": _customer_id_for(user),
            "client_reference_id": user["id"],
            "line_items": [{"price": price_id, "quantity": 1}],
            "allow_promotion_codes": True,
            "success_url": f"{config.PUBLIC_APP_URL}/app/documents?upgrade=success",
            "cancel_url": f"{config.PUBLIC_APP_URL}/pricing?upgrade=cancelled",
            "integration_identifier": INTEGRATION_IDENTIFIER,
        })
    except stripe.StripeError:
        log.exception("Stripe checkout failed")
        return _error("Couldn't start checkout. Please try again in a moment.", 502)
    return jsonify({"url": session.url})


@billing_bp.route("/portal", methods=["POST"])
def portal():
    if not payments_enabled():
        return _error("Online payments aren't set up yet.", 503)
    user = _signed_in_user()
    if user is None:
        return _error("Sign in to manage billing.", 401)
    info = billing_info(user["id"])
    if not info:
        return _error("There's no billing for this account yet.", 404)
    with connect_db() as conn:
        customer_id = conn.execute("SELECT stripe_customer_id FROM users WHERE id = ?", (user["id"],)).fetchone()[0]
    params = {"customer": customer_id, "return_url": f"{config.PUBLIC_APP_URL}/app/documents"}
    if config.STRIPE_PORTAL_CONFIGURATION:
        params["configuration"] = config.STRIPE_PORTAL_CONFIGURATION
    try:
        session = _client().v1.billing_portal.sessions.create(params)
    except stripe.StripeError:
        log.exception("Stripe portal failed")
        return _error("Couldn't open billing. Please try again in a moment.", 502)
    return jsonify({"url": session.url})


# --- webhook -------------------------------------------------------------------------

def _id(value):
    """A Stripe reference may be an ID string or an expanded object."""
    return value if isinstance(value, str) or value is None else value.get("id")


def _subscription_id_of_invoice(invoice):
    # Newer API versions keep it under parent.subscription_details
    parent = invoice.get("parent") or {}
    details = parent.get("subscription_details") or {}
    return _id(details.get("subscription")) or _id(invoice.get("subscription"))


def sync_subscription(subscription_id):
    """Read the subscription's current state from Stripe and apply it to its account.
    Fetching it (rather than trusting the event's copy) makes out-of-order events harmless."""
    # Stripe objects aren't dicts in this SDK; work with a plain copy
    subscription = _client().v1.subscriptions.retrieve(subscription_id).to_dict()
    customer_id = _id(subscription["customer"])
    with connect_db() as conn:
        row = conn.execute(
            "SELECT id, stripe_subscription_id FROM users WHERE stripe_customer_id = ?", (customer_id,)
        ).fetchone()
        if row is None:
            log.warning("Stripe subscription %s belongs to unknown customer %s", subscription_id, customer_id)
            return
        # An old subscription's events mustn't override a newer one
        if row["stripe_subscription_id"] and row["stripe_subscription_id"] != subscription["id"] \
                and subscription["status"] in ENDED_STATUSES:
            return

        items = subscription["items"]["data"]
        period_end = max((item["current_period_end"] for item in items), default=None)
        interval = items[0]["price"]["recurring"]["interval"] if items else None
        status = subscription["status"]
        fields = {
            "stripe_subscription_id": subscription["id"],
            "subscription_status": status,
            "subscription_interval": {"month": "monthly", "year": "yearly"}.get(interval, interval),
            "cancel_at_period_end": int(bool(subscription.get("cancel_at_period_end"))),
        }
        if status in ACTIVE_STATUSES and period_end:
            fields["plan"] = PLAN_PRO
            ends = datetime.fromtimestamp(period_end, timezone.utc) + RENEWAL_GRACE
            fields["pro_until"] = ends.isoformat()
        elif status in ENDED_STATUSES:
            # Pro ends now: the account is back on its trial, or Free
            fields["pro_until"] = datetime.now(timezone.utc).isoformat()
        assignments = ", ".join(f"{name} = ?" for name in fields)
        conn.execute(f"UPDATE users SET {assignments} WHERE id = ?", (*fields.values(), row["id"]))


def _link_customer(customer_id, user_id):
    """Fallback for a checkout whose customer we haven't stored (client_reference_id is our user ID)."""
    if not customer_id or not user_id:
        return
    with connect_db() as conn:
        conn.execute("UPDATE users SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL",
                     (customer_id, user_id))


def handle_event(event):
    """event: a plain dict (Event.to_dict())."""
    obj = event["data"]["object"]
    kind = event["type"]
    if kind == "checkout.session.completed":
        if obj.get("mode") == "subscription" and obj.get("subscription"):
            _link_customer(_id(obj.get("customer")), obj.get("client_reference_id"))
            sync_subscription(_id(obj["subscription"]))
    elif kind.startswith("customer.subscription."):
        sync_subscription(obj["id"])
    elif kind in ("invoice.paid", "invoice.payment_failed"):
        subscription_id = _subscription_id_of_invoice(obj)
        if subscription_id:
            sync_subscription(subscription_id)


@billing_bp.route("/webhook", methods=["POST"])
def webhook():
    if not payments_enabled() or not config.STRIPE_WEBHOOK_SECRET:
        return _error("Webhooks aren't set up.", 503)
    try:
        event = _client().construct_event(
            request.get_data(), request.headers.get("Stripe-Signature"), config.STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.SignatureVerificationError):
        return _error("Invalid signature.", 400)

    if event["type"] not in HANDLED_EVENTS:
        return jsonify({"received": True, "handled": False})
    with connect_db() as conn:
        if conn.execute("SELECT 1 FROM stripe_events WHERE id = ?", (event["id"],)).fetchone():
            return jsonify({"received": True, "duplicate": True})
    event = event.to_dict()
    try:
        handle_event(event)
    except stripe.StripeError:
        # Stripe retries failed deliveries, so a temporary problem fixes itself
        log.exception("Couldn't handle Stripe event %s", event["id"])
        return _error("Temporary problem; please retry.", 500)
    with connect_db() as conn:
        try:
            conn.execute("INSERT INTO stripe_events (id, type, handled_at) VALUES (?, ?, ?)",
                         (event["id"], event["type"], datetime.now(timezone.utc).isoformat()))
        except sqlite3.IntegrityError:
            pass  # handled twice at the same moment; syncing is safe to repeat
        # Keep the record small: Stripe doesn't redeliver events this old
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        conn.execute("DELETE FROM stripe_events WHERE handled_at < ?", (cutoff.isoformat(),))
    return jsonify({"received": True})


def reset_price_cache():
    _price_ids.clear()

