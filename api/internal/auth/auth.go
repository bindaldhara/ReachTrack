package auth

import (
	"context"
	"fmt"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type ctxKey struct{}

type Claims struct {
	jwt.RegisteredClaims
	Email string `json:"email"`
	Role  string `json:"role"`
}

// Verifier validates Supabase access tokens against the project's published
// JWKS. Supabase signs with asymmetric keys (ES256 by default, RS256 for RSA
// projects) and rotates them, so keys are fetched and refreshed at runtime.
type Verifier struct {
	keyfunc jwt.Keyfunc
}

func NewVerifier(jwksURL string) (*Verifier, error) {
	k, err := keyfunc.NewDefault([]string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("load jwks from %s: %w", jwksURL, err)
	}
	return &Verifier{keyfunc: k.Keyfunc}, nil
}

func (v *Verifier) ParseToken(tokenString string) (uuid.UUID, string, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, v.keyfunc,
		jwt.WithValidMethods([]string{"ES256", "RS256"}))
	if err != nil {
		return uuid.Nil, "", err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return uuid.Nil, "", fmt.Errorf("invalid token")
	}
	if claims.Role != "" && claims.Role != "authenticated" {
		return uuid.Nil, "", fmt.Errorf("unexpected role %q", claims.Role)
	}
	userID, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("invalid subject")
	}
	return userID, claims.Email, nil
}

func WithUser(ctx context.Context, userID uuid.UUID, email string) context.Context {
	return context.WithValue(ctx, ctxKey{}, identity{UserID: userID, Email: email})
}

type identity struct {
	UserID uuid.UUID
	Email  string
}

func UserID(ctx context.Context) uuid.UUID {
	if v, ok := ctx.Value(ctxKey{}).(identity); ok {
		return v.UserID
	}
	return uuid.Nil
}

func Email(ctx context.Context) string {
	if v, ok := ctx.Value(ctxKey{}).(identity); ok {
		return v.Email
	}
	return ""
}

func Bearer(header string) string {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix))
}
