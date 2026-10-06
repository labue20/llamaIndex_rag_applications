"""
Manage accounts and plans from the command line (until payments are added).

Run from the server/ folder:
    .venv/bin/python manage_users.py list
    .venv/bin/python manage_users.py upgrade someone@example.com
    .venv/bin/python manage_users.py downgrade someone@example.com
    .venv/bin/python manage_users.py extend-trial someone@example.com 7

Changes apply on the user's next request; no restart needed.
"""

import argparse
import sys
from datetime import datetime, timedelta, timezone

from db import connect_db
from plans import PLAN_PRO, PLAN_TRIAL, init_plans, plan_status


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
        if status["state"] == "pro":
            label = "pro"
        elif status["state"] == "trial":
            label = f"trial, {status['trial_days_left']} day(s) left"
        else:
            label = "trial ended"
        print(f"{row['email']:<36} {label:<22} {row['created_at'][:10]}")


def set_plan(args, plan):
    with connect_db() as conn:
        user = _find_user(conn, args.email)
        conn.execute("UPDATE users SET plan = ? WHERE id = ?", (plan, user["id"]))
    print(f"{user['email']} is now on the {plan} plan.")


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


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("list", help="List accounts and their plan status")
    for name, help_text in [("upgrade", "Move an account to the pro plan (no limits)"),
                            ("downgrade", "Move an account back to the trial plan")]:
        command = commands.add_parser(name, help=help_text)
        command.add_argument("email")
    extend = commands.add_parser("extend-trial", help="Add days to an account's trial")
    extend.add_argument("email")
    extend.add_argument("days", type=int)

    args = parser.parse_args()
    init_plans()
    if args.command == "list":
        list_users(args)
    elif args.command == "upgrade":
        set_plan(args, PLAN_PRO)
    elif args.command == "downgrade":
        set_plan(args, PLAN_TRIAL)
    elif args.command == "extend-trial":
        extend_trial(args)


if __name__ == "__main__":
    main()
