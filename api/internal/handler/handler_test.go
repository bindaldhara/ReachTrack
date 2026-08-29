package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"reachtrack/internal/auth"
	"reachtrack/internal/authtest"
)

func TestHealth(t *testing.T) {
	r := NewRouter(&API{}, "http://localhost:5173")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/health", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
}

// Handlers scope every query to the caller, so the middleware must put the
// token's user in the request context.
func TestRequireAuthInjectsUser(t *testing.T) {
	jwks := authtest.NewServer(t)
	verifier, err := auth.NewVerifier(jwks.JWKSURL)
	if err != nil {
		t.Fatal(err)
	}
	api := &API{Verifier: verifier}
	userID := uuid.New()

	var gotID uuid.UUID
	var gotEmail string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = auth.UserID(r.Context())
		gotEmail = auth.Email(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/stats", nil)
	req.Header.Set("Authorization", "Bearer "+jwks.Sign(t, userID, "dev@example.com"))
	rr := httptest.NewRecorder()
	api.requireAuth(next).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if gotID != userID {
		t.Errorf("context user id = %s, want %s", gotID, userID)
	}
	if gotEmail != "dev@example.com" {
		t.Errorf("context email = %s, want dev@example.com", gotEmail)
	}
}

func TestRequireAuthRejectsBadTokens(t *testing.T) {
	jwks := authtest.NewServer(t)
	verifier, err := auth.NewVerifier(jwks.JWKSURL)
	if err != nil {
		t.Fatal(err)
	}
	api := &API{Verifier: verifier}
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("handler ran for an unauthenticated request")
	})

	for name, header := range map[string]string{
		"missing":    "",
		"not bearer": "abc",
		"garbage":    "Bearer not-a-jwt",
	} {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/stats", nil)
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		rr := httptest.NewRecorder()
		api.requireAuth(next).ServeHTTP(rr, req)
		if rr.Code != http.StatusUnauthorized {
			t.Errorf("%s: status = %d, want 401", name, rr.Code)
		}
	}
}

func TestCompanyValidation(t *testing.T) {
	in := companyIn{Name: "  "}
	if _, err := in.toModel(uuid.New()); err == nil {
		t.Fatal("expected name required")
	}
}

func TestOutreachValidation(t *testing.T) {
	in := outreachIn{Status: "nope"}
	if _, err := in.toModel(uuid.New()); err == nil {
		t.Fatal("expected invalid status")
	}
	in = outreachIn{Type: "cold_email", Channel: "gmail", Status: "sent"}
	e, err := in.toModel(uuid.New())
	if err != nil {
		t.Fatal(err)
	}
	if e.Source != "manual" {
		t.Fatalf("source = %s, want manual", e.Source)
	}
}

func TestJSONErrorShape(t *testing.T) {
	rr := httptest.NewRecorder()
	writeError(rr, http.StatusBadRequest, "invalid json")
	var body map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["error"] != "invalid json" {
		t.Fatalf("body = %v", body)
	}
}
