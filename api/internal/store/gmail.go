package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"reachtrack/internal/model"
)

func (s *Store) GetActiveGmailConnection(ctx context.Context, userID uuid.UUID) (model.GmailConnection, error) {
	return queryOne[model.GmailConnection](ctx, s.pool, `
		select id, user_id, google_email, access_token, refresh_token, token_expires_at,
		       scopes, connected_at, revoked_at, created_at, updated_at
		from gmail_connections
		where user_id = $1 and revoked_at is null
		order by connected_at desc
		limit 1`, userID)
}

func (s *Store) UpsertGmailConnection(
	ctx context.Context,
	userID uuid.UUID,
	googleEmail, accessToken, refreshToken, scopes string,
	tokenExpiresAt time.Time,
) (model.GmailConnection, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return model.GmailConnection{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		update gmail_connections
		set revoked_at = now()
		where user_id = $1 and revoked_at is null`, userID); err != nil {
		return model.GmailConnection{}, err
	}

	rows, err := tx.Query(ctx, `
		insert into gmail_connections (
		  user_id, google_email, access_token, refresh_token, token_expires_at, scopes
		) values ($1, $2, $3, $4, $5, $6)
		returning id, user_id, google_email, access_token, refresh_token, token_expires_at,
		          scopes, connected_at, revoked_at, created_at, updated_at`,
		userID, googleEmail, accessToken, refreshToken, tokenExpiresAt, scopes)
	if err != nil {
		return model.GmailConnection{}, err
	}
	conn, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[model.GmailConnection])
	if err != nil {
		return model.GmailConnection{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return model.GmailConnection{}, err
	}
	return conn, nil
}

func (s *Store) RevokeGmailConnection(ctx context.Context, userID uuid.UUID) (model.GmailConnection, error) {
	return queryOne[model.GmailConnection](ctx, s.pool, `
		update gmail_connections
		set revoked_at = now()
		where user_id = $1 and revoked_at is null
		returning id, user_id, google_email, access_token, refresh_token, token_expires_at,
		          scopes, connected_at, revoked_at, created_at, updated_at`, userID)
}

func (s *Store) UpdateGmailTokens(ctx context.Context, id uuid.UUID, accessToken, refreshToken string, tokenExpiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `
		update gmail_connections
		set access_token = $2, refresh_token = $3, token_expires_at = $4
		where id = $1 and revoked_at is null`,
		id, accessToken, refreshToken, tokenExpiresAt)
	return err
}

