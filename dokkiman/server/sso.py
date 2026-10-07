"""
Single sign-on: check the ID token Google's sign-in button gives the browser.

The browser sends us the token (a JWT signed by Google). We check its
signature against Google's published keys, that it was issued for our client
ID, that it hasn't expired, and that Google has verified the email address.
"""

from google.auth import exceptions as google_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

# Reused between requests (it holds a connection pool to Google)
_google_request = google_requests.Request()


class SsoError(ValueError):
    """The sign-in couldn't be accepted; the message is safe to show users."""


def verify_google_credential(credential, client_id):
    """Return {"subject", "email"} for a valid Google ID token, or raise SsoError."""
    if not credential or len(credential) > 4096:
        raise SsoError("Google sign-in didn't complete. Please try again.")
    try:
        claims = id_token.verify_oauth2_token(credential, _google_request, client_id)
    except google_exceptions.TransportError:
        # Couldn't fetch Google's keys (network trouble)
        raise SsoError("Couldn't reach Google to check your sign-in. Please try again.")
    except (ValueError, google_exceptions.GoogleAuthError):
        # Bad signature, wrong audience or issuer, expired, or not a token at all
        raise SsoError("Google sign-in didn't complete. Please try again.")

    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise SsoError("Google sign-in didn't complete. Please try again.")
    email = str(claims.get("email", "")).strip().lower()
    if not email or claims.get("email_verified") is not True:
        raise SsoError("Your Google account's email address isn't verified.")
    return {"subject": str(claims["sub"]), "email": email}
