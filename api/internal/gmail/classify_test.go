package gmail

import (
	"testing"
	"time"

	"reachtrack/internal/model"
)

func TestClassifyColdEmail(t *testing.T) {
	got := ClassifyMessage(SentMessage{
		ID:      "1",
		Subject: "Interested in backend role",
		Snippet: "I'd appreciate it if you could take a quick look at my profile",
	}, nil, "me@example.com")
	if got.Type != "cold_email" {
		t.Fatalf("type = %s, want cold_email", got.Type)
	}
}

func TestClassifyReferral(t *testing.T) {
	got := ClassifyMessage(SentMessage{
		Subject: "Referral request",
		Snippet: "Would you be open to referring me for the role?",
	}, nil, "me@example.com")
	if got.Type != "referral_request" {
		t.Fatalf("type = %s, want referral_request", got.Type)
	}
}

func TestClassifyFollowUp(t *testing.T) {
	got := ClassifyMessage(SentMessage{
		Subject: "Re: Role at Amboras",
		Snippet: "Just following up on my note from last week",
		InReplyTo: "<abc@mail>",
	}, &ThreadContext{
		Messages: []ThreadMessage{
			{ID: "1", IsSent: true, From: "me@example.com"},
			{ID: "2", IsSent: false, From: "them@company.com", InternalDate: time.Now()},
		},
	}, "me@example.com")
	if got.Type != "follow_up" {
		t.Fatalf("type = %s, want follow_up", got.Type)
	}
}

func TestClassifyEmailReply(t *testing.T) {
	got := ClassifyMessage(SentMessage{
		ID:        "3",
		Subject:   "Re: Role at Amboras",
		Snippet:   "Thank you for your response.",
		InReplyTo: "<abc@mail>",
		InternalDate: time.Unix(0, 0).Add(3 * time.Hour),
	}, &ThreadContext{
		Messages: []ThreadMessage{
			{ID: "1", IsSent: true, From: "me@example.com", InternalDate: time.Unix(0, 0)},
			{ID: "2", IsSent: false, From: "amin@company.com", InternalDate: time.Unix(0, 0).Add(time.Hour)},
			{ID: "3", IsSent: true, From: "me@example.com", InternalDate: time.Unix(0, 0).Add(3 * time.Hour)},
		},
	}, "me@example.com")
	if got.Type != "email_reply" {
		t.Fatalf("type = %s, want email_reply", got.Type)
	}
}

func TestClassifyColdEmailRejectedThread(t *testing.T) {
	got := ClassifyMessage(SentMessage{
		ID:      "1",
		Subject: "Interested in role",
		Snippet: "Would love to join your team",
		InternalDate: time.Unix(0, 0),
	}, &ThreadContext{
		Messages: []ThreadMessage{
			{ID: "1", IsSent: true, From: "me@example.com", InternalDate: time.Unix(0, 0)},
			{ID: "2", IsSent: false, From: "amin@company.com", Snippet: "we won't be moving forward", InternalDate: time.Unix(0, 0).Add(time.Hour)},
		},
	}, "me@example.com")
	if got.Type != "cold_email" {
		t.Fatalf("type = %s, want cold_email", got.Type)
	}
	if got.Status != model.StatusRejected {
		t.Fatalf("status = %s, want rejected", got.Status)
	}
}
