package store

import (
	"context"

	"github.com/jackc/pgx/v5"

	"reachtrack/internal/model"
)

// UpsertGmailOutreach inserts or updates classification fields for a Gmail import.
// Returns inserted=true when a new row was created.
func (s *Store) UpsertGmailOutreach(ctx context.Context, e model.OutreachEvent) (bool, error) {
	rows, err := s.pool.Query(ctx, `
		insert into outreach_events (
		  user_id, conversation_id, contact_id, company_id, job_id, type, channel, source, status,
		  subject, body, external_id, occurred_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		on conflict (user_id, source, external_id)
		  where external_id is not null and external_id <> ''
		do update set
		  type = excluded.type,
		  status = excluded.status,
		  subject = excluded.subject,
		  body = excluded.body,
		  occurred_at = excluded.occurred_at
		returning (xmax = 0) as inserted`,
		e.UserID, e.ConversationID, e.ContactID, e.CompanyID, e.JobID, e.Type, e.Channel, e.Source, e.Status,
		e.Subject, e.Body, e.ExternalID, e.OccurredAt)
	if err != nil {
		return false, err
	}
	inserted, err := pgx.CollectOneRow(rows, pgx.RowTo[bool])
	return inserted, err
}
