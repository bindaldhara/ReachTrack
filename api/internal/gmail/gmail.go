package gmail

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

var ErrNotConfigured = errors.New("gmail oauth is not configured")

const (
	scopeReadonly = "https://www.googleapis.com/auth/gmail.readonly"
	scopeEmail    = "https://www.googleapis.com/auth/userinfo.email"
)

type Service struct {
	oauth       *oauth2.Config
	stateSecret []byte
	webAppURL   string
	httpClient  *http.Client
}

type statePayload struct {
	UserID    string `json:"userId"`
	ExpiresAt int64  `json:"exp"`
	Nonce     string `json:"nonce"`
}

type TokenSet struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
	Scopes       string
}

func New(clientID, clientSecret, redirectURI, webAppURL, stateSecret string) (*Service, error) {
	clientID = strings.TrimSpace(clientID)
	clientSecret = strings.TrimSpace(clientSecret)
	redirectURI = strings.TrimSpace(redirectURI)
	if clientID == "" || clientSecret == "" || redirectURI == "" {
		return nil, ErrNotConfigured
	}
	secret := strings.TrimSpace(stateSecret)
	if secret == "" {
		secret = clientSecret
	}
	web := strings.TrimRight(strings.TrimSpace(webAppURL), "/")
	if web == "" {
		web = "http://localhost:5173"
	}
	return &Service{
		oauth: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURI,
			Scopes:       []string{scopeReadonly, scopeEmail},
			Endpoint:     google.Endpoint,
		},
		stateSecret: []byte(secret),
		webAppURL:   web,
		httpClient:  &http.Client{Timeout: 30 * time.Second},
	}, nil
}

func (s *Service) oauthContext(ctx context.Context) context.Context {
	return context.WithValue(ctx, oauth2.HTTPClient, s.httpClient)
}

func (s *Service) Configured() bool {
	return s != nil && s.oauth != nil
}

func (s *Service) WebAppURL() string {
	return s.webAppURL
}

func (s *Service) AuthorizationURL(userID uuid.UUID) (string, error) {
	state, err := s.signState(userID)
	if err != nil {
		return "", err
	}
	return s.oauth.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce), nil
}

func (s *Service) Exchange(ctx context.Context, code string) (TokenSet, error) {
	tok, err := s.oauth.Exchange(ctx, code)
	if err != nil {
		return TokenSet{}, fmt.Errorf("exchange code: %w", err)
	}
	refresh := tok.RefreshToken
	if refresh == "" {
		return TokenSet{}, errors.New("google did not return a refresh token; revoke app access in Google Account settings and try again")
	}
	expiresAt := tok.Expiry
	if expiresAt.IsZero() {
		expiresAt = time.Now().Add(time.Hour)
	}
	return TokenSet{
		AccessToken:  tok.AccessToken,
		RefreshToken: refresh,
		ExpiresAt:    expiresAt,
		Scopes:       strings.Join(s.oauth.Scopes, " "),
	}, nil
}

func (s *Service) FetchEmail(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("userinfo: %s", strings.TrimSpace(string(body)))
	}
	var info struct {
		Email string `json:"email"`
	}
	if err := json.Unmarshal(body, &info); err != nil {
		return "", err
	}
	email := strings.TrimSpace(info.Email)
	if email == "" {
		return "", errors.New("google account has no email")
	}
	return email, nil
}

func (s *Service) Revoke(ctx context.Context, token string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil
	}
	form := url.Values{"token": {token}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/revoke", strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 1024))
		return fmt.Errorf("revoke token: %s", strings.TrimSpace(string(body)))
	}
	return nil
}

func (s *Service) ParseState(state string) (uuid.UUID, error) {
	parts := strings.Split(state, ".")
	if len(parts) != 2 {
		return uuid.Nil, errors.New("invalid oauth state")
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return uuid.Nil, errors.New("invalid oauth state")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return uuid.Nil, errors.New("invalid oauth state")
	}
	mac := hmac.New(sha256.New, s.stateSecret)
	mac.Write(payloadBytes)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return uuid.Nil, errors.New("invalid oauth state")
	}
	var payload statePayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return uuid.Nil, errors.New("invalid oauth state")
	}
	if time.Now().Unix() > payload.ExpiresAt {
		return uuid.Nil, errors.New("oauth state expired")
	}
	userID, err := uuid.Parse(payload.UserID)
	if err != nil {
		return uuid.Nil, errors.New("invalid oauth state")
	}
	return userID, nil
}

func (s *Service) signState(userID uuid.UUID) (string, error) {
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	payload := statePayload{
		UserID:    userID.String(),
		ExpiresAt: time.Now().Add(10 * time.Minute).Unix(),
		Nonce:     base64.RawURLEncoding.EncodeToString(nonce),
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, s.stateSecret)
	mac.Write(payloadBytes)
	return base64.RawURLEncoding.EncodeToString(payloadBytes) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func (s *Service) ProfileRedirect(query string) string {
	return s.webAppURL + "/profile" + query
}
