from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.enums import (
    STATUS_INTERVIEW,
    STATUS_REPLIED,
    STATUS_SENT,
    STATUS_WAITING,
)
from app.follow_up import resolve_first_touch_status


@dataclass
class SentMessage:
    id: str
    thread_id: str
    subject: str
    to: str
    from_: str
    snippet: str
    in_reply_to: str
    references: str
    internal_date: datetime


@dataclass
class ThreadMessage:
    id: str
    internal_date: datetime
    from_: str
    subject: str
    snippet: str
    is_sent: bool


@dataclass
class ThreadContext:
    id: str
    messages: list[ThreadMessage] = field(default_factory=list)


@dataclass
class Classification:
    type: str
    status: str


def classify_message(
    msg: SentMessage,
    thread: ThreadContext | None,
    user_email: str,
) -> Classification:
    user_email = user_email.strip().lower()
    text = (msg.subject + "\n" + msg.snippet).lower()

    prior_from_other = _has_prior_incoming(
        thread, msg.id, msg.internal_date, user_email
    )
    in_reply = (
        bool(msg.in_reply_to.strip())
        or bool(msg.references.strip())
        or _is_reply_subject(msg.subject)
    )

    if prior_from_other or in_reply:
        if _is_follow_up(text):
            return Classification(
                type="follow_up",
                status=_thread_status_after(msg, thread, user_email),
            )
        return Classification(type="email_reply", status=STATUS_SENT)

    if _is_application(text):
        return Classification(
            type="application",
            status=_first_touch_status(msg, thread, user_email),
        )
    if _is_referral(text):
        return Classification(
            type="referral_request",
            status=_first_touch_status(msg, thread, user_email),
        )
    if _is_follow_up(text):
        return Classification(type="follow_up", status=STATUS_WAITING)

    return Classification(
        type="cold_email",
        status=_first_touch_status(msg, thread, user_email),
    )


# Alias matching Go export name.
ClassifyMessage = classify_message


def _first_touch_status(
    msg: SentMessage,
    thread: ThreadContext | None,
    user_email: str,
) -> str:
    status = STATUS_SENT
    if thread is not None:
        status = _thread_status_after(msg, thread, user_email)
    return resolve_first_touch_status(status, msg.internal_date)


def _has_prior_incoming(
    thread: ThreadContext | None,
    message_id: str,
    at: datetime,
    user_email: str,
) -> bool:
    if thread is None:
        return False
    for m in thread.messages:
        if m.id == message_id:
            break
        if m.internal_date > at:
            continue
        if not m.is_sent and not _is_from_user(m.from_, user_email):
            return True
    return False


def _thread_status_after(
    msg: SentMessage,
    thread: ThreadContext | None,
    user_email: str,
) -> str:
    if thread is None:
        return STATUS_SENT
    seen_self = False
    for m in thread.messages:
        if m.id == msg.id:
            seen_self = True
            continue
        if not seen_self:
            continue
        if m.is_sent or _is_from_user(m.from_, user_email):
            continue
        return _status_from_incoming(m.subject + "\n" + m.snippet)
    for m in thread.messages:
        if m.id == msg.id:
            break
        if m.is_sent or _is_from_user(m.from_, user_email):
            continue
        if m.internal_date > msg.internal_date:
            return _status_from_incoming(m.subject + "\n" + m.snippet)
    return STATUS_WAITING


def _status_from_incoming(text: str) -> str:
    lower = text.lower()
    if _contains_any(
        lower,
        "won't be moving forward",
        "not moving forward",
        "not proceed",
        "other candidates",
        "position has been filled",
        "unfortunately",
        "best of luck with your search",
    ):
        return STATUS_REPLIED
    if _contains_any(
        lower,
        "interview",
        "schedule a call",
        "speak with you",
        "next steps",
    ):
        return STATUS_INTERVIEW
    if _contains_any(
        lower,
        "thank you for applying",
        "application received",
        "received your application",
    ):
        return STATUS_WAITING
    return STATUS_REPLIED


def _is_from_user(from_header: str, user_email: str) -> bool:
    return user_email in from_header.lower()


def _is_reply_subject(subject: str) -> bool:
    s = subject.strip().lower()
    return s.startswith("re:") or s.startswith("fwd:") or s.startswith("fw:")


def _is_follow_up(text: str) -> bool:
    return _contains_any(
        text,
        "following up",
        "follow up",
        "follow-up",
        "followup",
        "checking in",
        "check in",
        "check-in",
        "circling back",
        "circle back",
        "bump",
        "gentle reminder",
        "wanted to follow",
        "any update",
        "touching base",
        "just following",
    )


def _is_referral(text: str) -> bool:
    return _contains_any(
        text,
        "referral",
        "refer me",
        "employee referral",
        "introduce me",
        "introduction to",
        "would you refer",
        "open to referring",
        "refer my profile",
    )


def _is_application(text: str) -> bool:
    return _contains_any(
        text,
        "application submitted",
        "applied for",
        "applied to",
        "application received",
        "thank you for applying",
        "your application",
        "application confirmation",
        "successfully applied",
    )


def _contains_any(text: str, *phrases: str) -> bool:
    return any(p in text for p in phrases)
