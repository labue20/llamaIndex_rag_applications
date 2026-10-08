"""
Set up Stripe for Basic and Pro (run once per Stripe account / sandbox, and
again after changing BASIC_PRICE_* or PRO_PRICE_*).

Run from the server/ folder, with STRIPE_SECRET_KEY in .env:
    .venv/bin/python stripe_setup.py
    .venv/bin/python stripe_setup.py --webhook-url https://yourdomain.com/api/billing/webhook

It creates (or reuses):
- the "Basic" and "Pro" products, each with a monthly price (lookup keys
  basic_monthly and pro_monthly, which the app uses to find them; each price's
  metadata says which plan it is for), and a yearly price too with
  YEARLY_BILLING=true (basic_yearly, pro_yearly)
- customer portal settings: cancel at the end of the period, switch between
  monthly and yearly or Basic and Pro, update the card, see invoices
- with --webhook-url: the production webhook endpoint (prints its signing
  secret for STRIPE_WEBHOOK_SECRET). For local testing use `stripe listen` instead.
"""

import argparse
import os
import sys

import stripe


def _load_env_file(path=".env"):
    """Read KEY=VALUE lines from server/.env (start_services.sh does the same for the app)."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("'\""))


_load_env_file()

import config  # noqa: E402  (reads the environment loaded above)
from billing import HANDLED_EVENTS, LOOKUP_KEYS, billing_periods  # noqa: E402
from plans import PLAN_BASIC, PLAN_PRO  # noqa: E402

INTERVALS = {"monthly": "month", "yearly": "year"}


def _products():
    """Name, description and prices (dollars) of each paid plan's product."""
    return {
        PLAN_BASIC: {
            "name": "Basic",
            "description": f"Up to {config.BASIC_MAX_DOCUMENTS} documents, {config.BASIC_MAX_QUESTIONS_PER_DAY} AI "
                           "questions a day and unlimited file conversions.",
            "prices": {"monthly": config.BASIC_PRICE_MONTHLY, "yearly": config.BASIC_PRICE_YEARLY},
        },
        PLAN_PRO: {
            "name": "Pro",
            "description": "Unlimited documents, AI questions and file conversions.",
            "prices": {"monthly": config.PRO_PRICE_MONTHLY, "yearly": config.PRO_PRICE_YEARLY},
        },
    }


def _cents(dollars):
    return int(round(dollars * 100))


def ensure_prices(client, plan):
    """A plan's product and its two prices; returns (product_id, {billing: price_id})."""
    product_info = _products()[plan]
    lookup_keys = {billing: key for billing, key in LOOKUP_KEYS[plan].items() if billing in billing_periods()}
    existing = {p.lookup_key: p for p in client.v1.prices.list(
        {"lookup_keys": list(lookup_keys.values()), "active": True, "expand": ["data.product"]}).data}

    product_id = next((p.product.id for p in existing.values()), None)
    if product_id is None:
        product = client.v1.products.create({
            "name": product_info["name"],
            "description": product_info["description"],
            "metadata": {"plan": plan},
        })
        product_id = product.id
        print(f"Created product {product_info['name']} ({product_id})")

    price_ids = {}
    for billing, lookup_key in lookup_keys.items():
        amount = _cents(product_info["prices"][billing])
        price = existing.get(lookup_key)
        if price and price.unit_amount == amount and price.currency == "usd":
            price_ids[billing] = price.id
            print(f"Using {product_info['name']} {billing} price {price.id} (${price.unit_amount / 100:g})")
            continue
        # New amount: a new price takes over the lookup key; existing subscribers keep theirs
        price = client.v1.prices.create({
            "product": product_id,
            "currency": "usd",
            "unit_amount": amount,
            "recurring": {"interval": INTERVALS[billing]},
            "lookup_key": lookup_key,
            "transfer_lookup_key": True,
            # Tells the webhook which plan a subscription is for
            "metadata": {"plan": plan},
        })
        price_ids[billing] = price.id
        print(f"Created {product_info['name']} {billing} price {price.id} (${price.unit_amount / 100:g})")
    return product_id, price_ids


def create_portal_configuration(client, products):
    """products: {plan: (product_id, {billing: price_id})}."""
    configuration = client.v1.billing_portal.configurations.create({
        "business_profile": {"headline": "Manage your Dokkiman plan"},
        "features": {
            "invoice_history": {"enabled": True},
            "payment_method_update": {"enabled": True},
            "subscription_cancel": {
                "enabled": True,
                "mode": "at_period_end",  # keep the plan until the end of the paid period
                "cancellation_reason": {
                    "enabled": True,
                    "options": ["too_expensive", "unused", "missing_features", "switched_service", "other"],
                },
            },
            "subscription_update": {
                "enabled": True,
                "default_allowed_updates": ["price"],
                # Switch between monthly and yearly, and between Basic and Pro
                "products": [{"product": product_id, "prices": list(price_ids.values())}
                             for product_id, price_ids in products.values()],
                "proration_behavior": "create_prorations",
            },
        },
    })
    print(f"Created customer portal settings {configuration.id}")
    return configuration.id


def create_webhook(client, url):
    endpoint = client.v1.webhook_endpoints.create({
        "url": url,
        "enabled_events": list(HANDLED_EVENTS),
        "description": "Dokkiman: Basic and Pro subscriptions",
    })
    print(f"Created webhook endpoint {endpoint.id} for {url}")
    return endpoint.secret


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--webhook-url", help="Production webhook URL (https://.../api/billing/webhook)")
    args = parser.parse_args()

    if config.STRIPE_CONFIG_ERROR:
        sys.exit(f"Stripe settings problem: {config.STRIPE_CONFIG_ERROR}")
    if not config.STRIPE_SECRET_KEY:
        key_name = "STRIPE_SECRET_TEST_KEY" if config.STRIPE_MODE == "test" else "STRIPE_SECRET_KEY"
        sys.exit(f"Set {key_name} in server/.env first (STRIPE_MODE is {config.STRIPE_MODE}).")
    print(f"Stripe {config.STRIPE_MODE.upper()} mode")

    client = stripe.StripeClient(config.STRIPE_SECRET_KEY)
    products = {plan: ensure_prices(client, plan) for plan in LOOKUP_KEYS}
    portal_id = create_portal_configuration(client, products)

    print("\nAdd to server/.env:")
    print(f"STRIPE_PORTAL_CONFIGURATION={portal_id}")
    if args.webhook_url:
        print(f"STRIPE_WEBHOOK_SECRET={create_webhook(client, args.webhook_url)}")
    elif not os.environ.get("STRIPE_WEBHOOK_SECRET"):
        print("STRIPE_WEBHOOK_SECRET=<from `stripe listen` when testing locally>")


if __name__ == "__main__":
    main()
