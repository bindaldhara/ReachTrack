from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CamelModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        from_attributes=True,
        ser_json_by_alias=True,
    )


class Profile(CamelModel):
    id: UUID
    email: str
    full_name: str = Field(alias="fullName")
    timezone: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class Company(CamelModel):
    id: UUID
    user_id: UUID = Field(alias="userId")
    name: str
    domain: str | None = None
    website: str | None = None
    linkedin_url: str | None = Field(default=None, alias="linkedinUrl")
    notes: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class Contact(CamelModel):
    id: UUID
    user_id: UUID = Field(alias="userId")
    company_id: UUID | None = Field(default=None, alias="companyId")
    first_name: str = Field(alias="firstName")
    last_name: str = Field(alias="lastName")
    email: str | None = None
    linkedin_url: str | None = Field(default=None, alias="linkedinUrl")
    title: str
    notes: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class Job(CamelModel):
    id: UUID
    user_id: UUID = Field(alias="userId")
    company_id: UUID | None = Field(default=None, alias="companyId")
    title: str
    url: str | None = None
    location: str
    status: str
    notes: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class Conversation(CamelModel):
    id: UUID
    user_id: UUID = Field(alias="userId")
    contact_id: UUID | None = Field(default=None, alias="contactId")
    company_id: UUID | None = Field(default=None, alias="companyId")
    job_id: UUID | None = Field(default=None, alias="jobId")
    channel: str
    subject: str
    status: str
    last_event_at: datetime | None = Field(default=None, alias="lastEventAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class OutreachEvent(CamelModel):
    id: UUID | None = None
    user_id: UUID = Field(alias="userId")
    conversation_id: UUID | None = Field(default=None, alias="conversationId")
    contact_id: UUID | None = Field(default=None, alias="contactId")
    company_id: UUID | None = Field(default=None, alias="companyId")
    job_id: UUID | None = Field(default=None, alias="jobId")
    type: str
    channel: str
    source: str
    status: str
    subject: str
    body: str
    external_id: str | None = Field(default=None, alias="externalId")
    gmail_thread_id: str | None = Field(default=None, alias="gmailThreadId")
    status_suggestion: str | None = Field(default=None, alias="statusSuggestion")
    status_suggestion_reason: str = Field(default="", alias="statusSuggestionReason")
    status_suggestion_snippet: str = Field(default="", alias="statusSuggestionSnippet")
    occurred_at: datetime = Field(alias="occurredAt")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class Reminder(CamelModel):
    id: UUID
    user_id: UUID = Field(alias="userId")
    outreach_event_id: UUID | None = Field(default=None, alias="outreachEventId")
    conversation_id: UUID | None = Field(default=None, alias="conversationId")
    kind: str
    due_at: datetime = Field(alias="dueAt")
    notes: str
    completed_at: datetime | None = Field(default=None, alias="completedAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class TodoEmail(CamelModel):
    id: UUID
    user_id: UUID = Field(alias="userId")
    subject: str
    recipient: str
    notes: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class TodoCompany(CamelModel):
    id: UUID
    user_id: UUID = Field(alias="userId")
    company_id: UUID | None = Field(default=None, alias="companyId")
    name: str
    notes: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class GmailConnection(CamelModel):
    id: UUID
    user_id: UUID = Field(alias="userId")
    google_email: str = Field(alias="googleEmail")
    access_token: str = Field(exclude=True)
    refresh_token: str = Field(exclude=True)
    token_expires_at: datetime = Field(alias="tokenExpiresAt")
    scopes: str
    connected_at: datetime = Field(alias="connectedAt")
    revoked_at: datetime | None = Field(default=None, alias="revokedAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class GmailConnectionStatus(CamelModel):
    connected: bool
    email: str | None = None
    connected_at: datetime | None = Field(default=None, alias="connectedAt")
    scopes: str | None = None


class GmailSyncResult(CamelModel):
    date: str
    fetched: int
    imported: int
    updated: int
    by_type: dict[str, int] | None = Field(default=None, alias="byType")
    rejections_scanned: int = Field(default=0, alias="rejectionsScanned")
    rejections_suggested: int = Field(default=0, alias="rejectionsSuggested")
    applications_fetched: int = Field(default=0, alias="applicationsFetched")
    applications_imported: int = Field(default=0, alias="applicationsImported")


class GmailScanRejectionsResult(CamelModel):
    scanned: int
    suggested: int


class OutreachDashboard(CamelModel):
    first_mail_sent: int = Field(alias="firstMailSent")
    follow_ups_taken: int = Field(alias="followUpsTaken")
    replies: int = Field(alias="replies")
    rejections: int = Field(alias="rejections")
    possible_rejections: int = Field(default=0, alias="possibleRejections")
    careers_page_applications: int = Field(default=0, alias="careersPageApplications")
    waiting: int = Field(alias="waiting")
    follow_up_due: int = Field(alias="followUpDue")


class Stats(CamelModel):
    outreach_dashboard: OutreachDashboard = Field(alias="outreachDashboard")
    outreach_by_status: dict[str, int] = Field(alias="outreachByStatus")
    conversations_by_status: dict[str, int] = Field(alias="conversationsByStatus")
    jobs_by_status: dict[str, int] = Field(alias="jobsByStatus")
    open_reminders: int = Field(alias="openReminders")
    total_outreach: int = Field(alias="totalOutreach")
    total_contacts: int = Field(alias="totalContacts")
    total_companies: int = Field(alias="totalCompanies")


class ErrorResponse(CamelModel):
    error: str


class ProfileUpdateRequest(CamelModel):
    full_name: str = Field(default="", alias="fullName")
    timezone: str = ""


class CompanyRequest(CamelModel):
    name: str
    domain: str = ""
    website: str = ""
    linkedin_url: str = Field(default="", alias="linkedinUrl")
    notes: str = ""


class ContactRequest(CamelModel):
    company_id: str = Field(default="", alias="companyId")
    first_name: str = Field(default="", alias="firstName")
    last_name: str = Field(default="", alias="lastName")
    email: str = ""
    linkedin_url: str = Field(default="", alias="linkedinUrl")
    title: str = ""
    notes: str = ""


class JobRequest(CamelModel):
    company_id: str = Field(default="", alias="companyId")
    title: str = ""
    url: str = ""
    location: str = ""
    status: str = ""
    notes: str = ""


class ConversationRequest(CamelModel):
    contact_id: str = Field(default="", alias="contactId")
    company_id: str = Field(default="", alias="companyId")
    job_id: str = Field(default="", alias="jobId")
    channel: str = ""
    subject: str = ""
    status: str = ""


class OutreachRequest(CamelModel):
    conversation_id: str = Field(default="", alias="conversationId")
    contact_id: str = Field(default="", alias="contactId")
    company_id: str = Field(default="", alias="companyId")
    job_id: str = Field(default="", alias="jobId")
    type: str = ""
    channel: str = ""
    source: str = ""
    status: str = ""
    subject: str = ""
    body: str = ""
    external_id: str = Field(default="", alias="externalId")
    occurred_at: str = Field(default="", alias="occurredAt")


class ReminderRequest(CamelModel):
    outreach_event_id: str = Field(default="", alias="outreachEventId")
    conversation_id: str = Field(default="", alias="conversationId")
    kind: str = ""
    due_at: str = Field(default="", alias="dueAt")
    notes: str = ""
    completed: bool | None = None


class TodoEmailRequest(CamelModel):
    subject: str = ""
    recipient: str = ""
    notes: str = ""


class TodoCompanyRequest(CamelModel):
    company_id: str = Field(default="", alias="companyId")
    name: str = ""
    notes: str = ""


class TodoSummary(CamelModel):
    email_count: int = Field(alias="emailCount")
    company_count: int = Field(alias="companyCount")


class GmailSyncRequest(CamelModel):
    date: str = ""


class GmailAuthorizeResponse(CamelModel):
    authorization_url: str = Field(alias="authorizationUrl")


def row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row)
