from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from app.config import Settings, get_settings
from app.gmail.classify import ThreadContext, _is_from_user

logger = logging.getLogger(__name__)

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

REJECTION_PHRASES = (
    "won't be moving forward",
    "wont be moving forward",
    "not moving forward",
    "will not be moving forward",
    "not proceed",
    "not proceeding",
    "other candidates",
    "position has been filled",
    "role has been filled",
    "best of luck with your search",
    "wish you the best in your search",
    "good luck with your search",
    "decided to move forward with other",
    "pursue other candidates",
    "not a fit",
    "not the right fit",
    "unable to move forward",
    "cannot move forward",
    "can't move forward",
    "regret to inform",
    "unfortunately",
)

REJECTION_PROMPT = (
    "Classify whether this email reply to a job outreach is a rejection "
    "(they are declining, passing, or not moving forward with the candidate). "
    "Polite rejections like 'best of luck with your search' count as rejection. "
    "Interview invites, requests for more info, or auto-replies are NOT rejections. "
    'Respond with JSON only: {"is_rejection": boolean, "reason": string}'
)


@dataclass
class RejectionVerdict:
    is_rejection: bool
    reason: str
    snippet: str
    source: str


def latest_incoming_text(
    thread: ThreadContext | None,
    user_email: str,
) -> str | None:
    if thread is None:
        return None
    user_email = user_email.strip().lower()
    for message in reversed(thread.messages):
        if message.is_sent or _is_from_user(message.from_, user_email):
            continue
        text = (message.subject + "\n" + message.snippet).strip()
        if text:
            return text
    return None


async def detect_rejection(text: str) -> RejectionVerdict:
    cleaned = text.strip()
    if not cleaned:
        return RejectionVerdict(False, "", "", "none")

    settings = get_settings()
    if settings.gemini_api_key.strip():
        try:
            return await _classify_with_gemini(cleaned, settings)
        except Exception as exc:
            logger.warning("gemini rejection classify failed: %s", exc)

    if settings.openai_api_key.strip():
        try:
            return await _classify_with_openai(cleaned, settings)
        except Exception as exc:
            logger.warning("openai rejection classify failed: %s", exc)

    return _classify_with_rules(cleaned)


def _classify_with_rules(text: str) -> RejectionVerdict:
    lower = text.lower()
    for phrase in REJECTION_PHRASES:
        if phrase in lower:
            return RejectionVerdict(
                is_rejection=True,
                reason=f'Matched phrase: "{phrase}"',
                snippet=_snippet(text),
                source="rules",
            )
    return RejectionVerdict(False, "", "", "rules")


async def _classify_with_gemini(text: str, settings: Settings) -> RejectionVerdict:
    key = settings.gemini_api_key.strip()
    model = _normalize_gemini_model(settings.gemini_model.strip() or "gemini-3.6-flash")
    url = f"{GEMINI_API_BASE}/models/{quote(model, safe='')}:generateContent"
    prompt = f"{REJECTION_PROMPT}\n\nEmail reply:\n{text[:6000]}"

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
            url,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": key,
            },
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                },
            },
        )
    if response.status_code != 200:
        raise RuntimeError(response.text.strip())

    payload = response.json()
    content = _gemini_text(payload)
    data = _parse_rejection_json(content)
    return _verdict_from_data(data, text, source="gemini")


async def _classify_with_openai(text: str, settings: Settings) -> RejectionVerdict:
    key = settings.openai_api_key.strip()
    model = settings.openai_model.strip()
    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": REJECTION_PROMPT},
                    {"role": "user", "content": text[:6000]},
                ],
            },
        )
    if response.status_code != 200:
        raise RuntimeError(response.text.strip())

    payload = response.json()
    content = payload["choices"][0]["message"]["content"]
    data = _parse_rejection_json(content)
    return _verdict_from_data(data, text, source="openai")


def _normalize_gemini_model(model: str) -> str:
    model = model.strip()
    if model.startswith("models/"):
        return model.removeprefix("models/")
    return model


def _gemini_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        raise RuntimeError("gemini returned no candidates")
    parts = candidates[0].get("content", {}).get("parts") or []
    text_parts = [str(part.get("text", "")) for part in parts if part.get("text")]
    content = "".join(text_parts).strip()
    if not content:
        raise RuntimeError("gemini returned empty content")
    return content


def _parse_rejection_json(content: str) -> dict[str, Any]:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, flags=re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def _verdict_from_data(
    data: dict[str, Any], text: str, *, source: str
) -> RejectionVerdict:
    is_rejection = bool(data.get("is_rejection"))
    reason = str(data.get("reason", "")).strip() or "AI classified as rejection"
    return RejectionVerdict(
        is_rejection=is_rejection,
        reason=reason,
        snippet=_snippet(text),
        source=source,
    )


def _snippet(text: str, limit: int = 240) -> str:
    one_line = re.sub(r"\s+", " ", text).strip()
    if len(one_line) <= limit:
        return one_line
    return one_line[: limit - 1] + "…"
