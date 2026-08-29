package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DatabaseURL string
	SupabaseURL string
	CORSOrigin  string
	Gmail       GmailConfig
}

type GmailConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	WebAppURL    string
	StateSecret  string
}

func Load() (Config, error) {
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")

	cfg := Config{
		Port:        getenv("PORT", "8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		SupabaseURL: strings.TrimSuffix(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/"),
		CORSOrigin:  getenv("CORS_ORIGIN", "http://localhost:5173"),
		Gmail: GmailConfig{
			ClientID:     strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID")),
			ClientSecret: strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET")),
			RedirectURI:  getenv("GMAIL_REDIRECT_URI", "http://localhost:8080/api/v1/integrations/gmail/callback"),
			WebAppURL:    getenv("WEB_APP_URL", "http://localhost:5173"),
			StateSecret:  strings.TrimSpace(os.Getenv("OAUTH_STATE_SECRET")),
		},
	}
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.SupabaseURL == "" {
		return Config{}, fmt.Errorf("SUPABASE_URL is required")
	}
	return cfg, nil
}

// JWKSURL is where Supabase publishes the public keys for access tokens.
func (c Config) JWKSURL() string {
	return c.SupabaseURL + "/auth/v1/.well-known/jwks.json"
}

func getenv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
