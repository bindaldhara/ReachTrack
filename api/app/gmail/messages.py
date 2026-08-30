from __future__ import annotations

import asyncio
import base64
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote, urlencode

import httpx

from app.gmail.classify import SentMessage, ThreadContext, ThreadMessage
from app.gmail.application_confirmations import APPLICATION_SENDER_DOMAINS
from app.gmail.oauth import GOOGLE_TOKEN_URL, TokenSet

GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
GMAIL_FETCH_CONCURRENCY = 10


@dataclass
class GmailService:
    client_id: str
    client_secret: str
    redirect_uri: str = ""
    scopes: list[str] | None = None

    def __post_init__(self) -> None:
        self._http = httpx.AsyncClient(timeout=30.0)
        if self.scopes is None:
            self.scopes = [
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/userinfo.email",
            ]

    async def aclose(self) -> None:
        await self._http.aclose()

    async def refresh(self, refresh_token: str) -> TokenSet:
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }
        response = await self._http.post(GOOGLE_TOKEN_URL, data=data)
        if response.status_code != 200:
            raise RuntimeError(f"refresh token: {response.text.strip()}")

        payload: dict[str, Any] = response.json()
        expires_at = datetime.now(UTC)
        if "expires_in" in payload:
            expires_at = datetime.now(UTC) + timedelta(
                seconds=int(payload["expires_in"])
            )

        new_refresh = str(payload.get("refresh_token", "")).strip() or refresh_token
        return TokenSet(
            access_token=str(payload["access_token"]),
            refresh_token=new_refresh,
            expires_at=expires_at,
            scopes=" ".join(self.scopes or []),
        )


Refresh = GmailService.refresh


def day_bounds(day: datetime, loc: Any) -> tuple[datetime, datetime]:
    day = day.astimezone(loc)
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


DayBounds = day_bounds


def yesterday_in(loc: Any) -> datetime:
    now = datetime.now(loc)
    yesterday = now - timedelta(days=1)
    return yesterday.replace(hour=0, minute=0, second=0, microsecond=0)


YesterdayIn = yesterday_in


def _sent_query(start: datetime, end: datetime) -> str:
    return (
        f"in:sent after:{start.strftime('%Y/%m/%d')} "
        f"before:{end.strftime('%Y/%m/%d')}"
    )


def _inbox_applications_query(start: datetime, end: datetime) -> str:
    after = start.strftime("%Y/%m/%d")
    before = end.strftime("%Y/%m/%d")
    ats_senders = " OR ".join(
        f"from:{domain}" for domain in sorted(APPLICATION_SENDER_DOMAINS)
    )
    return (
        f"in:inbox after:{after} before:{before} "
        f"({ats_senders} OR "
        'subject:"thank you for applying" OR subject:"application received" OR '
        'subject:"application submitted" OR subject:"application was sent" OR '
        'subject:"your application")'
    )


async def list_sent_messages(
    service: GmailService,
    access_token: str,
    refresh_token: str,
    expires_at: datetime,
    start: datetime,
    end: datetime,
) -> list[SentMessage]:
    async with _auth_client(service, access_token, refresh_token, expires_at) as client:
        query = _sent_query(start, end)

        ids: list[dict[str, str]] = []
        page_token = ""
        while True:
            params: dict[str, str] = {"q": query, "maxResults": "100"}
            if page_token:
                params["pageToken"] = page_token
            url = f"{GMAIL_API_BASE}/messages?{urlencode(params)}"
            page = await _gmail_get(client, url)
            ids.extend(page.get("messages", []))
            page_token = page.get("nextPageToken", "")
            if not page_token:
                break

        out: list[SentMessage] = []
        sem = asyncio.Semaphore(GMAIL_FETCH_CONCURRENCY)

        async def fetch_one(ref: dict[str, str]) -> SentMessage | None:
            msg_id = ref.get("id", "")
            if not msg_id:
                return None
            async with sem:
                return await _get_message(client, msg_id)

        results = await asyncio.gather(*(fetch_one(ref) for ref in ids))
        return [msg for msg in results if msg is not None]


ListSentMessages = list_sent_messages


async def list_inbox_application_messages(
    service: GmailService,
    access_token: str,
    refresh_token: str,
    expires_at: datetime,
    start: datetime,
    end: datetime,
) -> list[SentMessage]:
    async with _auth_client(service, access_token, refresh_token, expires_at) as client:
        query = _inbox_applications_query(start, end)

        ids: list[dict[str, str]] = []
        page_token = ""
        while True:
            params: dict[str, str] = {"q": query, "maxResults": "100"}
            if page_token:
                params["pageToken"] = page_token
            url = f"{GMAIL_API_BASE}/messages?{urlencode(params)}"
            page = await _gmail_get(client, url)
            ids.extend(page.get("messages", []))
            page_token = page.get("nextPageToken", "")
            if not page_token:
                break

        out: list[SentMessage] = []
        sem = asyncio.Semaphore(GMAIL_FETCH_CONCURRENCY)

        async def fetch_one(ref: dict[str, str]) -> SentMessage | None:
            msg_id = ref.get("id", "")
            if not msg_id:
                return None
            async with sem:
                return await _get_message(client, msg_id)

        results = await asyncio.gather(*(fetch_one(ref) for ref in ids))
        return [msg for msg in results if msg is not None]


ListInboxApplicationMessages = list_inbox_application_messages


async def fetch_threads(
    service: GmailService,
    access_token: str,
    refresh_token: str,
    expires_at: datetime,
    thread_ids: list[str],
) -> dict[str, ThreadContext]:
    async with _auth_client(service, access_token, refresh_token, expires_at) as client:
        out: dict[str, ThreadContext] = {}
        unique_ids = [tid for tid in thread_ids if tid]
        sem = asyncio.Semaphore(GMAIL_FETCH_CONCURRENCY)

        async def fetch_one(thread_id: str) -> tuple[str, ThreadContext]:
            async with sem:
                url = (
                    f"{GMAIL_API_BASE}/threads/{quote(thread_id, safe='')}"
                    "?format=metadata&metadataHeaders=From&metadataHeaders=Subject"
                )
                raw = await _gmail_get(client, url)
            tc = ThreadContext(id=raw.get("id", thread_id))
            for m in raw.get("messages", []):
                tm = ThreadMessage(
                    id=m.get("id", ""),
                    snippet=m.get("snippet", ""),
                    is_sent=_has_label(m.get("labelIds", []), "SENT"),
                    internal_date=datetime.now(UTC),
                    from_="",
                    subject="",
                )
                parsed, ok = _parse_internal_date(m.get("internalDate", ""))
                if ok:
                    tm.internal_date = parsed
                for h in m.get("payload", {}).get("headers", []):
                    name = h.get("name", "").lower()
                    if name == "from":
                        tm.from_ = h.get("value", "")
                    elif name == "subject":
                        tm.subject = h.get("value", "")
                tc.messages.append(tm)
            _sort_thread_messages(tc.messages)
            return thread_id, tc

        if unique_ids:
            pairs = await asyncio.gather(*(fetch_one(tid) for tid in unique_ids))
            for thread_id, tc in pairs:
                out[thread_id] = tc
        return out


FetchThreads = fetch_threads


def _auth_client(
    _service: GmailService,
    access_token: str,
    _refresh_token: str,
    _expires_at: datetime,
) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30.0,
    )


async def _gmail_get(client: httpx.AsyncClient, url: str) -> dict[str, Any]:
    response = await client.get(url)
    body = response.content[: 4 * 1024 * 1024]
    if response.status_code != 200:
        raise RuntimeError(
            f"gmail api {response.status_code}: {body.decode(errors='replace').strip()}"
        )
    return json.loads(body)


async def _get_message(client: httpx.AsyncClient, msg_id: str) -> SentMessage:
    url = (
        f"{GMAIL_API_BASE}/messages/{quote(msg_id, safe='')}"
        "?format=metadata"
        "&metadataHeaders=Subject"
        "&metadataHeaders=To"
        "&metadataHeaders=From"
        "&metadataHeaders=Date"
        "&metadataHeaders=In-Reply-To"
        "&metadataHeaders=References"
    )
    raw = await _gmail_get(client, url)
    msg = SentMessage(
        id=raw.get("id", ""),
        thread_id=raw.get("threadId", ""),
        subject="",
        to="",
        from_="",
        snippet=raw.get("snippet", ""),
        in_reply_to="",
        references="",
        internal_date=datetime.now(UTC),
    )
    for h in raw.get("payload", {}).get("headers", []):
        name = h.get("name", "").lower()
        value = h.get("value", "")
        if name == "subject":
            msg.subject = value
        elif name == "to":
            msg.to = value
        elif name == "from":
            msg.from_ = value
        elif name == "in-reply-to":
            msg.in_reply_to = value
        elif name == "references":
            msg.references = value

    parsed, ok = _parse_internal_date(raw.get("internalDate", ""))
    if ok:
        msg.internal_date = parsed
    return msg


def _has_label(labels: list[str], want: str) -> bool:
    return want in labels


def _parse_internal_date(raw: str) -> tuple[datetime, bool]:
    if not raw:
        return datetime.now(UTC), False
    try:
        ms = int(raw)
    except ValueError:
        return datetime.now(UTC), False
    return datetime.fromtimestamp(ms / 1000, tz=UTC), True


def _sort_thread_messages(messages: list[ThreadMessage]) -> None:
    for i in range(len(messages)):
        for j in range(i + 1, len(messages)):
            if messages[j].internal_date < messages[i].internal_date:
                messages[i], messages[j] = messages[j], messages[i]
