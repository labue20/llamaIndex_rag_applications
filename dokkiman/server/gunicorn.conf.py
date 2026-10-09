"""
gunicorn settings for running the Flask API in production.

    gunicorn -c gunicorn.conf.py flask_demo:app

Used by deploy/systemd/dokkiman-api.service. The API listens on localhost only;
Caddy is the public entry point.
"""

import os
import re

from gunicorn.glogging import Logger

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


# Signing links (/sign/<token>, /signing/<token>) let whoever has them sign a
# document: keep the token out of the access log, in the path and the referrer
SIGNING_TOKEN = re.compile(r"(/sign(?:ing)?/)[A-Za-z0-9_-]{20,}")


class RedactingLogger(Logger):
    def atoms(self, resp, req, environ, request_time):
        atoms = super().atoms(resp, req, environ, request_time)
        # Every field: the request line, path and referrer, and their raw copies
        return {key: SIGNING_TOKEN.sub(r"\1[token]", value) if isinstance(value, str) else value
                for key, value in atoms.items()}


logger_class = RedactingLogger
