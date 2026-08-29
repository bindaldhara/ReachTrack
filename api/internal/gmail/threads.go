package gmail

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"
)

func (s *Service) FetchThreads(ctx context.Context, accessToken, refreshToken string, expiresAt time.Time, threadIDs []string) (map[string]*ThreadContext, error) {
	out := make(map[string]*ThreadContext, len(threadIDs))
	client := s.client(ctx, accessToken, refreshToken, expiresAt)
	for _, id := range threadIDs {
		if id == "" || out[id] != nil {
			continue
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		rawURL := fmt.Sprintf("https://gmail.googleapis.com/gmail/v1/users/me/threads/%s?format=metadata&metadataHeaders=From&metadataHeaders=Subject", url.PathEscape(id))
		var raw threadResponse
		if err := gmailGet(ctx, client, rawURL, &raw); err != nil {
			return nil, err
		}
		tc := &ThreadContext{ID: raw.ID}
		for _, m := range raw.Messages {
			tm := ThreadMessage{
				ID:      m.ID,
				Snippet: m.Snippet,
				IsSent:  hasLabel(m.LabelIDs, "SENT"),
			}
			if ms, ok := parseInternalDate(m.InternalDate); ok {
				tm.InternalDate = ms
			}
			for _, h := range m.Payload.Headers {
				switch strings.ToLower(h.Name) {
				case "from":
					tm.From = h.Value
				case "subject":
					tm.Subject = h.Value
				}
			}
			tc.Messages = append(tc.Messages, tm)
		}
		sortThreadMessages(tc.Messages)
		out[id] = tc
	}
	return out, nil
}

type threadResponse struct {
	ID       string `json:"id"`
	Messages []struct {
		ID           string   `json:"id"`
		InternalDate string   `json:"internalDate"`
		Snippet      string   `json:"snippet"`
		LabelIDs     []string `json:"labelIds"`
		Payload      struct {
			Headers []struct {
				Name  string `json:"name"`
				Value string `json:"value"`
			} `json:"headers"`
		} `json:"payload"`
	} `json:"messages"`
}

func hasLabel(labels []string, want string) bool {
	for _, l := range labels {
		if l == want {
			return true
		}
	}
	return false
}

func parseInternalDate(raw string) (time.Time, bool) {
	var ms int64
	if _, err := fmt.Sscan(raw, &ms); err != nil {
		return time.Time{}, false
	}
	return time.UnixMilli(ms).UTC(), true
}

func sortThreadMessages(msgs []ThreadMessage) {
	for i := 0; i < len(msgs); i++ {
		for j := i + 1; j < len(msgs); j++ {
			if msgs[j].InternalDate.Before(msgs[i].InternalDate) {
				msgs[i], msgs[j] = msgs[j], msgs[i]
			}
		}
	}
}
