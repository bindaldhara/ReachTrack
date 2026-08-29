from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode
from uuid import UUID

import httpx


def _raw_url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)

SCOPE_READONLY = "https://www.googleapis.com/auth/gmail.readonly"
SCOPE_EMAIL = "https://www.googleapis.com/auth/userinfo.email"

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


class NotConfiguredError(Exception):
    pass


@dataclass
class TokenSet:
    access_token: str
    refresh_token: str
    expires_at: datetime
    scopes: str


@dataclass
class _StatePayload:
    user_id: str
    exp: int
    nonce: str


class GmailOAuth:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        web_app_url: str,
        state_secret: str,
    ) -> None:
        client_id = client_id.strip()
        client_secret = client_secret.strip()
        redirect_uri = redirect_uri.strip()
        if not client_id or not client_secret or not redirect_uri:
            raise NotConfiguredError("gmail oauth is not configured")

        secret = state_secret.strip() or client_secret
        web = web_app_url.strip().rstrip("/") or "http://localhost:5173"

        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.state_secret = secret.encode()
        self.web_app_url = web
        self.scopes = [SCOPE_READONLY, SCOPE_EMAIL]
        self._http = httpx.AsyncClient(timeout=30.0)

    @property
    def configured(self) -> bool:
        return True

    def profile_redirect(self, query: str) -> str:
        return f"{self.web_app_url}/profile{query}"

    async def aclose(self) -> None:
        await self._http.aclose()

    def authorization_url(self, user_id: UUID) -> str:
        state = self._sign_state(user_id)
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": " ".join(self.scopes),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"

    async def exchange(self, code: str) -> TokenSet:
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": self.redirect_uri,
        }
        response = await self._http.post(GOOGLE_TOKEN_URL, data=data)
        if response.status_code != 200:
            raise RuntimeError(f"exchange code: {response.text.strip()}")

        payload: dict[str, Any] = response.json()
        refresh = str(payload.get("refresh_token", "")).strip()
        if not refresh:
            raise RuntimeError(
                "google did not return a refresh token; revoke app access in "
                "Google Account settings and try again"
            )

        expires_at = datetime.now(UTC)
        if "expires_in" in payload:
            expires_at = datetime.now(UTC) + timedelta(
                seconds=int(payload["expires_in"])
            )
        elif payload.get("expires_at"):
            expires_at = datetime.fromtimestamp(
                float(payload["expires_at"]), tz=UTC
            )

        return TokenSet(
            access_token=str(payload["access_token"]),
            refresh_token=refresh,
            expires_at=expires_at,
            scopes=" ".join(self.scopes),
        )

    async def fetch_email(self, access_token: str) -> str:
        response = await self._http.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        body = response.text
        if response.status_code != 200:
            raise RuntimeError(f"userinfo: {body.strip()}")

        info = response.json()
        email = str(info.get("email", "")).strip()
        if not email:
            raise RuntimeError("google account has no email")
        return email

    async def revoke(self, token: str) -> None:
        token = token.strip()
        if not token:
            return
        response = await self._http.post(
            GOOGLE_REVOKE_URL,
            content=urlencode({"token": token}),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if response.status_code not in (200, 400):
            raise RuntimeError(f"revoke token: {response.text.strip()}")

    def parse_state(self, state: str) -> UUID:
        parts = state.split(".")
        if len(parts) != 2:
            raise ValueError("invalid oauth state")

        try:
            sig = _raw_url_decode(parts[1])
            payload_bytes = _raw_url_decode(parts[0])
        except (ValueError, binascii.Error) as exc:
            raise ValueError("invalid oauth state") from exc

        mac = hmac.new(self.state_secret, payload_bytes, hashlib.sha256)
        if not hmac.compare_digest(sig, mac.digest()):
            raise ValueError("invalid oauth state")

        try:
            payload_data = json.loads(payload_bytes.decode())
            payload = _StatePayload(
                user_id=str(payload_data["userId"]),
                exp=int(payload_data["exp"]),
                nonce=str(payload_data["nonce"]),
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise ValueError("invalid oauth state") from exc

        if datetime.now(UTC).timestamp() > payload.exp:
            raise ValueError("oauth state expired")

        try:
            return UUID(payload.user_id)
        except ValueError as exc:
            raise ValueError("invalid oauth state") from exc

    def _sign_state(self, user_id: UUID) -> str:
        nonce = secrets.token_bytes(16)
        payload = _StatePayload(
            user_id=str(user_id),
            exp=int((datetime.now(UTC) + timedelta(minutes=10)).timestamp()),
            nonce=base64.urlsafe_b64encode(nonce).decode().rstrip("="),
        )
        payload_bytes = json.dumps(
            {"userId": payload.user_id, "exp": payload.exp, "nonce": payload.nonce},
            separators=(",", ":"),
        ).encode()
        mac = hmac.new(self.state_secret, payload_bytes, hashlib.sha256)
        encoded_payload = base64.urlsafe_b64encode(payload_bytes).decode().rstrip("=")
        encoded_sig = base64.urlsafe_b64encode(mac.digest()).decode().rstrip("=")
        return f"{encoded_payload}.{encoded_sig}"
