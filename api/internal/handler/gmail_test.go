package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"reachtrack/internal/authtest"
	"reachtrack/internal/auth"
	"reachtrack/internal/gmail"
)

func TestGmailStatusNotConfigured(t *testing.T) {
	jwks := authtest.NewServer(t)
	verifier, err := auth.NewVerifier(jwks.JWKSURL)
	if err != nil {
		t.Fatal(err)
	}
	r := NewRouter(&API{Verifier: verifier}, "http://localhost:5173")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/integrations/gmail", nil)
	req.Header.Set("Authorization", "Bearer "+jwks.Sign(t, uuid.New(), "dev@example.com"))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rr.Code)
	}
}

func TestGmailAuthorizeReturnsURL(t *testing.T) {
	jwks := authtest.NewServer(t)
	verifier, err := auth.NewVerifier(jwks.JWKSURL)
	if err != nil {
		t.Fatal(err)
	}
	gmailSvc, err := gmail.New(
		"client-id",
		"client-secret",
		"http://localhost:8080/api/v1/integrations/gmail/callback",
		"http://localhost:5173",
		"state-secret",
	)
	if err != nil {
		t.Fatal(err)
	}
	r := NewRouter(&API{Verifier: verifier, Gmail: gmailSvc}, "http://localhost:5173")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/integrations/gmail/authorize", nil)
	req.Header.Set("Authorization", "Bearer "+jwks.Sign(t, uuid.New(), "dev@example.com"))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rr.Code, rr.Body.String())
	}
}
