package model

import "testing"

func TestValidStatus(t *testing.T) {
	want := []string{"sent", "waiting", "replied", "follow_up_due", "interview", "rejected", "closed"}
	if len(Statuses) != len(want) {
		t.Fatalf("Statuses length = %d, want %d", len(Statuses), len(want))
	}
	for _, s := range want {
		if !ValidStatus(s) {
			t.Errorf("ValidStatus(%q) = false, want true", s)
		}
	}
	if ValidStatus("open") {
		t.Error("ValidStatus(open) = true, want false")
	}
}

func TestRequireStatus(t *testing.T) {
	got, err := RequireStatus("", StatusSent)
	if err != nil || got != StatusSent {
		t.Fatalf("empty status: got %q err %v", got, err)
	}
	if _, err := RequireStatus("nope", StatusSent); err == nil {
		t.Fatal("expected error for invalid status")
	}
}
