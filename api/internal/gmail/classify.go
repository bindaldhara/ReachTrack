package gmail

import (
	"strings"
	"time"

	"reachtrack/internal/model"
)

type ThreadMessage struct {
	ID           string
	InternalDate time.Time
	From         string
	Subject      string
	Snippet      string
	IsSent       bool
}

type ThreadContext struct {
	ID       string
	Messages []ThreadMessage
}

type Classification struct {
	Type   string
	Status string
}

// ClassifyMessage labels a sent Gmail message using thread context and content.
func ClassifyMessage(msg SentMessage, thread *ThreadContext, userEmail string) Classification {
	userEmail = strings.ToLower(strings.TrimSpace(userEmail))
	text := strings.ToLower(msg.Subject + "\n" + msg.Snippet)

	priorFromOther := hasPriorIncoming(thread, msg.ID, msg.InternalDate, userEmail)
	inReply := strings.TrimSpace(msg.InReplyTo) != "" || strings.TrimSpace(msg.References) != "" || isReplySubject(msg.Subject)

	if priorFromOther || inReply {
		if isFollowUp(text) {
			return Classification{Type: "follow_up", Status: threadStatusAfter(msg, thread, userEmail)}
		}
		return Classification{Type: "email_reply", Status: model.StatusSent}
	}

	if isApplication(text) {
		return Classification{Type: "application", Status: model.StatusSent}
	}
	if isReferral(text) {
		return Classification{Type: "referral_request", Status: model.StatusSent}
	}
	if isFollowUp(text) {
		return Classification{Type: "follow_up", Status: model.StatusWaiting}
	}

	status := model.StatusSent
	if thread != nil {
		status = threadStatusAfter(msg, thread, userEmail)
	}
	return Classification{Type: "cold_email", Status: status}
}

func hasPriorIncoming(thread *ThreadContext, messageID string, at time.Time, userEmail string) bool {
	if thread == nil {
		return false
	}
	for _, m := range thread.Messages {
		if m.ID == messageID {
			break
		}
		if m.InternalDate.After(at) {
			continue
		}
		if !m.IsSent && !isFromUser(m.From, userEmail) {
			return true
		}
	}
	return false
}

func threadStatusAfter(msg SentMessage, thread *ThreadContext, userEmail string) string {
	if thread == nil {
		return model.StatusSent
	}
	seenSelf := false
	for _, m := range thread.Messages {
		if m.ID == msg.ID {
			seenSelf = true
			continue
		}
		if !seenSelf {
			continue
		}
		if m.IsSent || isFromUser(m.From, userEmail) {
			continue
		}
		return statusFromIncoming(m.Subject + "\n" + m.Snippet)
	}
	for _, m := range thread.Messages {
		if m.ID == msg.ID {
			break
		}
		if m.IsSent || isFromUser(m.From, userEmail) {
			continue
		}
		if m.InternalDate.After(msg.InternalDate) {
			return statusFromIncoming(m.Subject + "\n" + m.Snippet)
		}
	}
	return model.StatusWaiting
}

func statusFromIncoming(text string) string {
	lower := strings.ToLower(text)
	switch {
	case containsAny(lower, "won't be moving forward", "not moving forward", "not proceed", "other candidates", "position has been filled", "unfortunately"):
		return model.StatusRejected
	case containsAny(lower, "interview", "schedule a call", "speak with you", "next steps"):
		return model.StatusInterview
	case containsAny(lower, "thank you for applying", "application received", "received your application"):
		return model.StatusWaiting
	default:
		return model.StatusReplied
	}
}

func isFromUser(from, userEmail string) bool {
	return strings.Contains(strings.ToLower(from), userEmail)
}

func isReplySubject(subject string) bool {
	s := strings.TrimSpace(strings.ToLower(subject))
	return strings.HasPrefix(s, "re:") || strings.HasPrefix(s, "fwd:") || strings.HasPrefix(s, "fw:")
}

func isFollowUp(text string) bool {
	return containsAny(text,
		"following up", "follow up", "follow-up", "followup",
		"checking in", "check in", "check-in",
		"circling back", "circle back",
		"bump", "gentle reminder", "wanted to follow",
		"any update", "touching base", "just following",
	)
}

func isReferral(text string) bool {
	return containsAny(text,
		"referral", "refer me", "employee referral",
		"introduce me", "introduction to", "would you refer",
		"open to referring", "refer my profile",
	)
}

func isApplication(text string) bool {
	return containsAny(text,
		"application submitted", "applied for", "applied to",
		"application received", "thank you for applying",
		"your application", "application confirmation",
		"successfully applied",
	)
}

func containsAny(text string, phrases ...string) bool {
	for _, p := range phrases {
		if strings.Contains(text, p) {
			return true
		}
	}
	return false
}
