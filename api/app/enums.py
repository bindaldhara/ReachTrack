from __future__ import annotations

STATUS_SENT = "sent"
STATUS_WAITING = "waiting"
STATUS_REPLIED = "replied"
STATUS_FOLLOW_UP_DUE = "follow_up_due"
STATUS_INTERVIEW = "interview"
STATUS_REJECTED = "rejected"
STATUS_CLOSED = "closed"

STATUSES: list[str] = [
    STATUS_SENT,
    STATUS_WAITING,
    STATUS_REPLIED,
    STATUS_FOLLOW_UP_DUE,
    STATUS_INTERVIEW,
    STATUS_REJECTED,
    STATUS_CLOSED,
]

TYPES: list[str] = [
    "cold_email",
    "referral_request",
    "linkedin_dm",
    "linkedin_reply",
    "application",
    "follow_up",
    "email_reply",
]

# First-touch email outreach (not follow-ups or thread replies).
FIRST_MAIL_TYPES: list[str] = [
    "cold_email",
    "referral_request",
    "application",
]

# First-touch outreach counted on legacy totalOutreach / outreachByStatus.
DASHBOARD_OUTREACH_TYPES: list[str] = [
    *FIRST_MAIL_TYPES,
    "linkedin_dm",
]

CHANNELS: list[str] = [
    "gmail",
    "linkedin",
    "careers_page",
    "other",
]

CHANNEL_CAREERS_PAGE = "careers_page"
CHANNEL_LINKEDIN = "linkedin"

# Gmail-imported application confirmations (not manual outreach).
APPLICATION_CONFIRMATION_CHANNELS: list[str] = [
    CHANNEL_CAREERS_PAGE,
    CHANNEL_LINKEDIN,
]

SOURCES: list[str] = [
    "manual",
    "gmail",
    "chrome_extension",
    "mobile_share",
]

REMINDER_KINDS: list[str] = [
    "follow_up",
    "reply_needed",
    "interview",
]


def valid_status(value: str) -> bool:
    return value in STATUSES


def valid_type(value: str) -> bool:
    return value in TYPES


def valid_channel(value: str) -> bool:
    return value in CHANNELS


def valid_source(value: str) -> bool:
    return value in SOURCES


def valid_reminder_kind(value: str) -> bool:
    return value in REMINDER_KINDS


def require_status(value: str, fallback: str) -> str:
    value = value.strip()
    if not value:
        return fallback
    if not valid_status(value):
        raise ValueError(f'invalid status "{value}"')
    return value


def empty_to_nil(value: str) -> str | None:
    trimmed = value.strip()
    if not trimmed:
        return None
    return trimmed
