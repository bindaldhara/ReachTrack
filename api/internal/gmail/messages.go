package gmail

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

type SentMessage struct {
	ID           string
	ThreadID     string
	Subject      string
	To           string
	From         string
	Snippet      string
	InReplyTo    string
	References   string
	InternalDate time.Time
}

type listResponse struct {
	Messages           []struct{ ID, ThreadID string } `json:"messages"`
	NextPageToken      string                          `json:"nextPageToken"`
	ResultSizeEstimate int                             `json:"resultSizeEstimate"`
}

type messageResponse struct {
	ID           string `json:"id"`
	ThreadID     string `json:"threadId"`
	Snippet      string `json:"snippet"`
	InternalDate string `json:"internalDate"`
	Payload      struct {
		Headers []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"headers"`
	} `json:"payload"`
}

func (s *Service) Refresh(ctx context.Context, refreshToken string) (TokenSet, error) {
	ctx = s.oauthContext(ctx)
	tok := &oauth2.Token{RefreshToken: refreshToken}
	newTok, err := s.oauth.TokenSource(ctx, tok).Token()
	if err != nil {
		return TokenSet{}, fmt.Errorf("refresh token: %w", err)
	}
	expiresAt := newTok.Expiry
	if expiresAt.IsZero() {
		expiresAt = time.Now().Add(time.Hour)
	}
	refresh := newTok.RefreshToken
	if refresh == "" {
		refresh = refreshToken
	}
	return TokenSet{
		AccessToken:  newTok.AccessToken,
		RefreshToken: refresh,
		ExpiresAt:    expiresAt,
		Scopes:       strings.Join(s.oauth.Scopes, " "),
	}, nil
}

func (s *Service) client(ctx context.Context, accessToken, refreshToken string, expiresAt time.Time) *http.Client {
	ctx = s.oauthContext(ctx)
	c := s.oauth.Client(ctx, &oauth2.Token{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		Expiry:       expiresAt,
	})
	c.Timeout = 30 * time.Second
	return c
}

// DayBounds returns [start, end) for a calendar day in loc.
func DayBounds(day time.Time, loc *time.Location) (time.Time, time.Time) {
	day = day.In(loc)
	start := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, loc)
	return start, start.AddDate(0, 0, 1)
}

// YesterdayIn returns yesterday's calendar date in loc.
func YesterdayIn(loc *time.Location) time.Time {
	now := time.Now().In(loc)
	y := now.AddDate(0, 0, -1)
	return time.Date(y.Year(), y.Month(), y.Day(), 0, 0, 0, 0, loc)
}

func sentQuery(start, end time.Time) string {
	return fmt.Sprintf("in:sent after:%s before:%s",
		start.Format("2006/01/02"),
		end.Format("2006/01/02"),
	)
}

func (s *Service) ListSentMessages(ctx context.Context, accessToken, refreshToken string, expiresAt time.Time, start, end time.Time) ([]SentMessage, error) {
	client := s.client(ctx, accessToken, refreshToken, expiresAt)
	query := sentQuery(start, end)

	var ids []struct{ ID, ThreadID string }
	pageToken := ""
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		u, err := url.Parse("https://gmail.googleapis.com/gmail/v1/users/me/messages")
		if err != nil {
			return nil, err
		}
		q := u.Query()
		q.Set("q", query)
		q.Set("maxResults", "100")
		if pageToken != "" {
			q.Set("pageToken", pageToken)
		}
		u.RawQuery = q.Encode()

		var page listResponse
		if err := gmailGet(ctx, client, u.String(), &page); err != nil {
			return nil, err
		}
		ids = append(ids, page.Messages...)
		if page.NextPageToken == "" {
			break
		}
		pageToken = page.NextPageToken
	}

	out := make([]SentMessage, 0, len(ids))
	for _, ref := range ids {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if ref.ID == "" {
			continue
		}
		msg, err := s.getMessage(ctx, client, ref.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, msg)
	}
	return out, nil
}

func (s *Service) getMessage(ctx context.Context, client *http.Client, id string) (SentMessage, error) {
	u := fmt.Sprintf("https://gmail.googleapis.com/gmail/v1/users/me/messages/%s?format=metadata&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Date&metadataHeaders=In-Reply-To&metadataHeaders=References", url.PathEscape(id))
	var raw messageResponse
	if err := gmailGet(ctx, client, u, &raw); err != nil {
		return SentMessage{}, err
	}
	msg := SentMessage{
		ID:       raw.ID,
		ThreadID: raw.ThreadID,
		Snippet:  raw.Snippet,
	}
	for _, h := range raw.Payload.Headers {
		switch strings.ToLower(h.Name) {
		case "subject":
			msg.Subject = h.Value
		case "to":
			msg.To = h.Value
		case "from":
			msg.From = h.Value
		case "in-reply-to":
			msg.InReplyTo = h.Value
		case "references":
			msg.References = h.Value
		}
	}
	if raw.InternalDate != "" {
		var ms int64
		if _, err := fmt.Sscan(raw.InternalDate, &ms); err == nil {
			msg.InternalDate = time.UnixMilli(ms).UTC()
		}
	}
	if msg.InternalDate.IsZero() {
		msg.InternalDate = time.Now().UTC()
	}
	return msg, nil
}

func gmailGet(ctx context.Context, client *http.Client, rawURL string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return err
	}
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("gmail api %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	return json.Unmarshal(body, dest)
}
