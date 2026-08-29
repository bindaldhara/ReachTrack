package model

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	StatusSent        = "sent"
	StatusWaiting     = "waiting"
	StatusReplied     = "replied"
	StatusFollowUpDue = "follow_up_due"
	StatusInterview   = "interview"
	StatusRejected    = "rejected"
	StatusClosed      = "closed"
)

var Statuses = []string{
	StatusSent,
	StatusWaiting,
	StatusReplied,
	StatusFollowUpDue,
	StatusInterview,
	StatusRejected,
	StatusClosed,
}

var Types = []string{
	"cold_email",
	"referral_request",
	"linkedin_dm",
	"linkedin_reply",
	"application",
}

var Channels = []string{
	"gmail",
	"linkedin",
	"careers_page",
	"other",
}

var Sources = []string{
	"manual",
	"gmail",
	"chrome_extension",
	"mobile_share",
}

var ReminderKinds = []string{
	"follow_up",
	"reply_needed",
	"interview",
}

type Profile struct {
	ID        uuid.UUID `db:"id" json:"id"`
	Email     string    `db:"email" json:"email"`
	FullName  string    `db:"full_name" json:"fullName"`
	Timezone  string    `db:"timezone" json:"timezone"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time `db:"updated_at" json:"updatedAt"`
}

type Company struct {
	ID          uuid.UUID `db:"id" json:"id"`
	UserID      uuid.UUID `db:"user_id" json:"userId"`
	Name        string    `db:"name" json:"name"`
	Domain      *string   `db:"domain" json:"domain"`
	Website     *string   `db:"website" json:"website"`
	LinkedinURL *string   `db:"linkedin_url" json:"linkedinUrl"`
	Notes       string    `db:"notes" json:"notes"`
	CreatedAt   time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time `db:"updated_at" json:"updatedAt"`
}

type Contact struct {
	ID          uuid.UUID  `db:"id" json:"id"`
	UserID      uuid.UUID  `db:"user_id" json:"userId"`
	CompanyID   *uuid.UUID `db:"company_id" json:"companyId"`
	FirstName   string     `db:"first_name" json:"firstName"`
	LastName    string     `db:"last_name" json:"lastName"`
	Email       *string    `db:"email" json:"email"`
	LinkedinURL *string    `db:"linkedin_url" json:"linkedinUrl"`
	Title       string     `db:"title" json:"title"`
	Notes       string     `db:"notes" json:"notes"`
	CreatedAt   time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updatedAt"`
}

type Job struct {
	ID        uuid.UUID  `db:"id" json:"id"`
	UserID    uuid.UUID  `db:"user_id" json:"userId"`
	CompanyID *uuid.UUID `db:"company_id" json:"companyId"`
	Title     string     `db:"title" json:"title"`
	URL       *string    `db:"url" json:"url"`
	Location  string     `db:"location" json:"location"`
	Status    string     `db:"status" json:"status"`
	Notes     string     `db:"notes" json:"notes"`
	CreatedAt time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time  `db:"updated_at" json:"updatedAt"`
}

type Conversation struct {
	ID          uuid.UUID  `db:"id" json:"id"`
	UserID      uuid.UUID  `db:"user_id" json:"userId"`
	ContactID   *uuid.UUID `db:"contact_id" json:"contactId"`
	CompanyID   *uuid.UUID `db:"company_id" json:"companyId"`
	JobID       *uuid.UUID `db:"job_id" json:"jobId"`
	Channel     string     `db:"channel" json:"channel"`
	Subject     string     `db:"subject" json:"subject"`
	Status      string     `db:"status" json:"status"`
	LastEventAt *time.Time `db:"last_event_at" json:"lastEventAt"`
	CreatedAt   time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updatedAt"`
}

type OutreachEvent struct {
	ID             uuid.UUID  `db:"id" json:"id"`
	UserID         uuid.UUID  `db:"user_id" json:"userId"`
	ConversationID *uuid.UUID `db:"conversation_id" json:"conversationId"`
	ContactID      *uuid.UUID `db:"contact_id" json:"contactId"`
	CompanyID      *uuid.UUID `db:"company_id" json:"companyId"`
	JobID          *uuid.UUID `db:"job_id" json:"jobId"`
	Type           string     `db:"type" json:"type"`
	Channel        string     `db:"channel" json:"channel"`
	Source         string     `db:"source" json:"source"`
	Status         string     `db:"status" json:"status"`
	Subject        string     `db:"subject" json:"subject"`
	Body           string     `db:"body" json:"body"`
	ExternalID     *string    `db:"external_id" json:"externalId"`
	OccurredAt     time.Time  `db:"occurred_at" json:"occurredAt"`
	CreatedAt      time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt      time.Time  `db:"updated_at" json:"updatedAt"`
}

type Reminder struct {
	ID              uuid.UUID  `db:"id" json:"id"`
	UserID          uuid.UUID  `db:"user_id" json:"userId"`
	OutreachEventID *uuid.UUID `db:"outreach_event_id" json:"outreachEventId"`
	ConversationID  *uuid.UUID `db:"conversation_id" json:"conversationId"`
	Kind            string     `db:"kind" json:"kind"`
	DueAt           time.Time  `db:"due_at" json:"dueAt"`
	Notes           string     `db:"notes" json:"notes"`
	CompletedAt     *time.Time `db:"completed_at" json:"completedAt"`
	CreatedAt       time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt       time.Time  `db:"updated_at" json:"updatedAt"`
}

type Stats struct {
	OutreachByStatus      map[string]int `json:"outreachByStatus"`
	ConversationsByStatus map[string]int `json:"conversationsByStatus"`
	JobsByStatus          map[string]int `json:"jobsByStatus"`
	OpenReminders         int            `json:"openReminders"`
	TotalOutreach         int            `json:"totalOutreach"`
	TotalContacts         int            `json:"totalContacts"`
	TotalCompanies        int            `json:"totalCompanies"`
}

func ValidStatus(v string) bool       { return inList(v, Statuses) }
func ValidType(v string) bool         { return inList(v, Types) }
func ValidChannel(v string) bool      { return inList(v, Channels) }
func ValidSource(v string) bool       { return inList(v, Sources) }
func ValidReminderKind(v string) bool { return inList(v, ReminderKinds) }

func inList(v string, items []string) bool {
	for _, item := range items {
		if v == item {
			return true
		}
	}
	return false
}

func RequireStatus(v, fallback string) (string, error) {
	if strings.TrimSpace(v) == "" {
		return fallback, nil
	}
	if !ValidStatus(v) {
		return "", fmt.Errorf("invalid status %q", v)
	}
	return v, nil
}

func EmptyToNil(s string) *string {
	t := strings.TrimSpace(s)
	if t == "" {
		return nil
	}
	return &t
}
