package store

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"reachtrack/internal/model"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 10
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

func collect[T any](rows pgx.Rows, err error) ([]T, error) {
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[T])
}

func queryOne[T any](ctx context.Context, pool *pgxpool.Pool, sql string, args ...any) (T, error) {
	var zero T
	rows, err := pool.Query(ctx, sql, args...)
	if err != nil {
		return zero, err
	}
	v, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[T])
	if errors.Is(err, pgx.ErrNoRows) {
		return zero, ErrNotFound
	}
	return v, err
}

func clampLimit(limit int) int {
	if limit <= 0 {
		return 50
	}
	if limit > 200 {
		return 200
	}
	return limit
}

func likeQuery(q string) string {
	q = strings.TrimSpace(q)
	if q == "" {
		return ""
	}
	return "%" + strings.ReplaceAll(q, "%", "\\%") + "%"
}

func countsToMap(rows pgx.Rows, err error) (map[string]int, int, error) {
	out := map[string]int{}
	for _, s := range model.Statuses {
		out[s] = 0
	}
	if err != nil {
		return out, 0, err
	}
	defer rows.Close()
	total := 0
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			return out, 0, err
		}
		out[status] = n
		total += n
	}
	return out, total, rows.Err()
}

func (s *Store) EnsureProfile(ctx context.Context, userID uuid.UUID, email, fullName string) (model.Profile, error) {
	const q = `
		insert into profiles (id, email, full_name)
		values ($1, $2, $3)
		on conflict (id) do update
		  set email = excluded.email,
		      full_name = case
		        when profiles.full_name = '' then excluded.full_name
		        else profiles.full_name
		      end
		returning id, email, full_name, timezone, created_at, updated_at`
	return queryOne[model.Profile](ctx, s.pool, q, userID, email, fullName)
}

func (s *Store) GetProfile(ctx context.Context, userID uuid.UUID) (model.Profile, error) {
	return queryOne[model.Profile](ctx, s.pool, `
		select id, email, full_name, timezone, created_at, updated_at
		from profiles where id = $1`, userID)
}

func (s *Store) UpdateProfile(ctx context.Context, userID uuid.UUID, fullName, timezone *string) (model.Profile, error) {
	return queryOne[model.Profile](ctx, s.pool, `
		update profiles
		set
		  full_name = coalesce($2, full_name),
		  timezone = coalesce($3, timezone)
		where id = $1
		returning id, email, full_name, timezone, created_at, updated_at`,
		userID, fullName, timezone)
}

func (s *Store) Stats(ctx context.Context, userID uuid.UUID) (model.Stats, error) {
	var stats model.Stats
	rows, err := s.pool.Query(ctx, `
		select status, count(*)::int from outreach_events where user_id = $1 group by status`, userID)
	stats.OutreachByStatus, stats.TotalOutreach, err = countsToMap(rows, err)
	if err != nil {
		return stats, err
	}
	rows, err = s.pool.Query(ctx, `
		select status, count(*)::int from conversations where user_id = $1 group by status`, userID)
	stats.ConversationsByStatus, _, err = countsToMap(rows, err)
	if err != nil {
		return stats, err
	}
	rows, err = s.pool.Query(ctx, `
		select status, count(*)::int from jobs where user_id = $1 group by status`, userID)
	stats.JobsByStatus, _, err = countsToMap(rows, err)
	if err != nil {
		return stats, err
	}
	if err := s.pool.QueryRow(ctx, `
		select count(*)::int from reminders where user_id = $1 and completed_at is null`, userID).
		Scan(&stats.OpenReminders); err != nil {
		return stats, err
	}
	if err := s.pool.QueryRow(ctx, `select count(*)::int from contacts where user_id = $1`, userID).
		Scan(&stats.TotalContacts); err != nil {
		return stats, err
	}
	if err := s.pool.QueryRow(ctx, `select count(*)::int from companies where user_id = $1`, userID).
		Scan(&stats.TotalCompanies); err != nil {
		return stats, err
	}
	return stats, nil
}

func (s *Store) ListCompanies(ctx context.Context, userID uuid.UUID, q string, limit int) ([]model.Company, error) {
	like := likeQuery(q)
	return collect[model.Company](s.pool.Query(ctx, `
		select id, user_id, name, domain, website, linkedin_url, notes, created_at, updated_at
		from companies
		where user_id = $1
		  and ($2 = '' or name ilike $2 or coalesce(domain, '') ilike $2)
		order by name asc
		limit $3`, userID, like, clampLimit(limit)))
}

func (s *Store) GetCompany(ctx context.Context, userID, id uuid.UUID) (model.Company, error) {
	return queryOne[model.Company](ctx, s.pool, `
		select id, user_id, name, domain, website, linkedin_url, notes, created_at, updated_at
		from companies where id = $1 and user_id = $2`, id, userID)
}

func (s *Store) CreateCompany(ctx context.Context, c model.Company) (model.Company, error) {
	return queryOne[model.Company](ctx, s.pool, `
		insert into companies (user_id, name, domain, website, linkedin_url, notes)
		values ($1, $2, $3, $4, $5, $6)
		returning id, user_id, name, domain, website, linkedin_url, notes, created_at, updated_at`,
		c.UserID, c.Name, c.Domain, c.Website, c.LinkedinURL, c.Notes)
}

func (s *Store) UpdateCompany(ctx context.Context, c model.Company) (model.Company, error) {
	return queryOne[model.Company](ctx, s.pool, `
		update companies
		set name = $3, domain = $4, website = $5, linkedin_url = $6, notes = $7
		where id = $1 and user_id = $2
		returning id, user_id, name, domain, website, linkedin_url, notes, created_at, updated_at`,
		c.ID, c.UserID, c.Name, c.Domain, c.Website, c.LinkedinURL, c.Notes)
}

func (s *Store) DeleteCompany(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from companies where id = $1 and user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListContacts(ctx context.Context, userID uuid.UUID, q string, limit int) ([]model.Contact, error) {
	like := likeQuery(q)
	return collect[model.Contact](s.pool.Query(ctx, `
		select id, user_id, company_id, first_name, last_name, email, linkedin_url, title, notes, created_at, updated_at
		from contacts
		where user_id = $1
		  and ($2 = '' or first_name ilike $2 or last_name ilike $2 or coalesce(email, '') ilike $2 or title ilike $2)
		order by last_name, first_name
		limit $3`, userID, like, clampLimit(limit)))
}

func (s *Store) GetContact(ctx context.Context, userID, id uuid.UUID) (model.Contact, error) {
	return queryOne[model.Contact](ctx, s.pool, `
		select id, user_id, company_id, first_name, last_name, email, linkedin_url, title, notes, created_at, updated_at
		from contacts where id = $1 and user_id = $2`, id, userID)
}

func (s *Store) CreateContact(ctx context.Context, c model.Contact) (model.Contact, error) {
	return queryOne[model.Contact](ctx, s.pool, `
		insert into contacts (user_id, company_id, first_name, last_name, email, linkedin_url, title, notes)
		values ($1, $2, $3, $4, $5, $6, $7, $8)
		returning id, user_id, company_id, first_name, last_name, email, linkedin_url, title, notes, created_at, updated_at`,
		c.UserID, c.CompanyID, c.FirstName, c.LastName, c.Email, c.LinkedinURL, c.Title, c.Notes)
}

func (s *Store) UpdateContact(ctx context.Context, c model.Contact) (model.Contact, error) {
	return queryOne[model.Contact](ctx, s.pool, `
		update contacts
		set company_id = $3, first_name = $4, last_name = $5, email = $6, linkedin_url = $7, title = $8, notes = $9
		where id = $1 and user_id = $2
		returning id, user_id, company_id, first_name, last_name, email, linkedin_url, title, notes, created_at, updated_at`,
		c.ID, c.UserID, c.CompanyID, c.FirstName, c.LastName, c.Email, c.LinkedinURL, c.Title, c.Notes)
}

func (s *Store) DeleteContact(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from contacts where id = $1 and user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListJobs(ctx context.Context, userID uuid.UUID, status, q string, limit int) ([]model.Job, error) {
	like := likeQuery(q)
	return collect[model.Job](s.pool.Query(ctx, `
		select id, user_id, company_id, title, url, location, status, notes, created_at, updated_at
		from jobs
		where user_id = $1
		  and ($2 = '' or status = $2)
		  and ($3 = '' or title ilike $3 or location ilike $3)
		order by updated_at desc
		limit $4`, userID, status, like, clampLimit(limit)))
}

func (s *Store) GetJob(ctx context.Context, userID, id uuid.UUID) (model.Job, error) {
	return queryOne[model.Job](ctx, s.pool, `
		select id, user_id, company_id, title, url, location, status, notes, created_at, updated_at
		from jobs where id = $1 and user_id = $2`, id, userID)
}

func (s *Store) CreateJob(ctx context.Context, j model.Job) (model.Job, error) {
	return queryOne[model.Job](ctx, s.pool, `
		insert into jobs (user_id, company_id, title, url, location, status, notes)
		values ($1, $2, $3, $4, $5, $6, $7)
		returning id, user_id, company_id, title, url, location, status, notes, created_at, updated_at`,
		j.UserID, j.CompanyID, j.Title, j.URL, j.Location, j.Status, j.Notes)
}

func (s *Store) UpdateJob(ctx context.Context, j model.Job) (model.Job, error) {
	return queryOne[model.Job](ctx, s.pool, `
		update jobs
		set company_id = $3, title = $4, url = $5, location = $6, status = $7, notes = $8
		where id = $1 and user_id = $2
		returning id, user_id, company_id, title, url, location, status, notes, created_at, updated_at`,
		j.ID, j.UserID, j.CompanyID, j.Title, j.URL, j.Location, j.Status, j.Notes)
}

func (s *Store) DeleteJob(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from jobs where id = $1 and user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListConversations(ctx context.Context, userID uuid.UUID, status, q string, limit int) ([]model.Conversation, error) {
	like := likeQuery(q)
	return collect[model.Conversation](s.pool.Query(ctx, `
		select id, user_id, contact_id, company_id, job_id, channel, subject, status, last_event_at, created_at, updated_at
		from conversations
		where user_id = $1
		  and ($2 = '' or status = $2)
		  and ($3 = '' or subject ilike $3)
		order by coalesce(last_event_at, updated_at) desc
		limit $4`, userID, status, like, clampLimit(limit)))
}

func (s *Store) GetConversation(ctx context.Context, userID, id uuid.UUID) (model.Conversation, error) {
	return queryOne[model.Conversation](ctx, s.pool, `
		select id, user_id, contact_id, company_id, job_id, channel, subject, status, last_event_at, created_at, updated_at
		from conversations where id = $1 and user_id = $2`, id, userID)
}

func (s *Store) CreateConversation(ctx context.Context, c model.Conversation) (model.Conversation, error) {
	return queryOne[model.Conversation](ctx, s.pool, `
		insert into conversations (user_id, contact_id, company_id, job_id, channel, subject, status)
		values ($1, $2, $3, $4, $5, $6, $7)
		returning id, user_id, contact_id, company_id, job_id, channel, subject, status, last_event_at, created_at, updated_at`,
		c.UserID, c.ContactID, c.CompanyID, c.JobID, c.Channel, c.Subject, c.Status)
}

func (s *Store) UpdateConversation(ctx context.Context, c model.Conversation) (model.Conversation, error) {
	return queryOne[model.Conversation](ctx, s.pool, `
		update conversations
		set contact_id = $3, company_id = $4, job_id = $5, channel = $6, subject = $7, status = $8
		where id = $1 and user_id = $2
		returning id, user_id, contact_id, company_id, job_id, channel, subject, status, last_event_at, created_at, updated_at`,
		c.ID, c.UserID, c.ContactID, c.CompanyID, c.JobID, c.Channel, c.Subject, c.Status)
}

func (s *Store) DeleteConversation(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from conversations where id = $1 and user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListOutreach(ctx context.Context, userID uuid.UUID, status, eventType, q string, limit int) ([]model.OutreachEvent, error) {
	like := likeQuery(q)
	return collect[model.OutreachEvent](s.pool.Query(ctx, `
		select id, user_id, conversation_id, contact_id, company_id, job_id, type, channel, source, status,
		       subject, body, external_id, occurred_at, created_at, updated_at
		from outreach_events
		where user_id = $1
		  and ($2 = '' or status = $2)
		  and ($3 = '' or type = $3)
		  and ($4 = '' or subject ilike $4 or body ilike $4)
		order by occurred_at desc
		limit $5`, userID, status, eventType, like, clampLimit(limit)))
}

func (s *Store) GetOutreach(ctx context.Context, userID, id uuid.UUID) (model.OutreachEvent, error) {
	return queryOne[model.OutreachEvent](ctx, s.pool, `
		select id, user_id, conversation_id, contact_id, company_id, job_id, type, channel, source, status,
		       subject, body, external_id, occurred_at, created_at, updated_at
		from outreach_events where id = $1 and user_id = $2`, id, userID)
}

func (s *Store) CreateOutreach(ctx context.Context, e model.OutreachEvent) (model.OutreachEvent, error) {
	return queryOne[model.OutreachEvent](ctx, s.pool, `
		insert into outreach_events (
		  user_id, conversation_id, contact_id, company_id, job_id, type, channel, source, status,
		  subject, body, external_id, occurred_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		returning id, user_id, conversation_id, contact_id, company_id, job_id, type, channel, source, status,
		          subject, body, external_id, occurred_at, created_at, updated_at`,
		e.UserID, e.ConversationID, e.ContactID, e.CompanyID, e.JobID, e.Type, e.Channel, e.Source, e.Status,
		e.Subject, e.Body, e.ExternalID, e.OccurredAt)
}

func (s *Store) UpdateOutreach(ctx context.Context, e model.OutreachEvent) (model.OutreachEvent, error) {
	return queryOne[model.OutreachEvent](ctx, s.pool, `
		update outreach_events
		set conversation_id = $3, contact_id = $4, company_id = $5, job_id = $6,
		    type = $7, channel = $8, source = $9, status = $10, subject = $11, body = $12, occurred_at = $13
		where id = $1 and user_id = $2
		returning id, user_id, conversation_id, contact_id, company_id, job_id, type, channel, source, status,
		          subject, body, external_id, occurred_at, created_at, updated_at`,
		e.ID, e.UserID, e.ConversationID, e.ContactID, e.CompanyID, e.JobID,
		e.Type, e.Channel, e.Source, e.Status, e.Subject, e.Body, e.OccurredAt)
}

func (s *Store) DeleteOutreach(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from outreach_events where id = $1 and user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListReminders(ctx context.Context, userID uuid.UUID, openOnly bool, limit int) ([]model.Reminder, error) {
	return collect[model.Reminder](s.pool.Query(ctx, `
		select id, user_id, outreach_event_id, conversation_id, kind, due_at, notes, completed_at, created_at, updated_at
		from reminders
		where user_id = $1
		  and ($2 = false or completed_at is null)
		order by due_at asc
		limit $3`, userID, openOnly, clampLimit(limit)))
}

func (s *Store) GetReminder(ctx context.Context, userID, id uuid.UUID) (model.Reminder, error) {
	return queryOne[model.Reminder](ctx, s.pool, `
		select id, user_id, outreach_event_id, conversation_id, kind, due_at, notes, completed_at, created_at, updated_at
		from reminders where id = $1 and user_id = $2`, id, userID)
}

func (s *Store) CreateReminder(ctx context.Context, r model.Reminder) (model.Reminder, error) {
	return queryOne[model.Reminder](ctx, s.pool, `
		insert into reminders (user_id, outreach_event_id, conversation_id, kind, due_at, notes)
		values ($1, $2, $3, $4, $5, $6)
		returning id, user_id, outreach_event_id, conversation_id, kind, due_at, notes, completed_at, created_at, updated_at`,
		r.UserID, r.OutreachEventID, r.ConversationID, r.Kind, r.DueAt, r.Notes)
}

func (s *Store) UpdateReminder(ctx context.Context, r model.Reminder) (model.Reminder, error) {
	return queryOne[model.Reminder](ctx, s.pool, `
		update reminders
		set outreach_event_id = $3, conversation_id = $4, kind = $5, due_at = $6, notes = $7, completed_at = $8
		where id = $1 and user_id = $2
		returning id, user_id, outreach_event_id, conversation_id, kind, due_at, notes, completed_at, created_at, updated_at`,
		r.ID, r.UserID, r.OutreachEventID, r.ConversationID, r.Kind, r.DueAt, r.Notes, r.CompletedAt)
}

func (s *Store) DeleteReminder(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from reminders where id = $1 and user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func IsFKError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "foreign key") || strings.Contains(msg, "23503")
}

func IsCheckError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "check constraint") || strings.Contains(msg, "23514")
}
