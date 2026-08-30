from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.enums import (
    empty_to_nil,
    require_status,
    valid_channel,
    valid_reminder_kind,
    valid_source,
    valid_type,
)
from app.schemas import (
    Company,
    CompanyRequest,
    Contact,
    ContactRequest,
    Conversation,
    ConversationRequest,
    Job,
    JobRequest,
    OutreachEvent,
    OutreachRequest,
    Reminder,
    ReminderRequest,
    TodoCompany,
    TodoCompanyRequest,
    TodoEmail,
    TodoEmailRequest,
)


def parse_optional_uuid(raw: str) -> UUID | None:
    raw = raw.strip()
    if not raw:
        return None
    return UUID(raw)


def company_from_request(user_id: UUID, req: CompanyRequest) -> Company:
    name = req.name.strip()
    if not name:
        raise ValueError("name is required")
    return Company(
        id=uuid4(),  # placeholder, ignored on create
        user_id=user_id,
        name=name,
        domain=empty_to_nil(req.domain),
        website=empty_to_nil(req.website),
        linkedin_url=empty_to_nil(req.linkedin_url),
        notes=req.notes.strip(),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def contact_from_request(user_id: UUID, req: ContactRequest) -> Contact:
    if not req.first_name.strip() and not req.last_name.strip():
        raise ValueError("first or last name is required")
    try:
        company_id = parse_optional_uuid(req.company_id)
    except ValueError as exc:
        raise ValueError("invalid companyId") from exc
    return Contact(
        id=uuid4(),
        user_id=user_id,
        company_id=company_id,
        first_name=req.first_name.strip(),
        last_name=req.last_name.strip(),
        email=empty_to_nil(req.email),
        linkedin_url=empty_to_nil(req.linkedin_url),
        title=req.title.strip(),
        notes=req.notes.strip(),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def job_from_request(user_id: UUID, req: JobRequest) -> Job:
    title = req.title.strip()
    if not title:
        raise ValueError("title is required")
    status = require_status(req.status, "sent")
    try:
        company_id = parse_optional_uuid(req.company_id)
    except ValueError as exc:
        raise ValueError("invalid companyId") from exc
    return Job(
        id=uuid4(),
        user_id=user_id,
        company_id=company_id,
        title=title,
        url=empty_to_nil(req.url),
        location=req.location.strip(),
        status=status,
        notes=req.notes.strip(),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def conversation_from_request(user_id: UUID, req: ConversationRequest) -> Conversation:
    status = require_status(req.status, "sent")
    channel = req.channel.strip() or "other"
    if not valid_channel(channel):
        raise ValueError("invalid channel")
    try:
        contact_id = parse_optional_uuid(req.contact_id)
        company_id = parse_optional_uuid(req.company_id)
        job_id = parse_optional_uuid(req.job_id)
    except ValueError as exc:
        raise ValueError("invalid contactId") from exc
    return Conversation(
        id=uuid4(),
        user_id=user_id,
        contact_id=contact_id,
        company_id=company_id,
        job_id=job_id,
        channel=channel,
        subject=req.subject.strip(),
        status=status,
        last_event_at=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def outreach_from_request(user_id: UUID, req: OutreachRequest) -> OutreachEvent:
    status = require_status(req.status, "sent")
    event_type = req.type.strip() or "cold_email"
    if not valid_type(event_type):
        raise ValueError("invalid type")
    channel = req.channel.strip() or "other"
    if not valid_channel(channel):
        raise ValueError("invalid channel")
    source = req.source.strip() or "manual"
    if not valid_source(source):
        raise ValueError("invalid source")
    occurred_at = datetime.now(UTC)
    if req.occurred_at.strip():
        try:
            occurred_at = datetime.fromisoformat(req.occurred_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("occurredAt must be RFC3339") from exc
    try:
        conversation_id = parse_optional_uuid(req.conversation_id)
        contact_id = parse_optional_uuid(req.contact_id)
        company_id = parse_optional_uuid(req.company_id)
        job_id = parse_optional_uuid(req.job_id)
    except ValueError as exc:
        raise ValueError("invalid conversationId") from exc
    return OutreachEvent(
        user_id=user_id,
        conversation_id=conversation_id,
        contact_id=contact_id,
        company_id=company_id,
        job_id=job_id,
        type=event_type,
        channel=channel,
        source=source,
        status=status,
        subject=req.subject.strip(),
        body=req.body.strip(),
        external_id=empty_to_nil(req.external_id),
        occurred_at=occurred_at,
    )


def reminder_from_request(user_id: UUID, req: ReminderRequest) -> Reminder:
    kind = req.kind.strip() or "follow_up"
    if not valid_reminder_kind(kind):
        raise ValueError("invalid kind")
    if not req.due_at.strip():
        raise ValueError("dueAt is required")
    try:
        due_at = datetime.fromisoformat(req.due_at.replace("Z", "+00:00"))
    except ValueError:
        try:
            due_at = datetime.strptime(req.due_at, "%Y-%m-%dT%H:%M")
        except ValueError as exc:
            raise ValueError("dueAt must be RFC3339") from exc
    try:
        outreach_event_id = parse_optional_uuid(req.outreach_event_id)
        conversation_id = parse_optional_uuid(req.conversation_id)
    except ValueError as exc:
        raise ValueError("invalid outreachEventId") from exc
    completed_at = None
    if req.completed:
        completed_at = datetime.now(UTC)
    return Reminder(
        id=uuid4(),
        user_id=user_id,
        outreach_event_id=outreach_event_id,
        conversation_id=conversation_id,
        kind=kind,
        due_at=due_at,
        notes=req.notes.strip(),
        completed_at=completed_at,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def todo_email_from_request(user_id: UUID, req: TodoEmailRequest) -> TodoEmail:
    subject = req.subject.strip()
    recipient = req.recipient.strip()
    if not subject and not recipient:
        raise ValueError("subject or recipient is required")
    return TodoEmail(
        id=uuid4(),
        user_id=user_id,
        subject=subject,
        recipient=recipient,
        notes=req.notes.strip(),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def todo_company_from_request(user_id: UUID, req: TodoCompanyRequest) -> TodoCompany:
    name = req.name.strip()
    if not name:
        raise ValueError("name is required")
    try:
        company_id = parse_optional_uuid(req.company_id)
    except ValueError as exc:
        raise ValueError("invalid companyId") from exc
    return TodoCompany(
        id=uuid4(),
        user_id=user_id,
        company_id=company_id,
        name=name,
        notes=req.notes.strip(),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
