package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"reachtrack/internal/authtest"
)

func TestParseTokenAcceptsProjectSignedToken(t *testing.T) {
	jwks := authtest.NewServer(t)
	verifier, err := NewVerifier(jwks.JWKSURL)
	if err != nil {
		t.Fatal(err)
	}
	userID := uuid.New()

	gotID, email, err := verifier.ParseToken(jwks.Sign(t, userID, "dev@example.com"))
	if err != nil {
		t.Fatal(err)
	}
	if gotID != userID {
		t.Errorf("user id = %s, want %s", gotID, userID)
	}
	if email != "dev@example.com" {
		t.Errorf("email = %s, want dev@example.com", email)
	}
}

// A token from a different project must not authenticate a user here.
func TestParseTokenRejectsForeignKey(t *testing.T) {
	ours := authtest.NewServer(t)
	theirs := authtest.NewServer(t)
	verifier, err := NewVerifier(ours.JWKSURL)
	if err != nil {
		t.Fatal(err)
	}

	if _, _, err := verifier.ParseToken(theirs.Sign(t, uuid.New(), "attacker@example.com")); err == nil {
		t.Fatal("token signed by another key was accepted")
	}
}

// Guards against algorithm confusion: an HS256 token must not be verified with
// the EC public key material published in the JWKS.
func TestParseTokenRejectsSymmetricAlgorithm(t *testing.T) {
	jwks := authtest.NewServer(t)
	verifier, err := NewVerifier(jwks.JWKSURL)
	if err != nil {
		t.Fatal(err)
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  uuid.NewString(),
		"role": "authenticated",
		"exp":  time.Now().Add(time.Hour).Unix(),
	})
	token.Header["kid"] = "authtest-key"
	signed, err := token.SignedString([]byte("secret"))
	if err != nil {
		t.Fatal(err)
	}

	if _, _, err := verifier.ParseToken(signed); err == nil {
		t.Fatal("HS256 token was accepted")
	}
}

func TestParseTokenRejectsExpiredToken(t *testing.T) {
	jwks := authtest.NewServer(t)
	verifier, err := NewVerifier(jwks.JWKSURL)
	if err != nil {
		t.Fatal(err)
	}
	expired := jwks.SignClaims(t, jwt.MapClaims{
		"sub":  uuid.NewString(),
		"role": "authenticated",
		"exp":  time.Now().Add(-time.Minute).Unix(),
	})

	if _, _, err := verifier.ParseToken(expired); err == nil {
		t.Fatal("expired token was accepted")
	}
}

// service_role tokens bypass RLS, so they must not stand in for an end user.
func TestParseTokenRejectsNonUserRole(t *testing.T) {
	jwks := authtest.NewServer(t)
	verifier, err := NewVerifier(jwks.JWKSURL)
	if err != nil {
		t.Fatal(err)
	}
	elevated := jwks.SignClaims(t, jwt.MapClaims{
		"sub":  uuid.NewString(),
		"role": "service_role",
		"exp":  time.Now().Add(time.Hour).Unix(),
	})

	if _, _, err := verifier.ParseToken(elevated); err == nil {
		t.Fatal("service_role token was accepted as a user")
	}
}

func TestBearer(t *testing.T) {
	if Bearer("Bearer abc") != "abc" {
		t.Error("expected token from bearer header")
	}
	if Bearer("abc") != "" {
		t.Error("expected empty string without bearer prefix")
	}
}
