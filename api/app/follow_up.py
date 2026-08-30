from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.config import get_settings
from app.enums import (
    CHANNEL_CAREERS_PAGE,
    FIRST_MAIL_TYPES,
    STATUS_FOLLOW_UP_DUE,
    STATUS_SENT,
    STATUS_WAITING,
)

OPEN_FIRST_TOUCH_STATUSES = (STATUS_SENT, STATUS_WAITING, STATUS_FOLLOW_UP_DUE)


def follow_up_eligible_sql(alias: str) -> str:
    return (
        f"not ({alias}.type = 'application' "
        f"and {alias}.channel in ('{CHANNEL_CAREERS_PAGE}', 'linkedin'))"
    )


def follow_up_due_days() -> int:
    return max(1, get_settings().follow_up_due_days)


def follow_up_cutoff(now: datetime | None = None) -> datetime:
    now = now or datetime.now(UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    return now - timedelta(days=follow_up_due_days())


def no_follow_up_sent_sql(alias: str) -> str:
    """True when the user has not sent a later follow-up in the same thread/subject."""
    return f"""not exists (
        select 1
        from outreach_events fu
        where fu.user_id = {alias}.user_id
          and fu.type = 'follow_up'
          and fu.occurred_at > {alias}.occurred_at
          and (
            (
              {alias}.gmail_thread_id is not null
              and {alias}.gmail_thread_id <> ''
              and fu.gmail_thread_id = {alias}.gmail_thread_id
            )
            or (
              trim({alias}.subject) <> ''
              and lower(regexp_replace(trim({alias}.subject), '^(re:|fwd:|fw:)\\s*', '', 'i'))
                = lower(regexp_replace(trim(fu.subject), '^(re:|fwd:|fw:)\\s*', '', 'i'))
            )
          )
    )"""


def is_follow_up_due_sql(alias: str, days_param: str) -> str:
    types = ", ".join(f"'{t}'" for t in FIRST_MAIL_TYPES)
    return f"""(
        {follow_up_eligible_sql(alias)}
        and {alias}.type in ({types})
        and {alias}.status in ('waiting', 'sent', 'follow_up_due')
        and {alias}.occurred_at < now() - make_interval(days => {days_param})
        and {no_follow_up_sent_sql(alias)}
    )"""


def outreach_effective_status_sql(days_param: str, alias: str = "outreach_events") -> str:
    types = ", ".join(f"'{t}'" for t in FIRST_MAIL_TYPES)
    return f"""case
      when {is_follow_up_due_sql(alias, days_param)} then 'follow_up_due'
      when {alias}.type in ({types}) and {alias}.status = 'sent' and {follow_up_eligible_sql(alias)} then 'waiting'
      else {alias}.status
    end"""


def resolve_first_touch_status(
    status: str,
    occurred_at: datetime,
    *,
    follow_up_sent: bool = False,
    channel: str = "gmail",
) -> str:
    if channel == CHANNEL_CAREERS_PAGE:
        if status == STATUS_SENT:
            return STATUS_WAITING
        return status
    if follow_up_sent:
        if status in (STATUS_SENT, STATUS_WAITING, STATUS_FOLLOW_UP_DUE):
            return STATUS_WAITING
        return status
    if status not in (STATUS_SENT, STATUS_WAITING):
        return status
    at = occurred_at
    if at.tzinfo is None:
        at = at.replace(tzinfo=UTC)
    if at < follow_up_cutoff():
        return STATUS_FOLLOW_UP_DUE
    if status == STATUS_SENT:
        return STATUS_WAITING
    return status


def outreach_status_sql(status: str, param_index: int) -> tuple[str, list[object], int]:
    if not status:
        return "true", [], param_index
    days = follow_up_due_days()
    alias = "outreach_events"
    if status == STATUS_FOLLOW_UP_DUE:
        types = ", ".join(f"'{t}'" for t in FIRST_MAIL_TYPES)
        return (
            f"""(
                {follow_up_eligible_sql(alias)}
                and {no_follow_up_sent_sql(alias)}
                and (
                  status = 'follow_up_due'
                  or (
                    type in ({types})
                    and status in ('waiting', 'sent')
                    and occurred_at < now() - make_interval(days => ${param_index})
                  )
                )
            )""",
            [days],
            param_index + 1,
        )
    if status == STATUS_WAITING:
        return (
            f"""(
                {follow_up_eligible_sql(alias)}
                and status in ('waiting', 'sent')
                and occurred_at >= now() - make_interval(days => ${param_index})
            )""",
            [days],
            param_index + 1,
        )
    return f"status = ${param_index}", [status], param_index + 1
