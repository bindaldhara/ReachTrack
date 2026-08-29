from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

import jwt
from jwt import PyJWKClient

VALID_ALGORITHMS = ("ES256", "RS256")


@dataclass(frozen=True)
class UserIdentity:
    user_id: uuid.UUID
    email: str


class AuthError(Exception):
    pass


class Verifier:
    def __init__(self, jwks_url: str) -> None:
        self._jwks_client = PyJWKClient(jwks_url, cache_keys=True)

    def parse_token(self, token_string: str) -> UserIdentity:
        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(token_string)
            claims: dict[str, Any] = jwt.decode(
                token_string,
                signing_key.key,
                algorithms=list(VALID_ALGORITHMS),
                options={"verify_aud": False},
            )
        except jwt.PyJWTError as exc:
            raise AuthError("invalid token") from exc

        role = claims.get("role", "")
        if role and role != "authenticated":
            raise AuthError(f'unexpected role "{role}"')

        sub = claims.get("sub", "")
        try:
            user_id = uuid.UUID(sub)
        except ValueError as exc:
            raise AuthError("invalid subject") from exc

        email = str(claims.get("email", ""))
        return UserIdentity(user_id=user_id, email=email)


def get_bearer_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        return ""
    return authorization[len(prefix) :].strip()
