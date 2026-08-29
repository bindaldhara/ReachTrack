// Package authtest serves a JWKS and signs matching tokens so tests can
// exercise the same asymmetric verification path Supabase Auth uses.
package authtest

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const keyID = "authtest-key"

type Server struct {
	JWKSURL string
	key     *ecdsa.PrivateKey
}

// NewServer starts a JWKS endpoint backed by a fresh ES256 key.
func NewServer(t *testing.T) *Server {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	body, err := json.Marshal(map[string]any{
		"keys": []map[string]string{{
			"kty": "EC",
			"crv": "P-256",
			"alg": "ES256",
			"use": "sig",
			"kid": keyID,
			"x":   coordinate(key.PublicKey.X.Bytes()),
			"y":   coordinate(key.PublicKey.Y.Bytes()),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return &Server{JWKSURL: srv.URL, key: key}
}

// Sign issues a token shaped like a Supabase access token.
func (s *Server) Sign(t *testing.T, userID uuid.UUID, email string) string {
	t.Helper()
	return s.SignClaims(t, jwt.MapClaims{
		"sub":   userID.String(),
		"email": email,
		"role":  "authenticated",
		"aud":   "authenticated",
		"iat":   time.Now().Unix(),
		"exp":   time.Now().Add(time.Hour).Unix(),
	})
}

func (s *Server) SignClaims(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	token.Header["kid"] = keyID
	signed, err := token.SignedString(s.key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

// coordinate left-pads an EC point to the 32 bytes P-256 JWKs require.
func coordinate(b []byte) string {
	padded := make([]byte, 32)
	copy(padded[32-len(b):], b)
	return base64.RawURLEncoding.EncodeToString(padded)
}
