package gmail

import (
	"testing"

	"github.com/google/uuid"
)

func TestStateRoundTrip(t *testing.T) {
	svc, err := New("client-id", "client-secret", "http://localhost:8080/callback", "http://localhost:5173", "state-secret")
	if err != nil {
		t.Fatal(err)
	}
	userID := uuid.New()
	state, err := svc.signState(userID)
	if err != nil {
		t.Fatal(err)
	}
	got, err := svc.ParseState(state)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got != userID {
		t.Fatalf("user id = %s, want %s", got, userID)
	}
}

func TestParseStateRejectsTampering(t *testing.T) {
	svc, err := New("client-id", "client-secret", "http://localhost:8080/callback", "http://localhost:5173", "state-secret")
	if err != nil {
		t.Fatal(err)
	}
	state, err := svc.signState(uuid.New())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ParseState(state + "x"); err == nil {
		t.Fatal("expected tampered state to fail")
	}
}

func TestParseStateRejectsInvalid(t *testing.T) {
	if _, err := New("", "", "", "", ""); err != ErrNotConfigured {
		t.Fatalf("err = %v, want ErrNotConfigured", err)
	}
	svc, err := New("client-id", "client-secret", "http://localhost:8080/callback", "http://localhost:5173", "state-secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ParseState("bad.state"); err == nil {
		t.Fatal("expected invalid state")
	}
}
