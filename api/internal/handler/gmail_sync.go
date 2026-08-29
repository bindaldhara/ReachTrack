package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"reachtrack/internal/auth"
	"reachtrack/internal/gmail"
	"reachtrack/internal/model"
	"reachtrack/internal/store"
)

type gmailSyncIn struct {
	Date string `json:"date"`
}

func (a *API) syncGmailSent(w http.ResponseWriter, r *http.Request) {
	if !a.gmailConfigured(w) {
		return
	}
	userID := auth.UserID(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Minute)
	defer cancel()

	conn, err := a.Store.GetActiveGmailConnection(ctx, userID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusBadRequest, "gmail is not connected")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load gmail connection")
		return
	}

	profile, err := a.Store.GetProfile(ctx, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load profile")
		return
	}
	loc := time.UTC
	if tz := strings.TrimSpace(profile.Timezone); tz != "" {
		if parsed, err := time.LoadLocation(tz); err == nil {
			loc = parsed
		}
	}

	var in gmailSyncIn
	decodeJSONOptional(r, &in)
	day, err := parseSyncDay(in.Date, loc)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	start, end := gmail.DayBounds(day, loc)
	slog.Info("gmail sync start", "user", userID, "date", day.Format("2006-01-02"))

	accessToken := conn.AccessToken
	refreshToken := conn.RefreshToken
	expiresAt := conn.TokenExpiresAt
	if time.Now().After(expiresAt.Add(-2 * time.Minute)) {
		slog.Info("gmail sync refreshing token", "user", userID)
		refreshed, err := a.Gmail.Refresh(ctx, refreshToken)
		if err != nil {
			slog.Error("gmail sync refresh", "user", userID, "err", err)
			writeError(w, http.StatusBadGateway, "failed to refresh gmail token; reconnect gmail")
			return
		}
		accessToken = refreshed.AccessToken
		refreshToken = refreshed.RefreshToken
		expiresAt = refreshed.ExpiresAt
		if err := a.Store.UpdateGmailTokens(ctx, conn.ID, accessToken, refreshToken, expiresAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save refreshed token")
			return
		}
	}

	messages, err := a.Gmail.ListSentMessages(ctx, accessToken, refreshToken, expiresAt, start, end)
	if err != nil {
		slog.Error("gmail sync fetch", "user", userID, "err", err)
		writeError(w, http.StatusBadGateway, fmt.Sprintf("failed to fetch gmail messages: %v", err))
		return
	}

	threadIDs := make([]string, 0, len(messages))
	seenThreads := map[string]bool{}
	for _, msg := range messages {
		if msg.ThreadID != "" && !seenThreads[msg.ThreadID] {
			seenThreads[msg.ThreadID] = true
			threadIDs = append(threadIDs, msg.ThreadID)
		}
	}
	threads, err := a.Gmail.FetchThreads(ctx, accessToken, refreshToken, expiresAt, threadIDs)
	if err != nil {
		slog.Error("gmail sync threads", "user", userID, "err", err)
		writeError(w, http.StatusBadGateway, fmt.Sprintf("failed to load gmail threads: %v", err))
		return
	}

	result := model.GmailSyncResult{
		Date:    day.Format("2006-01-02"),
		Fetched: len(messages),
		ByType:  map[string]int{},
	}
	for _, msg := range messages {
		extID := msg.ID
		body := strings.TrimSpace(msg.Snippet)
		if msg.To != "" {
			if body != "" {
				body = "To: " + msg.To + "\n\n" + body
			} else {
				body = "To: " + msg.To
			}
		}
		class := gmail.ClassifyMessage(msg, threads[msg.ThreadID], conn.GoogleEmail)
		inserted, err := a.Store.UpsertGmailOutreach(ctx, model.OutreachEvent{
			UserID:     userID,
			Type:       class.Type,
			Channel:    "gmail",
			Source:     "gmail",
			Status:     class.Status,
			Subject:    strings.TrimSpace(msg.Subject),
			Body:       body,
			ExternalID: &extID,
			OccurredAt: msg.InternalDate,
		})
		if err != nil {
			slog.Error("gmail sync import", "user", userID, "err", err)
			writeError(w, http.StatusInternalServerError, "failed to import outreach")
			return
		}
		result.ByType[class.Type]++
		if inserted {
			result.Imported++
		} else {
			result.Updated++
		}
	}

	slog.Info("gmail sync done", "user", userID, "fetched", result.Fetched, "imported", result.Imported, "updated", result.Updated)
	writeJSON(w, http.StatusOK, result)
}

func parseSyncDay(raw string, loc *time.Location) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "yesterday" {
		return gmail.YesterdayIn(loc), nil
	}
	t, err := time.ParseInLocation("2006-01-02", raw, loc)
	if err != nil {
		return time.Time{}, errors.New("date must be YYYY-MM-DD or yesterday")
	}
	return t, nil
}

func decodeJSONOptional(r *http.Request, dest any) {
	if r.Body == nil {
		return
	}
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	_ = dec.Decode(dest)
}
