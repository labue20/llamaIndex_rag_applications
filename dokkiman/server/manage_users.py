"""
Manage accounts and plans from the command line (until payments are added).

Run from the server/ folder:
    .venv/bin/python manage_users.py list
    .venv/bin/python manage_users.py upgrade someone@example.com --months 1
    .venv/bin/python manage_users.py upgrade someone@example.com --years 1
    .venv/bin/python manage_users.py upgrade someone@example.com --plan basic --months 1
    .venv/bin/python manage_users.py downgrade someone@example.com
    .venv/bin/python manage_users.py extend-trial someone@example.com 7
    .venv/bin/python manage_users.py reset-password someone@example.com

reset-password prints a temporary password to give the person (there's no
email sending yet); they should change it from the account menu after logging in.

Changes apply on the user's next request; no restart needed.
"""

import argparse
import secrets
import sys
from datetime import datetime, timedelta, timezone

from db import connect_db
from auth import init_db, set_password
from plans import PAID_PLANS, PLAN_PRO, PLAN_TRIAL, plan_status


def _find_user(conn, email):
    row = conn.execute("SELECT id, email FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    if row is None:
        sys.exit(f"No account with email {email}")
    return row


def list_users(_args):
    with connect_db() as conn:
        rows = conn.execute("SELECT id, email, created_at FROM users ORDER BY created_at").fetchall()
    if not rows:
        print("No accounts.")
        return
    print(f"{'EMAIL':<36} {'STATUS':<22} CREATED")
    for row in rows:
        status = plan_status(row["id"])
        if status["state"] in PAID_PLANS:
            name = status["state"]
            label = f"{name} until {status['pro_until'][:10]}" if status.get("pro_until") else f"{name} (no end date)"
        elif status["state"] == "trial":
            label = f"trial, {status['trial_days_left']} day(s) left"
        else:
            label = "free (trial ended)"
        print(f"{row['email']:<36} {label:<22} {row['created_at'][:10]}")


def _add_months(when, months):
    """Same day of the month, `months` later (the 31st becomes the month's last day)."""
    month_index = when.month - 1 + months
    year, month = when.year + month_index // 12, month_index % 12 + 1
    days_in_month = (datetime(year + month // 12, month % 12 + 1, 1) - timedelta(days=1)).day
    return when.replace(year=year, month=month, day=min(when.day, days_in_month))


def upgrade(args):
    """Basic or Pro for the period paid for. Renewing the same plan extends from its current end date."""
    months = args.months + 12 * args.years
    with connect_db() as conn:
        user = _find_user(conn, args.email)
        row = conn.execute("SELECT plan, pro_until FROM users WHERE id = ?", (user["id"],)).fetchone()
        now = datetime.now(timezone.utc)
        if months:
            current_end = datetime.fromisoformat(row["pro_until"]) if row["pro_until"] else now
            start = current_end if row["plan"] == args.plan and current_end > now else now
            pro_until = _add_months(start, months).isoformat()
        else:
            pro_until = None
        conn.execute("UPDATE users SET plan = ?, pro_until = ? WHERE id = ?", (args.plan, pro_until, user["id"]))
    name = args.plan.capitalize()
    if pro_until:
        print(f"{user['email']} is on {name} until {pro_until[:10]}; after that the account moves to the Free plan.")
    else:
        print(f"{user['email']} is on {name} with no end date (use --months or --years for a paid period).")


def downgrade(args):
    with connect_db() as conn:
        user = _find_user(conn, args.email)
        conn.execute("UPDATE users SET plan = ?, pro_until = NULL WHERE id = ?", (PLAN_TRIAL, user["id"]))
    print(f"{user['email']} is no longer on a paid plan (back to its trial, or the Free plan if the trial ended).")


def extend_trial(args):
    with connect_db() as conn:
        user = _find_user(conn, args.email)
        row = conn.execute("SELECT trial_ends_at FROM users WHERE id = ?", (user["id"],)).fetchone()
        now = datetime.now(timezone.utc)
        current_end = datetime.fromisoformat(row["trial_ends_at"]) if row["trial_ends_at"] else now
        # Extend from today if the trial already ended, otherwise from its current end
        new_end = max(current_end, now) + timedelta(days=args.days)
        conn.execute("UPDATE users SET trial_ends_at = ? WHERE id = ?", (new_end.isoformat(), user["id"]))
    print(f"{user['email']}'s trial now ends {new_end:%Y-%m-%d %H:%M} UTC.")


def reset_password(args):
    with connect_db() as conn:
        user = _find_user(conn, args.email)
    temporary = secrets.token_urlsafe(9)
    set_password(user["id"], temporary)
    print(f"{user['email']}'s password was reset and they were signed out everywhere.")
    print(f"Temporary password: {temporary}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("list", help="List accounts and their plan status")
    upgrade_command = commands.add_parser("upgrade", help="Move an account to Basic or Pro for the period paid for")
    upgrade_command.add_argument("email")
    upgrade_command.add_argument("--plan", choices=PAID_PLANS, default=PLAN_PRO, help="Plan paid for (default: pro)")
    upgrade_command.add_argument("--months", type=int, default=0, help="Months paid for")
    upgrade_command.add_argument("--years", type=int, default=0, help="Years paid for")
    downgrade_command = commands.add_parser("downgrade", help="Move an account off its paid plan now")
    downgrade_command.add_argument("email")
    extend = commands.add_parser("extend-trial", help="Add days to an account's trial")
    extend.add_argument("email")
    extend.add_argument("days", type=int)
    reset = commands.add_parser("reset-password", help="Set a temporary password and sign the account out")
    reset.add_argument("email")

    args = parser.parse_args()
    init_db()
    if args.command == "list":
        list_users(args)
    elif args.command == "upgrade":
        upgrade(args)
    elif args.command == "downgrade":
        downgrade(args)
    elif args.command == "extend-trial":
        extend_trial(args)
    elif args.command == "reset-password":
        reset_password(args)


if __name__ == "__main__":
    main()
