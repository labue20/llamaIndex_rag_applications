"""
gunicorn settings for running the Flask API in production.

    gunicorn -c gunicorn.conf.py flask_demo:app

Used by deploy/systemd/dokkiman-api.service. The API listens on localhost only;
Caddy is the public entry point.
"""

import os

bind = f"127.0.0.1:{os.environ.get('API_PORT', '5601')}"

# One worker process: failed-login throttling and the LibreOffice conversion
# lock live in process memory. Threads serve concurrent requests.
workers = 1
threads = int(os.environ.get("GUNICORN_THREADS", "8"))

# Indexing a long PDF or converting a document can take a while
timeout = 300
graceful_timeout = 30

# Log to stdout/stderr, collected by systemd (journalctl -u dokkiman-api)
accesslog = "-"
errorlog = "-"
loglevel = "info"
