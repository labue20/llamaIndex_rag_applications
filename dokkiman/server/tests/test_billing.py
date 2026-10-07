"""Stripe billing: checkout, customer portal, and webhooks that grant or end Pro.

Stripe's API is replaced by a fake, but webhooks are signed for real, so
Stripe's own signature check runs on every event.
"""

import hashlib
import hmac
import json
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
import stripe

import billing
import config

WEBHOOK_SECRET = "whsec_test_secret"
EXPIRED = "2020-01-01T00:00:00+00:00"


class FakeStripe:
    """Stands in for StripeClient: records requests and serves subscriptions."""

    def __init__(self):
        self.requests = []
        self.subscriptions = {}
        self.customers_created = 0
        self.prices = {"pro_monthly": "price_monthly", "pro_yearly": "price_yearly",
                       "basic_monthly": "price_basic_monthly", "basic_yearly": "price_basic_yearly"}
        self._real = stripe.StripeClient("sk_test_fake")
        ns = SimpleNamespace
        self.v1 = ns(
            prices=ns(list=self._list_prices),
            customers=ns(create=self._create_customer),
            checkout=ns(sessions=ns(create=lambda params: self._record("checkout", params, "https://checkout.stripe.test/c"))),
            billing_portal=ns(sessions=ns(create=lambda params: self._record("portal", params, "https://billing.stripe.test/p"))),
            subscriptions=ns(retrieve=self._retrieve),
        )

    def _list_prices(self, params):
        key = params["lookup_keys"][0]
        return ns_list([SimpleNamespace(id=self.prices[key])] if key in self.prices else [])

    def _create_customer(self, params, options=None):
        self.customers_created += 1
        self.requests.append(("customer", params))
        return SimpleNamespace(id=f"cus_{self.customers_created}")

    def _record(self, kind, params, url):
        self.requests.append((kind, params))
        return SimpleNamespace(url=url)

    def _retrieve(self, subscription_id):
        self.requests.append(("retrieve", subscription_id))
        return stripe.Subscription.construct_from(self.subscriptions[subscription_id], "sk_test_fake")

    def construct_event(self, payload, sig_header, secret):
        return self._real.construct_event(payload, sig_header, secret)

    def add_subscription(self, sub_id="sub_1", customer="cus_1", status="active", interval="month",
                         period_end=None, cancel_at_period_end=False, price=None):
        period_end = period_end or int(time.time()) + 30 * 86400
        self.subscriptions[sub_id] = {
            "id": sub_id, "object": "subscription", "customer": customer, "status": status,
            "cancel_at_period_end": cancel_at_period_end,
            "items": {"object": "list", "data": [{
                "id": f"si_{sub_id}", "object": "subscription_item", "current_period_end": period_end,
                "price": price or {"id": "price_x", "object": "price", "recurring": {"interval": interval}},
            }]},
        }
        return period_end


def ns_list(items):
    return SimpleNamespace(data=items)


@pytest.fixture
def fake_stripe(monkeypatch):
    fake = FakeStripe()
    monkeypatch.setattr(billing, "_client", lambda: fake)
    monkeypatch.setattr(config, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(config, "STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET)
    monkeypatch.setattr(config, "PUBLIC_APP_URL", "https://app.example.com")
    billing.reset_price_cache()
    return fake


def send_event(client, event_type, obj, event_id=None, secret=WEBHOOK_SECRET):
    payload = json.dumps({
        "id": event_id or f"evt_{time.time_ns()}", "object": "event", "type": event_type,
        "api_version": "2026-09-30.endive", "created": int(time.time()), "livemode": False,
        "data": {"object": obj},
    })
    timestamp = int(time.time())
    signature = hmac.new(secret.encode(), f"{timestamp}.{payload}".encode(), hashlib.sha256).hexdigest()
    return client.post("/billing/webhook", data=payload, content_type="application/json",
                       headers={"Stripe-Signature": f"t={timestamp},v1={signature}"})


def plan_of(user_client):
    return user_client.get("/auth/me").get_json()["user"]["plan"]


def subscribe(client, user_client, fake, plan="pro", **subscription):
    """Checkout, then Stripe's checkout.session.completed webhook."""
    assert user_client.post("/billing/checkout", json={"plan": plan, "billing": "monthly"}).status_code == 200
    customer = next(params for kind, params in fake.requests if kind == "checkout")["customer"]
    period_end = fake.add_subscription(customer=customer, **subscription)
    response = send_event(client, "checkout.session.completed", {
        "id": "cs_1", "object": "checkout.session", "mode": "subscription", "customer": customer,
        "subscription": subscription.get("sub_id", "sub_1"), "client_reference_id": user_client.user["id"],
    })
    assert response.status_code == 200
    return customer, period_end


def _set_user(db_path, **fields):
    assignments = ", ".join(f"{name} = ?" for name in fields)
    with sqlite3.connect(db_path) as conn:
        conn.execute(f"UPDATE users SET {assignments}", tuple(fields.values()))


# --- checkout and portal ------------------------------------------------------------

def test_checkout_needs_an_account(client, fake_stripe):
    assert client.post("/billing/checkout", json={"billing": "monthly"}).status_code == 401


def test_checkout_creates_one_customer_and_a_subscription_session(signup, fake_stripe):
    user_client = signup("me@example.com")
    response = user_client.post("/billing/checkout", json={"billing": "yearly"})
    assert response.status_code == 200
    assert response.get_json() == {"url": "https://checkout.stripe.test/c"}

    customer = next(params for kind, params in fake_stripe.requests if kind == "customer")
    assert customer["email"] == "me@example.com"
    session = next(params for kind, params in fake_stripe.requests if kind == "checkout")
    assert session["mode"] == "subscription"
    assert session["line_items"] == [{"price": "price_yearly", "quantity": 1}]
    assert session["customer"] == "cus_1"
    assert session["client_reference_id"] == user_client.user["id"]
    assert session["success_url"] == "https://app.example.com/app/documents?upgrade=success"
    assert session["cancel_url"] == "https://app.example.com/pricing?upgrade=cancelled"
    assert session["integration_identifier"] == billing.INTEGRATION_IDENTIFIER
    # Stripe picks payment methods itself (cards, wallets...)
    assert "payment_method_types" not in session

    user_client.post("/billing/checkout", json={"billing": "monthly"})
    assert fake_stripe.customers_created == 1  # reused


def test_checkout_rejects_an_unknown_billing_period(signup, fake_stripe):
    assert signup().post("/billing/checkout", json={"billing": "weekly"}).status_code == 400


def test_checkout_for_basic_uses_the_basic_price(signup, fake_stripe):
    user_client = signup()
    assert user_client.post("/billing/checkout", json={"plan": "basic", "billing": "yearly"}).status_code == 200
    session = next(params for kind, params in fake_stripe.requests if kind == "checkout")
    assert session["line_items"] == [{"price": "price_basic_yearly", "quantity": 1}]


def test_checkout_rejects_an_unknown_plan(signup, fake_stripe):
    assert signup().post("/billing/checkout", json={"plan": "trial", "billing": "monthly"}).status_code == 400


def test_checkout_without_stripe_or_prices_explains(signup, fake_stripe, monkeypatch):
    user_client = signup()
    fake_stripe.prices = {}
    assert user_client.post("/billing/checkout", json={}).status_code == 503
    monkeypatch.setattr(config, "STRIPE_SECRET_KEY", "")
    assert user_client.post("/billing/checkout", json={}).status_code == 503


def test_subscribers_are_sent_to_manage_billing_instead(client, signup, fake_stripe):
    user_client = signup()
    subscribe(client, user_client, fake_stripe)
    again = user_client.post("/billing/checkout", json={"billing": "yearly"})
    assert again.status_code == 409
    assert again.get_json()["code"] == "already_subscribed"


def test_portal(client, signup, fake_stripe, monkeypatch):
    user_client = signup()
    assert user_client.post("/billing/portal").status_code == 404  # never subscribed

    subscribe(client, user_client, fake_stripe)
    monkeypatch.setattr(config, "STRIPE_PORTAL_CONFIGURATION", "bpc_123")
    response = user_client.post("/billing/portal")
    assert response.get_json() == {"url": "https://billing.stripe.test/p"}
    params = [p for kind, p in fake_stripe.requests if kind == "portal"][-1]
    assert params == {"customer": "cus_1", "return_url": "https://app.example.com/app/documents",
                      "configuration": "bpc_123"}


# --- webhooks -------------------------------------------------------------------------

def test_webhooks_must_be_signed(client, fake_stripe):
    assert send_event(client, "invoice.paid", {"id": "in_1"}, secret="whsec_wrong").status_code == 400
    unsigned = client.post("/billing/webhook", data="{}", content_type="application/json")
    assert unsigned.status_code == 400


def test_webhooks_off_without_a_signing_secret(client, fake_stripe, monkeypatch):
    monkeypatch.setattr(config, "STRIPE_WEBHOOK_SECRET", "")
    assert send_event(client, "invoice.paid", {"id": "in_1"}).status_code == 503


def test_payment_makes_the_account_pro_until_the_period_ends(client, signup, fake_stripe):
    user_client = signup()
    _, period_end = subscribe(client, user_client, fake_stripe)

    plan = plan_of(user_client)
    assert plan["state"] == "pro"
    expected = datetime.fromtimestamp(period_end, timezone.utc) + billing.RENEWAL_GRACE
    assert datetime.fromisoformat(plan["pro_until"]) == expected
    assert plan["billing"] == {"has_subscription": True, "status": "active", "interval": "monthly",
                               "cancel_at_period_end": False,
                               "period_end": datetime.fromtimestamp(period_end, timezone.utc).isoformat()}


BASIC_PRICE = {"id": "price_basic_monthly", "object": "price", "lookup_key": "basic_monthly",
              "metadata": {"plan": "basic"}, "recurring": {"interval": "month"}}
PRO_PRICE = {"id": "price_monthly", "object": "price", "lookup_key": "pro_monthly",
             "metadata": {"plan": "pro"}, "recurring": {"interval": "month"}}


def test_paying_for_basic_makes_the_account_basic(client, signup, fake_stripe):
    user_client = signup()
    subscribe(client, user_client, fake_stripe, plan="basic", price=BASIC_PRICE)
    plan = plan_of(user_client)
    assert plan["state"] == "basic"
    assert plan["limits"]["max_documents"] == config.BASIC_MAX_DOCUMENTS
    assert plan["billing"]["has_subscription"] is True

    # A Basic subscriber is sent to Manage billing to change plan, not a second checkout
    again = user_client.post("/billing/checkout", json={"plan": "pro", "billing": "monthly"})
    assert again.status_code == 409
    assert again.get_json()["code"] == "already_subscribed"


def test_switching_plan_in_the_portal_changes_the_account(client, signup, fake_stripe):
    user_client = signup()
    customer, _ = subscribe(client, user_client, fake_stripe, plan="basic", price=BASIC_PRICE)

    # Basic -> Pro: Stripe changes the subscription's price
    fake_stripe.add_subscription(customer=customer, price=PRO_PRICE)
    send_event(client, "customer.subscription.updated", {"id": "sub_1", "object": "subscription"})
    assert plan_of(user_client)["state"] == "pro"

    # And back
    fake_stripe.add_subscription(customer=customer, price=BASIC_PRICE)
    send_event(client, "customer.subscription.updated", {"id": "sub_1", "object": "subscription"})
    assert plan_of(user_client)["state"] == "basic"


@pytest.mark.parametrize("price,expected", [
    ({"metadata": {"plan": "basic"}}, "basic"),
    ({"lookup_key": "basic_yearly"}, "basic"),
    ({"lookup_key": "pro_monthly"}, "pro"),
    # A Pro price from before Basic existed, which has lost its lookup key to a newer price
    ({"lookup_key": None, "metadata": {}}, "pro"),
])
def test_the_plan_comes_from_the_subscribed_price(price, expected):
    assert billing._plan_of_price(price) == expected


def test_duplicate_events_are_handled_once(client, signup, fake_stripe):
    user_client = signup()
    subscribe(client, user_client, fake_stripe)
    retrieves = lambda: sum(1 for kind, _ in fake_stripe.requests if kind == "retrieve")
    obj = {"id": "sub_1", "object": "subscription"}
    send_event(client, "customer.subscription.updated", obj, event_id="evt_same")
    before = retrieves()
    duplicate = send_event(client, "customer.subscription.updated", obj, event_id="evt_same")
    assert duplicate.get_json()["duplicate"] is True
    assert retrieves() == before


def test_cancelling_keeps_pro_until_the_end_then_free(client, signup, fake_stripe, fresh_db):
    user_client = signup()
    _set_user(fresh_db, trial_ends_at=EXPIRED)
    customer, period_end = subscribe(client, user_client, fake_stripe)

    # Cancelled in the portal: still active until the period ends
    fake_stripe.add_subscription(customer=customer, period_end=period_end, cancel_at_period_end=True)
    send_event(client, "customer.subscription.updated", {"id": "sub_1", "object": "subscription"})
    plan = plan_of(user_client)
    assert plan["state"] == "pro"
    assert plan["billing"]["cancel_at_period_end"] is True

    # The period ended: Stripe deletes the subscription
    fake_stripe.add_subscription(customer=customer, period_end=period_end, status="canceled")
    send_event(client, "customer.subscription.deleted", {"id": "sub_1", "object": "subscription"})
    assert plan_of(user_client)["state"] == "free"


def test_renewal_extends_pro(client, signup, fake_stripe):
    user_client = signup()
    customer, period_end = subscribe(client, user_client, fake_stripe)
    next_end = period_end + 30 * 86400
    fake_stripe.add_subscription(customer=customer, period_end=next_end)
    # Newer API versions put the subscription under parent.subscription_details
    send_event(client, "invoice.paid", {"id": "in_2", "object": "invoice", "parent": {
        "type": "subscription_details", "subscription_details": {"subscription": "sub_1"}}})
    expected = datetime.fromtimestamp(next_end, timezone.utc) + billing.RENEWAL_GRACE
    assert datetime.fromisoformat(plan_of(user_client)["pro_until"]) == expected


def test_failed_payment_keeps_pro_while_stripe_retries(client, signup, fake_stripe):
    user_client = signup()
    customer, period_end = subscribe(client, user_client, fake_stripe)
    fake_stripe.add_subscription(customer=customer, period_end=period_end, status="past_due")
    send_event(client, "invoice.payment_failed", {"id": "in_3", "object": "invoice", "subscription": "sub_1"})
    plan = plan_of(user_client)
    assert plan["state"] == "pro"
    assert plan["billing"]["status"] == "past_due"


def test_an_old_subscription_ending_does_not_end_a_newer_one(client, signup, fake_stripe):
    user_client = signup()
    customer, _ = subscribe(client, user_client, fake_stripe, sub_id="sub_new")
    fake_stripe.add_subscription(sub_id="sub_old", customer=customer, status="canceled")
    send_event(client, "customer.subscription.deleted", {"id": "sub_old", "object": "subscription"})
    assert plan_of(user_client)["state"] == "pro"


def test_events_for_unknown_customers_are_ignored(client, fake_stripe):
    fake_stripe.add_subscription(customer="cus_stranger")
    response = send_event(client, "customer.subscription.updated", {"id": "sub_1", "object": "subscription"})
    assert response.status_code == 200


def test_other_event_types_are_acknowledged(client, fake_stripe):
    response = send_event(client, "charge.succeeded", {"id": "ch_1", "object": "charge"})
    assert response.get_json() == {"received": True, "handled": False}


def test_stripe_outage_asks_stripe_to_retry(client, signup, fake_stripe, monkeypatch):
    user_client = signup()
    subscribe(client, user_client, fake_stripe)

    def outage(_):
        raise stripe.APIConnectionError("down")
    monkeypatch.setattr(fake_stripe.v1.subscriptions, "retrieve", outage)
    response = send_event(client, "customer.subscription.updated", {"id": "sub_1", "object": "subscription"},
                          event_id="evt_retry")
    assert response.status_code == 500
    # Not recorded as handled, so Stripe's retry is processed
    monkeypatch.setattr(fake_stripe.v1.subscriptions, "retrieve", fake_stripe._retrieve)
    assert send_event(client, "customer.subscription.updated", {"id": "sub_1", "object": "subscription"},
                      event_id="evt_retry").get_json() == {"received": True}


def test_plan_terms_say_online_payments_are_on(client, fake_stripe):
    assert client.get("/plans").get_json()["online_payments"] is True


def test_pro_given_by_hand_still_works_without_stripe(signup, fresh_db):
    user_client = signup()
    _set_user(fresh_db, plan="pro")
    plan = plan_of(user_client)
    assert plan["state"] == "pro"
    assert plan["billing"] is None


# --- choosing the Stripe key ----------------------------------------------------------

@pytest.mark.parametrize("env,expected_key,problem", [
    ({}, "", ""),  # no keys: payments off
    ({"STRIPE_SECRET_TEST_KEY": "rk_test_abc", "STRIPE_SECRET_KEY": "rk_live_xyz"}, "rk_test_abc", ""),
    ({"STRIPE_MODE": "live", "STRIPE_SECRET_TEST_KEY": "rk_test_abc", "STRIPE_SECRET_KEY": "rk_live_xyz"},
     "rk_live_xyz", ""),
    # A live key where a test key belongs (or the reverse) is refused
    ({"STRIPE_SECRET_TEST_KEY": "rk_live_xyz"}, "", "isn't a test-mode key"),
    ({"STRIPE_MODE": "live", "STRIPE_SECRET_KEY": "sk_test_abc"}, "", "isn't a live-mode key"),
    ({"STRIPE_MODE": "production", "STRIPE_SECRET_KEY": "rk_live_xyz"}, "", "must be test or live"),
])
def test_the_key_follows_stripe_mode_and_test_is_the_default(monkeypatch, env, expected_key, problem):
    import importlib

    for name in ("STRIPE_MODE", "STRIPE_SECRET_KEY", "STRIPE_SECRET_TEST_KEY"):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    try:
        reloaded = importlib.reload(config)
        assert reloaded.STRIPE_SECRET_KEY == expected_key
        assert problem in reloaded.STRIPE_CONFIG_ERROR
        if not problem:
            assert reloaded.STRIPE_CONFIG_ERROR == ""
    finally:
        monkeypatch.undo()
        importlib.reload(config)
