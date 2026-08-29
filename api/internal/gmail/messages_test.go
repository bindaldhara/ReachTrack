package gmail

import (
	"testing"
	"time"
)

func TestSentQuery(t *testing.T) {
	loc := time.UTC
	start, end := DayBounds(time.Date(2026, 8, 28, 15, 0, 0, 0, loc), loc)
	got := sentQuery(start, end)
	want := "in:sent after:2026/08/28 before:2026/08/29"
	if got != want {
		t.Fatalf("query = %q, want %q", got, want)
	}
}

func TestYesterdayIn(t *testing.T) {
	loc := time.FixedZone("IST", 5*3600+30*60)
	// Aug 29 2026 10:00 IST -> yesterday Aug 28
	fixed := time.Date(2026, 8, 29, 10, 0, 0, 0, loc)
	y := fixed.AddDate(0, 0, -1)
	y = time.Date(y.Year(), y.Month(), y.Day(), 0, 0, 0, 0, loc)
	if y.Day() != 28 || y.Month() != time.August {
		t.Fatalf("unexpected yesterday: %v", y)
	}
}
