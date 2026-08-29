package handler

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"reachtrack/internal/auth"
	"reachtrack/internal/model"
	"reachtrack/internal/store"
)

func (a *API) gmailConfigured(w http.ResponseWriter) bool {
	if a.Gmail == nil || !a.Gmail.Configured() {
		writeError(w, http.StatusServiceUnavailable, "gmail oauth is not configured on the server")
		return false
	}
	return true
}

func (a *API) getGmailConnection(w http.ResponseWriter, r *http.Request) {
	if !a.gmailConfigured(w) {
		return
	}
	userID := auth.UserID(r.Context())
	conn, err := a.Store.GetActiveGmailConnection(r.Context(), userID)
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, http.StatusOK, model.GmailConnectionStatus{Connected: false})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load gmail connection")
		return
	}
	writeJSON(w, http.StatusOK, model.GmailConnectionStatus{
		Connected:   true,
		Email:       conn.GoogleEmail,
		ConnectedAt: &conn.ConnectedAt,
		Scopes:      conn.Scopes,
	})
}

func (a *API) gmailAuthorize(w http.ResponseWriter, r *http.Request) {
	if !a.gmailConfigured(w) {
		return
	}
	userID := auth.UserID(r.Context())
	url, err := a.Gmail.AuthorizationURL(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build authorization url")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"authorizationUrl": url})
}

func (a *API) gmailCallback(w http.ResponseWriter, r *http.Request) {
	if a.Gmail == nil || !a.Gmail.Configured() {
		http.Error(w, "gmail oauth is not configured", http.StatusServiceUnavailable)
		return
	}
	q := r.URL.Query()
	if errMsg := q.Get("error"); errMsg != "" {
		http.Redirect(w, r, a.Gmail.ProfileRedirect("?gmail=denied"), http.StatusFound)
		return
	}
	code := strings.TrimSpace(q.Get("code"))
	state := strings.TrimSpace(q.Get("state"))
	if code == "" || state == "" {
		http.Redirect(w, r, a.Gmail.ProfileRedirect("?gmail=error"), http.StatusFound)
		return
	}
	userID, err := a.Gmail.ParseState(state)
	if err != nil {
		http.Redirect(w, r, a.Gmail.ProfileRedirect("?gmail=error"), http.StatusFound)
		return
	}

	ctx := r.Context()
	tokens, err := a.Gmail.Exchange(ctx, code)
	if err != nil {
		http.Redirect(w, r, a.Gmail.ProfileRedirect("?gmail=error"), http.StatusFound)
		return
	}
	email, err := a.Gmail.FetchEmail(ctx, tokens.AccessToken)
	if err != nil {
		http.Redirect(w, r, a.Gmail.ProfileRedirect("?gmail=error"), http.StatusFound)
		return
	}
	if _, err := a.Store.UpsertGmailConnection(ctx, userID, email, tokens.AccessToken, tokens.RefreshToken, tokens.Scopes, tokens.ExpiresAt); err != nil {
		http.Redirect(w, r, a.Gmail.ProfileRedirect("?gmail=error"), http.StatusFound)
		return
	}
	http.Redirect(w, r, a.Gmail.ProfileRedirect("?gmail=connected"), http.StatusFound)
}

func (a *API) deleteGmailConnection(w http.ResponseWriter, r *http.Request) {
	if !a.gmailConfigured(w) {
		return
	}
	userID := auth.UserID(r.Context())
	conn, err := a.Store.RevokeGmailConnection(r.Context(), userID)
	if errors.Is(err, store.ErrNotFound) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to disconnect gmail")
		return
	}
	_ = a.Gmail.Revoke(context.Background(), conn.RefreshToken)
	w.WriteHeader(http.StatusNoContent)
}
