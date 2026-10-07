"""
Set up Stripe for Pro (run once per Stripe account / sandbox, and again after
changing PRO_PRICE_MONTHLY or PRO_PRICE_YEARLY).

Run from the server/ folder, with STRIPE_SECRET_KEY in .env:
    .venv/bin/python stripe_setup.py
    .venv/bin/python stripe_setup.py --webhook-url https://yourdomain.com/api/billing/webhook

It creates (or reuses):
- the "Pro" product with a monthly and a yearly price (lookup keys pro_monthly
  and pro_yearly, which the app uses to find them)
- customer portal settings: cancel at the end of the period, switch between
  monthly and yearly, update the card, see invoices
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
from billing import HANDLED_EVENTS, LOOKUP_KEYS  # noqa: E402

PRODUCT_NAME = "Pro"
INTERVALS = {"monthly": "month", "yearly": "year"}


def _amount(billing):
    dollars = config.PRO_PRICE_MONTHLY if billing == "monthly" else config.PRO_PRICE_YEARLY
    return int(round(dollars * 100))


def ensure_prices(client):
    """The Pro product and its two prices; returns (product_id, {billing: price_id})."""
    existing = {p.lookup_key: p for p in client.v1.prices.list(
        {"lookup_keys": list(LOOKUP_KEYS.values()), "active": True, "expand": ["data.product"]}).data}

    product_id = next((p.product.id for p in existing.values()), None)
    if product_id is None:
        product = client.v1.products.create({
            "name": PRODUCT_NAME,
            "description": "Unlimited documents, AI questions and file conversions.",
        })
        product_id = product.id
        print(f"Created product {PRODUCT_NAME} ({product_id})")

    price_ids = {}
    for billing, lookup_key in LOOKUP_KEYS.items():
        price = existing.get(lookup_key)
        if price and price.unit_amount == _amount(billing) and price.currency == "usd":
            price_ids[billing] = price.id
            print(f"Using {billing} price {price.id} (${price.unit_amount / 100:g})")
            continue
        # New amount: a new price takes over the lookup key; existing subscribers keep theirs
        price = client.v1.prices.create({
            "product": product_id,
            "currency": "usd",
            "unit_amount": _amount(billing),
            "recurring": {"interval": INTERVALS[billing]},
            "lookup_key": lookup_key,
            "transfer_lookup_key": True,
        })
        price_ids[billing] = price.id
        print(f"Created {billing} price {price.id} (${price.unit_amount / 100:g})")
    return product_id, price_ids


def create_portal_configuration(client, product_id, price_ids):
    configuration = client.v1.billing_portal.configurations.create({
        "business_profile": {"headline": "Manage your Pro plan"},
        "features": {
            "invoice_history": {"enabled": True},
            "payment_method_update": {"enabled": True},
            "subscription_cancel": {
                "enabled": True,
                "mode": "at_period_end",  # keep Pro until the end of the paid period
                "cancellation_reason": {
                    "enabled": True,
                    "options": ["too_expensive", "unused", "missing_features", "switched_service", "other"],
                },
            },
            "subscription_update": {
                "enabled": True,
                "default_allowed_updates": ["price"],
                "products": [{"product": product_id, "prices": list(price_ids.values())}],
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
        "description": "RAG Web Application: Pro subscriptions",
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
    product_id, price_ids = ensure_prices(client)
    portal_id = create_portal_configuration(client, product_id, price_ids)

    print("\nAdd to server/.env:")
    print(f"STRIPE_PORTAL_CONFIGURATION={portal_id}")
    if args.webhook_url:
        print(f"STRIPE_WEBHOOK_SECRET={create_webhook(client, args.webhook_url)}")
    elif not os.environ.get("STRIPE_WEBHOOK_SECRET"):
        print("STRIPE_WEBHOOK_SECRET=<from `stripe listen` when testing locally>")


if __name__ == "__main__":
    main()
