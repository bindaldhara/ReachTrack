from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg

from app.enums import DASHBOARD_OUTREACH_TYPES, FIRST_MAIL_TYPES, STATUSES
from app.follow_up import (
    follow_up_due_days,
    is_follow_up_due_sql,
    no_follow_up_sent_sql,
    outreach_effective_status_sql,
    outreach_status_sql,
    resolve_first_touch_status,
)
from app.errors import NotFoundError
from app.schemas import (
    Company,
    Contact,
    Conversation,
    GmailConnection,
    Job,
    OutreachDashboard,
    OutreachEvent,
    Profile,
    Reminder,
    Stats,
)


def _clamp_limit(limit: int) -> int:
    if limit <= 0:
        return 50
    if limit > 200:
        return 200
    return limit


def _like_query(q: str) -> str:
    q = q.strip()
    if not q:
        return ""
    return "%" + q.replace("%", r"\%") + "%"


def _counts_to_map(rows: list[asyncpg.Record]) -> tuple[dict[str, int], int]:
    out = {s: 0 for s in STATUSES}
    total = 0
    for row in rows:
        status = row["status"]
        n = row["count"]
        out[status] = n
        total += n
    return out, total


def row_to_profile(row: asyncpg.Record) -> Profile:
    return Profile.model_validate(
        {
            "id": row["id"],
            "email": row["email"],
            "fullName": row["full_name"],
            "timezone": row["timezone"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
    )


def row_to_company(row: asyncpg.Record) -> Company:
    return Company.model_validate(
        {
            "id": row["id"],
            "userId": row["user_id"],
            "name": row["name"],
            "domain": row["domain"],
            "website": row["website"],
            "linkedinUrl": row["linkedin_url"],
            "notes": row["notes"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
    )


def row_to_contact(row: asyncpg.Record) -> Contact:
    return Contact.model_validate(
        {
            "id": row["id"],
            "userId": row["user_id"],
            "companyId": row["company_id"],
            "firstName": row["first_name"],
            "lastName": row["last_name"],
            "email": row["email"],
            "linkedinUrl": row["linkedin_url"],
            "title": row["title"],
            "notes": row["notes"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
    )


def row_to_job(row: asyncpg.Record) -> Job:
    return Job.model_validate(
        {
            "id": row["id"],
            "userId": row["user_id"],
            "companyId": row["company_id"],
            "title": row["title"],
            "url": row["url"],
            "location": row["location"],
            "status": row["status"],
            "notes": row["notes"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
    )


def row_to_conversation(row: asyncpg.Record) -> Conversation:
    return Conversation.model_validate(
        {
            "id": row["id"],
            "userId": row["user_id"],
            "contactId": row["contact_id"],
            "companyId": row["company_id"],
            "jobId": row["job_id"],
            "channel": row["channel"],
            "subject": row["subject"],
            "status": row["status"],
            "lastEventAt": row["last_event_at"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
    )


def row_to_outreach(row: asyncpg.Record) -> OutreachEvent:
    return OutreachEvent.model_validate(
        {
            "id": row["id"],
            "userId": row["user_id"],
            "conversationId": row["conversation_id"],
            "contactId": row["contact_id"],
            "companyId": row["company_id"],
            "jobId": row["job_id"],
            "type": row["type"],
            "channel": row["channel"],
            "source": row["source"],
            "status": row["status"],
            "subject": row["subject"],
            "body": row["body"],
            "externalId": row["external_id"],
            "gmailThreadId": row.get("gmail_thread_id"),
            "statusSuggestion": row.get("status_suggestion"),
            "statusSuggestionReason": row.get("status_suggestion_reason") or "",
            "statusSuggestionSnippet": row.get("status_suggestion_snippet") or "",
            "occurredAt": row["occurred_at"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
    )


def row_to_reminder(row: asyncpg.Record) -> Reminder:
    return Reminder.model_validate(
        {
            "id": row["id"],
            "userId": row["user_id"],
            "outreachEventId": row["outreach_event_id"],
            "conversationId": row["conversation_id"],
            "kind": row["kind"],
            "dueAt": row["due_at"],
            "notes": row["notes"],
            "completedAt": row["completed_at"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
    )


def row_to_gmail_connection(row: asyncpg.Record) -> GmailConnection:
    return GmailConnection.model_validate(
        {
            "id": row["id"],
            "userId": row["user_id"],
            "googleEmail": row["google_email"],
            "access_token": row["access_token"],
            "refresh_token": row["refresh_token"],
            "tokenExpiresAt": row["token_expires_at"],
            "scopes": row["scopes"],
            "connectedAt": row["connected_at"],
            "revokedAt": row["revoked_at"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
    )


class Store:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    async def _query_one(
        self,
        sql: str,
        *args: Any,
        mapper: Any,
    ) -> Any:
        row = await self.pool.fetchrow(sql, *args)
        if row is None:
            raise NotFoundError()
        return mapper(row)

    async def ensure_profile(
        self, user_id: UUID, email: str, full_name: str
    ) -> Profile:
        return await self._query_one(
            """
            insert into profiles (id, email, full_name)
            values ($1, $2, $3)
            on conflict (id) do update
              set email = excluded.email,
                  full_name = case
                    when profiles.full_name = '' then excluded.full_name
                    else profiles.full_name
                  end
            returning id, email, full_name, timezone, created_at, updated_at
            """,
            user_id,
            email,
            full_name,
            mapper=row_to_profile,
        )

    async def get_profile(self, user_id: UUID) -> Profile:
        return await self._query_one(
            """
            select id, email, full_name, timezone, created_at, updated_at
            from profiles where id = $1
            """,
            user_id,
            mapper=row_to_profile,
        )

    async def update_profile(
        self,
        user_id: UUID,
        full_name: str | None,
        timezone: str | None,
    ) -> Profile:
        return await self._query_one(
            """
            update profiles
            set
              full_name = coalesce($2, full_name),
              timezone = coalesce($3, timezone)
            where id = $1
            returning id, email, full_name, timezone, created_at, updated_at
            """,
            user_id,
            full_name,
            timezone,
            mapper=row_to_profile,
        )

    async def stats(self, user_id: UUID) -> Stats:
        outreach_rows = await self.pool.fetch(
            """
            select status, count(*)::int as count
            from outreach_events
            where user_id = $1
              and type = any($2::text[])
            group by status
            """,
            user_id,
            DASHBOARD_OUTREACH_TYPES,
        )
        outreach_by_status, total_outreach = _counts_to_map(outreach_rows)

        conv_rows = await self.pool.fetch(
            """
            select status, count(*)::int as count
            from conversations where user_id = $1 group by status
            """,
            user_id,
        )
        conversations_by_status, _ = _counts_to_map(conv_rows)

        job_rows = await self.pool.fetch(
            """
            select status, count(*)::int as count
            from jobs where user_id = $1 group by status
            """,
            user_id,
        )
        jobs_by_status, _ = _counts_to_map(job_rows)

        open_reminders = await self.pool.fetchval(
            """
            select count(*)::int from reminders
            where user_id = $1 and completed_at is null
            """,
            user_id,
        )
        total_contacts = await self.pool.fetchval(
            "select count(*)::int from contacts where user_id = $1",
            user_id,
        )
        total_companies = await self.pool.fetchval(
            "select count(*)::int from companies where user_id = $1",
            user_id,
        )

        first_mail_sent = await self.pool.fetchval(
            """
            select count(*)::int from outreach_events
            where user_id = $1 and type = any($2::text[])
            """,
            user_id,
            FIRST_MAIL_TYPES,
        )
        follow_ups_taken = await self.pool.fetchval(
            """
            select count(*)::int from outreach_events
            where user_id = $1 and type = 'follow_up'
            """,
            user_id,
        )
        replies = await self.pool.fetchval(
            """
            select count(*)::int from outreach_events
            where user_id = $1 and status = 'replied'
            """,
            user_id,
        )
        rejections = await self.pool.fetchval(
            """
            select count(*)::int from outreach_events
            where user_id = $1 and type = any($2::text[]) and status = 'rejected'
            """,
            user_id,
            FIRST_MAIL_TYPES,
        )
        possible_rejections = await self.pool.fetchval(
            """
            select count(*)::int from outreach_events
            where user_id = $1
              and type = any($2::text[])
              and status_suggestion = 'rejected'
              and status <> 'rejected'
            """,
            user_id,
            FIRST_MAIL_TYPES,
        )
        waiting = await self.pool.fetchval(
            """
            select count(*)::int from outreach_events
            where user_id = $1 and type = any($2::text[])
              and status in ('waiting', 'sent')
              and occurred_at >= now() - make_interval(days => $3)
            """,
            user_id,
            FIRST_MAIL_TYPES,
            follow_up_due_days(),
        )
        follow_up_due = await self.pool.fetchval(
            f"""
            select count(*)::int from outreach_events
            where user_id = $1 and type = any($2::text[])
              and {no_follow_up_sent_sql("outreach_events")}
              and (
                status = 'follow_up_due'
                or (
                  status in ('waiting', 'sent')
                  and occurred_at < now() - make_interval(days => $3)
                )
              )
            """,
            user_id,
            FIRST_MAIL_TYPES,
            follow_up_due_days(),
        )

        return Stats(
            outreachDashboard=OutreachDashboard(
                firstMailSent=first_mail_sent or 0,
                followUpsTaken=follow_ups_taken or 0,
                replies=replies or 0,
                rejections=rejections or 0,
                possibleRejections=possible_rejections or 0,
                waiting=waiting or 0,
                followUpDue=follow_up_due or 0,
            ),
            outreachByStatus=outreach_by_status,
            conversationsByStatus=conversations_by_status,
            jobsByStatus=jobs_by_status,
            openReminders=open_reminders or 0,
            totalOutreach=total_outreach,
            totalContacts=total_contacts or 0,
            totalCompanies=total_companies or 0,
        )

    async def list_companies(
        self, user_id: UUID, q: str, limit: int
    ) -> list[Company]:
        like = _like_query(q)
        rows = await self.pool.fetch(
            """
            select id, user_id, name, domain, website, linkedin_url, notes, created_at, updated_at
            from companies
            where user_id = $1
              and ($2 = '' or name ilike $2 or coalesce(domain, '') ilike $2)
            order by name asc
            limit $3
            """,
            user_id,
            like,
            _clamp_limit(limit),
        )
        return [row_to_company(row) for row in rows]

    async def get_company(self, user_id: UUID, company_id: UUID) -> Company:
        return await self._query_one(
            """
            select id, user_id, name, domain, website, linkedin_url, notes, created_at, updated_at
            from companies where id = $1 and user_id = $2
            """,
            company_id,
            user_id,
            mapper=row_to_company,
        )

    async def create_company(self, company: Company) -> Company:
        return await self._query_one(
            """
            insert into companies (user_id, name, domain, website, linkedin_url, notes)
            values ($1, $2, $3, $4, $5, $6)
            returning id, user_id, name, domain, website, linkedin_url, notes, created_at, updated_at
            """,
            company.user_id,
            company.name,
            company.domain,
            company.website,
            company.linkedin_url,
            company.notes,
            mapper=row_to_company,
        )

    async def update_company(self, company: Company) -> Company:
        return await self._query_one(
            """
            update companies
            set name = $3, domain = $4, website = $5, linkedin_url = $6, notes = $7
            where id = $1 and user_id = $2
            returning id, user_id, name, domain, website, linkedin_url, notes, created_at, updated_at
            """,
            company.id,
            company.user_id,
            company.name,
            company.domain,
            company.website,
            company.linkedin_url,
            company.notes,
            mapper=row_to_company,
        )

    async def delete_company(self, user_id: UUID, company_id: UUID) -> None:
        result = await self.pool.execute(
            "delete from companies where id = $1 and user_id = $2",
            company_id,
            user_id,
        )
        if result.split()[-1] == "0":
            raise NotFoundError()

    async def list_contacts(
        self, user_id: UUID, q: str, limit: int
    ) -> list[Contact]:
        like = _like_query(q)
        rows = await self.pool.fetch(
            """
            select id, user_id, company_id, first_name, last_name, email, linkedin_url, title, notes, created_at, updated_at
            from contacts
            where user_id = $1
              and ($2 = '' or first_name ilike $2 or last_name ilike $2 or coalesce(email, '') ilike $2 or title ilike $2)
            order by last_name, first_name
            limit $3
            """,
            user_id,
            like,
            _clamp_limit(limit),
        )
        return [row_to_contact(row) for row in rows]

    async def get_contact(self, user_id: UUID, contact_id: UUID) -> Contact:
        return await self._query_one(
            """
            select id, user_id, company_id, first_name, last_name, email, linkedin_url, title, notes, created_at, updated_at
            from contacts where id = $1 and user_id = $2
            """,
            contact_id,
            user_id,
            mapper=row_to_contact,
        )

    async def create_contact(self, contact: Contact) -> Contact:
        return await self._query_one(
            """
            insert into contacts (user_id, company_id, first_name, last_name, email, linkedin_url, title, notes)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
            returning id, user_id, company_id, first_name, last_name, email, linkedin_url, title, notes, created_at, updated_at
            """,
            contact.user_id,
            contact.company_id,
            contact.first_name,
            contact.last_name,
            contact.email,
            contact.linkedin_url,
            contact.title,
            contact.notes,
            mapper=row_to_contact,
        )

    async def update_contact(self, contact: Contact) -> Contact:
        return await self._query_one(
            """
            update contacts
            set company_id = $3, first_name = $4, last_name = $5, email = $6, linkedin_url = $7, title = $8, notes = $9
            where id = $1 and user_id = $2
            returning id, user_id, company_id, first_name, last_name, email, linkedin_url, title, notes, created_at, updated_at
            """,
            contact.id,
            contact.user_id,
            contact.company_id,
            contact.first_name,
            contact.last_name,
            contact.email,
            contact.linkedin_url,
            contact.title,
            contact.notes,
            mapper=row_to_contact,
        )

    async def delete_contact(self, user_id: UUID, contact_id: UUID) -> None:
        result = await self.pool.execute(
            "delete from contacts where id = $1 and user_id = $2",
            contact_id,
            user_id,
        )
        if result.split()[-1] == "0":
            raise NotFoundError()

    async def list_jobs(
        self, user_id: UUID, status: str, q: str, limit: int
    ) -> list[Job]:
        like = _like_query(q)
        rows = await self.pool.fetch(
            """
            select id, user_id, company_id, title, url, location, status, notes, created_at, updated_at
            from jobs
            where user_id = $1
              and ($2 = '' or status = $2)
              and ($3 = '' or title ilike $3 or location ilike $3)
            order by updated_at desc
            limit $4
            """,
            user_id,
            status,
            like,
            _clamp_limit(limit),
        )
        return [row_to_job(row) for row in rows]

    async def get_job(self, user_id: UUID, job_id: UUID) -> Job:
        return await self._query_one(
            """
            select id, user_id, company_id, title, url, location, status, notes, created_at, updated_at
            from jobs where id = $1 and user_id = $2
            """,
            job_id,
            user_id,
            mapper=row_to_job,
        )

    async def create_job(self, job: Job) -> Job:
        return await self._query_one(
            """
            insert into jobs (user_id, company_id, title, url, location, status, notes)
            values ($1, $2, $3, $4, $5, $6, $7)
            returning id, user_id, company_id, title, url, location, status, notes, created_at, updated_at
            """,
            job.user_id,
            job.company_id,
            job.title,
            job.url,
            job.location,
            job.status,
            job.notes,
            mapper=row_to_job,
        )

    async def update_job(self, job: Job) -> Job:
        return await self._query_one(
            """
            update jobs
            set company_id = $3, title = $4, url = $5, location = $6, status = $7, notes = $8
            where id = $1 and user_id = $2
            returning id, user_id, company_id, title, url, location, status, notes, created_at, updated_at
            """,
            job.id,
            job.user_id,
            job.company_id,
            job.title,
            job.url,
            job.location,
            job.status,
            job.notes,
            mapper=row_to_job,
        )

    async def delete_job(self, user_id: UUID, job_id: UUID) -> None:
        result = await self.pool.execute(
            "delete from jobs where id = $1 and user_id = $2",
            job_id,
            user_id,
        )
        if result.split()[-1] == "0":
            raise NotFoundError()

    async def list_conversations(
        self, user_id: UUID, status: str, q: str, limit: int
    ) -> list[Conversation]:
        like = _like_query(q)
        rows = await self.pool.fetch(
            """
            select id, user_id, contact_id, company_id, job_id, channel, subject, status, last_event_at, created_at, updated_at
            from conversations
            where user_id = $1
              and ($2 = '' or status = $2)
              and ($3 = '' or subject ilike $3)
            order by coalesce(last_event_at, updated_at) desc
            limit $4
            """,
            user_id,
            status,
            like,
            _clamp_limit(limit),
        )
        return [row_to_conversation(row) for row in rows]

    async def get_conversation(
        self, user_id: UUID, conversation_id: UUID
    ) -> Conversation:
        return await self._query_one(
            """
            select id, user_id, contact_id, company_id, job_id, channel, subject, status, last_event_at, created_at, updated_at
            from conversations where id = $1 and user_id = $2
            """,
            conversation_id,
            user_id,
            mapper=row_to_conversation,
        )

    async def create_conversation(self, conversation: Conversation) -> Conversation:
        return await self._query_one(
            """
            insert into conversations (user_id, contact_id, company_id, job_id, channel, subject, status)
            values ($1, $2, $3, $4, $5, $6, $7)
            returning id, user_id, contact_id, company_id, job_id, channel, subject, status, last_event_at, created_at, updated_at
            """,
            conversation.user_id,
            conversation.contact_id,
            conversation.company_id,
            conversation.job_id,
            conversation.channel,
            conversation.subject,
            conversation.status,
            mapper=row_to_conversation,
        )

    async def update_conversation(self, conversation: Conversation) -> Conversation:
        return await self._query_one(
            """
            update conversations
            set contact_id = $3, company_id = $4, job_id = $5, channel = $6, subject = $7, status = $8
            where id = $1 and user_id = $2
            returning id, user_id, contact_id, company_id, job_id, channel, subject, status, last_event_at, created_at, updated_at
            """,
            conversation.id,
            conversation.user_id,
            conversation.contact_id,
            conversation.company_id,
            conversation.job_id,
            conversation.channel,
            conversation.subject,
            conversation.status,
            mapper=row_to_conversation,
        )

    async def delete_conversation(
        self, user_id: UUID, conversation_id: UUID
    ) -> None:
        result = await self.pool.execute(
            "delete from conversations where id = $1 and user_id = $2",
            conversation_id,
            user_id,
        )
        if result.split()[-1] == "0":
            raise NotFoundError()

    async def list_outreach(
        self,
        user_id: UUID,
        status: str,
        event_type: str,
        types: list[str],
        q: str,
        limit: int,
        status_suggestion: str = "",
    ) -> list[OutreachEvent]:
        like = _like_query(q)
        limit_val = _clamp_limit(limit)
        days = follow_up_due_days()
        params: list[Any] = [user_id]
        idx = 2

        status_sql, status_vals, idx = outreach_status_sql(status, idx)
        params.extend(status_vals)

        if types:
            type_sql = f"type = any(${idx}::text[])"
            params.append(types)
            idx += 1
        elif event_type:
            type_sql = f"type = ${idx}"
            params.append(event_type)
            idx += 1
        else:
            type_sql = "true"

        search_sql = f"(${idx} = '' or subject ilike ${idx} or body ilike ${idx})"
        params.append(like)
        idx += 1

        status_expr = outreach_effective_status_sql(f"${idx}")
        params.append(days)
        idx += 1

        if status_suggestion:
            suggestion_sql = f"status_suggestion = ${idx}"
            params.append(status_suggestion)
            idx += 1
        else:
            suggestion_sql = "true"

        query = f"""
            select id, user_id, conversation_id, contact_id, company_id, job_id, type, channel, source,
                   {status_expr} as status,
                   subject, body, external_id, gmail_thread_id,
                   status_suggestion, status_suggestion_reason, status_suggestion_snippet,
                   occurred_at, created_at, updated_at
            from outreach_events
            where user_id = $1
              and {status_sql}
              and {type_sql}
              and {search_sql}
              and {suggestion_sql}
            order by occurred_at desc
            limit ${idx}
        """
        params.append(limit_val)
        rows = await self.pool.fetch(query, *params)
        return [row_to_outreach(row) for row in rows]

    async def _follow_up_was_sent(self, user_id: UUID, event: OutreachEvent) -> bool:
        return bool(
            await self.pool.fetchval(
                f"""
                select exists(
                  select 1
                  from outreach_events fu
                  where fu.user_id = $1
                    and fu.type = 'follow_up'
                    and fu.occurred_at > $2
                    and fu.id <> $3
                    and (
                      (
                        $4::text is not null and $4::text <> ''
                        and fu.gmail_thread_id = $4::text
                      )
                      or (
                        trim($5::text) <> ''
                        and lower(regexp_replace(trim($5::text), '^(re:|fwd:|fw:)\\s*', '', 'i'))
                          = lower(regexp_replace(trim(fu.subject), '^(re:|fwd:|fw:)\\s*', '', 'i'))
                      )
                    )
                )
                """,
                user_id,
                event.occurred_at,
                event.id,
                event.gmail_thread_id or "",
                event.subject,
            )
        )

    async def get_outreach(self, user_id: UUID, outreach_id: UUID) -> OutreachEvent:
        event = await self._query_one(
            """
            select id, user_id, conversation_id, contact_id, company_id, job_id, type, channel, source, status,
                   subject, body, external_id, gmail_thread_id,
                   status_suggestion, status_suggestion_reason, status_suggestion_snippet,
                   occurred_at, created_at, updated_at
            from outreach_events where id = $1 and user_id = $2
            """,
            outreach_id,
            user_id,
            mapper=row_to_outreach,
        )
        if event.type in FIRST_MAIL_TYPES:
            follow_up_sent = await self._follow_up_was_sent(user_id, event)
            event.status = resolve_first_touch_status(
                event.status,
                event.occurred_at,
                follow_up_sent=follow_up_sent,
            )
        return event

    async def create_outreach(self, event: OutreachEvent) -> OutreachEvent:
        return await self._query_one(
            """
            insert into outreach_events (
              user_id, conversation_id, contact_id, company_id, job_id, type, channel, source, status,
              subject, body, external_id, occurred_at
            ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            returning id, user_id, conversation_id, contact_id, company_id, job_id, type, channel, source, status,
                      subject, body, external_id, occurred_at, created_at, updated_at
            """,
            event.user_id,
            event.conversation_id,
            event.contact_id,
            event.company_id,
            event.job_id,
            event.type,
            event.channel,
            event.source,
            event.status,
            event.subject,
            event.body,
            event.external_id,
            event.occurred_at,
            mapper=row_to_outreach,
        )

    async def update_outreach(self, event: OutreachEvent) -> OutreachEvent:
        return await self._query_one(
            """
            update outreach_events
            set conversation_id = $3, contact_id = $4, company_id = $5, job_id = $6,
                type = $7, channel = $8, source = $9, status = $10, subject = $11, body = $12, occurred_at = $13
            where id = $1 and user_id = $2
            returning id, user_id, conversation_id, contact_id, company_id, job_id, type, channel, source, status,
                      subject, body, external_id, occurred_at, created_at, updated_at
            """,
            event.id,
            event.user_id,
            event.conversation_id,
            event.contact_id,
            event.company_id,
            event.job_id,
            event.type,
            event.channel,
            event.source,
            event.status,
            event.subject,
            event.body,
            event.occurred_at,
            mapper=row_to_outreach,
        )

    async def delete_outreach(self, user_id: UUID, outreach_id: UUID) -> None:
        result = await self.pool.execute(
            "delete from outreach_events where id = $1 and user_id = $2",
            outreach_id,
            user_id,
        )
        if result.split()[-1] == "0":
            raise NotFoundError()

    async def list_reminders(
        self, user_id: UUID, open_only: bool, limit: int
    ) -> list[Reminder]:
        rows = await self.pool.fetch(
            """
            select id, user_id, outreach_event_id, conversation_id, kind, due_at, notes, completed_at, created_at, updated_at
            from reminders
            where user_id = $1
              and ($2 = false or completed_at is null)
            order by due_at asc
            limit $3
            """,
            user_id,
            open_only,
            _clamp_limit(limit),
        )
        return [row_to_reminder(row) for row in rows]

    async def get_reminder(self, user_id: UUID, reminder_id: UUID) -> Reminder:
        return await self._query_one(
            """
            select id, user_id, outreach_event_id, conversation_id, kind, due_at, notes, completed_at, created_at, updated_at
            from reminders where id = $1 and user_id = $2
            """,
            reminder_id,
            user_id,
            mapper=row_to_reminder,
        )

    async def create_reminder(self, reminder: Reminder) -> Reminder:
        return await self._query_one(
            """
            insert into reminders (user_id, outreach_event_id, conversation_id, kind, due_at, notes)
            values ($1, $2, $3, $4, $5, $6)
            returning id, user_id, outreach_event_id, conversation_id, kind, due_at, notes, completed_at, created_at, updated_at
            """,
            reminder.user_id,
            reminder.outreach_event_id,
            reminder.conversation_id,
            reminder.kind,
            reminder.due_at,
            reminder.notes,
            mapper=row_to_reminder,
        )

    async def update_reminder(self, reminder: Reminder) -> Reminder:
        return await self._query_one(
            """
            update reminders
            set outreach_event_id = $3, conversation_id = $4, kind = $5, due_at = $6, notes = $7, completed_at = $8
            where id = $1 and user_id = $2
            returning id, user_id, outreach_event_id, conversation_id, kind, due_at, notes, completed_at, created_at, updated_at
            """,
            reminder.id,
            reminder.user_id,
            reminder.outreach_event_id,
            reminder.conversation_id,
            reminder.kind,
            reminder.due_at,
            reminder.notes,
            reminder.completed_at,
            mapper=row_to_reminder,
        )

    async def delete_reminder(self, user_id: UUID, reminder_id: UUID) -> None:
        result = await self.pool.execute(
            "delete from reminders where id = $1 and user_id = $2",
            reminder_id,
            user_id,
        )
        if result.split()[-1] == "0":
            raise NotFoundError()

    async def get_active_gmail_connection(self, user_id: UUID) -> GmailConnection:
        return await self._query_one(
            """
            select id, user_id, google_email, access_token, refresh_token, token_expires_at,
                   scopes, connected_at, revoked_at, created_at, updated_at
            from gmail_connections
            where user_id = $1 and revoked_at is null
            order by connected_at desc
            limit 1
            """,
            user_id,
            mapper=row_to_gmail_connection,
        )

    async def upsert_gmail_connection(
        self,
        user_id: UUID,
        google_email: str,
        access_token: str,
        refresh_token: str,
        scopes: str,
        token_expires_at: datetime,
    ) -> GmailConnection:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    update gmail_connections
                    set revoked_at = now()
                    where user_id = $1 and revoked_at is null
                    """,
                    user_id,
                )
                row = await conn.fetchrow(
                    """
                    insert into gmail_connections (
                      user_id, google_email, access_token, refresh_token, token_expires_at, scopes
                    ) values ($1, $2, $3, $4, $5, $6)
                    returning id, user_id, google_email, access_token, refresh_token, token_expires_at,
                              scopes, connected_at, revoked_at, created_at, updated_at
                    """,
                    user_id,
                    google_email,
                    access_token,
                    refresh_token,
                    token_expires_at,
                    scopes,
                )
                if row is None:
                    raise NotFoundError()
                return row_to_gmail_connection(row)

    async def revoke_gmail_connection(self, user_id: UUID) -> GmailConnection:
        return await self._query_one(
            """
            update gmail_connections
            set revoked_at = now()
            where user_id = $1 and revoked_at is null
            returning id, user_id, google_email, access_token, refresh_token, token_expires_at,
                      scopes, connected_at, revoked_at, created_at, updated_at
            """,
            user_id,
            mapper=row_to_gmail_connection,
        )

    async def update_gmail_tokens(
        self,
        connection_id: UUID,
        access_token: str,
        refresh_token: str,
        token_expires_at: datetime,
    ) -> None:
        await self.pool.execute(
            """
            update gmail_connections
            set access_token = $2, refresh_token = $3, token_expires_at = $4
            where id = $1 and revoked_at is null
            """,
            connection_id,
            access_token,
            refresh_token,
            token_expires_at,
        )

    async def list_gmail_thread_ids_for_rejection_scan(self, user_id: UUID) -> list[str]:
        rows = await self.pool.fetch(
            """
            select distinct gmail_thread_id
            from outreach_events
            where user_id = $1
              and gmail_thread_id is not null
              and gmail_thread_id <> ''
              and type = any($2::text[])
              and status <> 'rejected'
            """,
            user_id,
            FIRST_MAIL_TYPES,
        )
        return [str(row["gmail_thread_id"]) for row in rows]

    async def suggest_rejection_for_thread(
        self,
        user_id: UUID,
        gmail_thread_id: str,
        reason: str,
        snippet: str,
    ) -> None:
        await self.pool.execute(
            """
            update outreach_events
            set status_suggestion = 'rejected',
                status_suggestion_reason = $3,
                status_suggestion_snippet = $4
            where user_id = $1
              and gmail_thread_id = $2
              and type = any($5::text[])
              and status <> 'rejected'
            """,
            user_id,
            gmail_thread_id,
            reason,
            snippet,
            FIRST_MAIL_TYPES,
        )

    async def confirm_status_suggestion(
        self, user_id: UUID, outreach_id: UUID
    ) -> OutreachEvent:
        row = await self.pool.fetchrow(
            """
            select gmail_thread_id, status_suggestion, status
            from outreach_events
            where id = $1 and user_id = $2
            """,
            outreach_id,
            user_id,
        )
        if row is None:
            raise NotFoundError()
        if not row["status_suggestion"]:
            if row["status"] == "rejected":
                return await self.get_outreach(user_id, outreach_id)
            raise ValueError("no pending status suggestion")

        thread_id = row["gmail_thread_id"]
        if thread_id:
            await self.pool.execute(
                """
                update outreach_events
                set status = 'rejected',
                    status_suggestion = null,
                    status_suggestion_reason = '',
                    status_suggestion_snippet = ''
                where user_id = $1
                  and gmail_thread_id = $2
                  and status_suggestion is not null
                """,
                user_id,
                thread_id,
            )
        else:
            await self.pool.execute(
                """
                update outreach_events
                set status = 'rejected',
                    status_suggestion = null,
                    status_suggestion_reason = '',
                    status_suggestion_snippet = ''
                where id = $1 and user_id = $2
                """,
                outreach_id,
                user_id,
            )
        return await self.get_outreach(user_id, outreach_id)

    async def dismiss_status_suggestion(
        self, user_id: UUID, outreach_id: UUID
    ) -> OutreachEvent:
        row = await self.pool.fetchrow(
            """
            select gmail_thread_id, status_suggestion
            from outreach_events
            where id = $1 and user_id = $2
            """,
            outreach_id,
            user_id,
        )
        if row is None:
            raise NotFoundError()
        if not row["status_suggestion"]:
            raise ValueError("no pending status suggestion")

        thread_id = row["gmail_thread_id"]
        if thread_id:
            await self.pool.execute(
                """
                update outreach_events
                set status_suggestion = null,
                    status_suggestion_reason = '',
                    status_suggestion_snippet = ''
                where user_id = $1 and gmail_thread_id = $2
                """,
                user_id,
                thread_id,
            )
        else:
            await self.pool.execute(
                """
                update outreach_events
                set status_suggestion = null,
                    status_suggestion_reason = '',
                    status_suggestion_snippet = ''
                where id = $1 and user_id = $2
                """,
                outreach_id,
                user_id,
            )
        return await self.get_outreach(user_id, outreach_id)

    async def upsert_gmail_crm_links(
        self,
        user_id: UUID,
        *,
        to_header: str,
        subject: str,
        gmail_thread_id: str | None,
        status: str,
        occurred_at: datetime,
    ) -> tuple[UUID | None, UUID | None, UUID | None]:
        from app.gmail.entities import parse_gmail_crm_hints

        hints = parse_gmail_crm_hints(to_header, subject)
        company_id = await self._upsert_company_for_gmail(
            user_id, hints.company_name, hints.company_domain
        )
        contact_id = await self._upsert_contact_for_gmail(
            user_id,
            hints.recipient,
            company_id,
            gmail_thread_id,
        )
        conversation_id = None
        if gmail_thread_id:
            conversation_id = await self._upsert_conversation_for_gmail(
                user_id,
                gmail_thread_id,
                contact_id,
                company_id,
                hints.thread_subject,
                status,
                occurred_at,
            )
        return company_id, contact_id, conversation_id

    async def _upsert_company_for_gmail(
        self,
        user_id: UUID,
        name: str,
        domain: str,
    ) -> UUID | None:
        from app.gmail.entities import domain_to_company_name

        display_name = name.strip() or (
            domain_to_company_name(domain) if domain else ""
        )
        if not display_name:
            return None

        if domain:
            row = await self.pool.fetchrow(
                """
                select id from companies
                where user_id = $1 and domain = $2
                """,
                user_id,
                domain,
            )
            if row:
                return row["id"]
            row = await self.pool.fetchrow(
                """
                insert into companies (user_id, name, domain, notes)
                values ($1, $2, $3, '')
                returning id
                """,
                user_id,
                display_name,
                domain,
            )
            return row["id"] if row else None

        row = await self.pool.fetchrow(
            """
            select id from companies
            where user_id = $1 and lower(name) = lower($2)
            limit 1
            """,
            user_id,
            display_name,
        )
        if row:
            return row["id"]
        row = await self.pool.fetchrow(
            """
            insert into companies (user_id, name, notes)
            values ($1, $2, '')
            returning id
            """,
            user_id,
            display_name,
        )
        return row["id"] if row else None

    async def _upsert_contact_for_gmail(
        self,
        user_id: UUID,
        recipient: "ParsedRecipient",
        company_id: UUID | None,
        gmail_thread_id: str | None,
    ) -> UUID | None:
        email = (recipient.email or "").strip().lower()
        first_name = (recipient.first_name or "").strip()
        last_name = (recipient.last_name or "").strip()

        if email:
            row = await self.pool.fetchrow(
                """
                select id, company_id from contacts
                where user_id = $1 and lower(email) = $2
                """,
                user_id,
                email,
            )
            if row:
                if company_id and row["company_id"] is None:
                    await self.pool.execute(
                        "update contacts set company_id = $2 where id = $1",
                        row["id"],
                        company_id,
                    )
                return row["id"]
            row = await self.pool.fetchrow(
                """
                insert into contacts (
                  user_id, company_id, first_name, last_name, email, title, notes
                ) values ($1, $2, $3, $4, $5, '', '')
                returning id
                """,
                user_id,
                company_id,
                first_name,
                last_name,
                email,
            )
            return row["id"] if row else None

        if gmail_thread_id:
            row = await self.pool.fetchrow(
                """
                select contact_id from conversations
                where user_id = $1 and gmail_thread_id = $2 and contact_id is not null
                """,
                user_id,
                gmail_thread_id,
            )
            if row and row["contact_id"]:
                return row["contact_id"]

        if not first_name and not last_name:
            return None

        row = await self.pool.fetchrow(
            """
            select id from contacts
            where user_id = $1
              and company_id is not distinct from $2
              and lower(first_name) = lower($3)
              and lower(last_name) = lower($4)
            limit 1
            """,
            user_id,
            company_id,
            first_name,
            last_name,
        )
        if row:
            return row["id"]

        row = await self.pool.fetchrow(
            """
            insert into contacts (
              user_id, company_id, first_name, last_name, email, title, notes
            ) values ($1, $2, $3, $4, null, '', '')
            returning id
            """,
            user_id,
            company_id,
            first_name,
            last_name,
        )
        return row["id"] if row else None

    async def _upsert_conversation_for_gmail(
        self,
        user_id: UUID,
        gmail_thread_id: str,
        contact_id: UUID | None,
        company_id: UUID | None,
        subject: str,
        status: str,
        occurred_at: datetime,
    ) -> UUID | None:
        row = await self.pool.fetchrow(
            """
            select id from conversations
            where user_id = $1 and gmail_thread_id = $2
            """,
            user_id,
            gmail_thread_id,
        )
        if row:
            await self.pool.execute(
                """
                update conversations
                set contact_id = coalesce($3, contact_id),
                    company_id = coalesce($4, company_id),
                    subject = case when $5 <> '' then $5 else subject end,
                    status = $6,
                    last_event_at = greatest(coalesce(last_event_at, $7), $7)
                where id = $1 and user_id = $2
                """,
                row["id"],
                user_id,
                contact_id,
                company_id,
                subject,
                status,
                occurred_at,
            )
            return row["id"]

        row = await self.pool.fetchrow(
            """
            insert into conversations (
              user_id, contact_id, company_id, channel, subject, status, last_event_at, gmail_thread_id
            ) values ($1, $2, $3, 'gmail', $4, $5, $6, $7)
            returning id
            """,
            user_id,
            contact_id,
            company_id,
            subject,
            status,
            occurred_at,
            gmail_thread_id,
        )
        return row["id"] if row else None

    async def upsert_gmail_outreach(self, event: OutreachEvent) -> bool:
        row = await self.pool.fetchrow(
            """
            insert into outreach_events (
              user_id, conversation_id, contact_id, company_id, job_id, type, channel, source, status,
              subject, body, external_id, gmail_thread_id, occurred_at
            ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            on conflict (user_id, source, external_id)
              where external_id is not null and external_id <> ''
            do update set
              type = excluded.type,
              status = excluded.status,
              subject = excluded.subject,
              body = excluded.body,
              gmail_thread_id = excluded.gmail_thread_id,
              conversation_id = excluded.conversation_id,
              contact_id = excluded.contact_id,
              company_id = excluded.company_id,
              occurred_at = excluded.occurred_at
            returning (xmax = 0) as inserted
            """,
            event.user_id,
            event.conversation_id,
            event.contact_id,
            event.company_id,
            event.job_id,
            event.type,
            event.channel,
            event.source,
            event.status,
            event.subject,
            event.body,
            event.external_id,
            event.gmail_thread_id,
            event.occurred_at,
        )
        if row is None:
            return False
        return bool(row["inserted"])
