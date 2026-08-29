package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/google/uuid"

	"reachtrack/internal/auth"
	"reachtrack/internal/gmail"
	"reachtrack/internal/model"
	"reachtrack/internal/store"
)

type API struct {
	Store    *store.Store
	Verifier *auth.Verifier
	Gmail    *gmail.Service
}

func NewRouter(a *API, corsOrigin string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   strings.Split(corsOrigin, ","),
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Get("/api/v1/integrations/gmail/callback", a.gmailCallback)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(a.requireAuth)
		r.Get("/me", a.getMe)
		r.Patch("/me", a.patchMe)
		r.Get("/stats", a.getStats)

		r.Get("/integrations/gmail", a.getGmailConnection)
		r.Get("/integrations/gmail/authorize", a.gmailAuthorize)
		r.Post("/integrations/gmail/sync-sent", a.syncGmailSent)
		r.Delete("/integrations/gmail", a.deleteGmailConnection)

		r.Get("/companies", a.listCompanies)
		r.Post("/companies", a.createCompany)
		r.Get("/companies/{id}", a.getCompany)
		r.Put("/companies/{id}", a.updateCompany)
		r.Delete("/companies/{id}", a.deleteCompany)

		r.Get("/contacts", a.listContacts)
		r.Post("/contacts", a.createContact)
		r.Get("/contacts/{id}", a.getContact)
		r.Put("/contacts/{id}", a.updateContact)
		r.Delete("/contacts/{id}", a.deleteContact)

		r.Get("/jobs", a.listJobs)
		r.Post("/jobs", a.createJob)
		r.Get("/jobs/{id}", a.getJob)
		r.Put("/jobs/{id}", a.updateJob)
		r.Delete("/jobs/{id}", a.deleteJob)

		r.Get("/conversations", a.listConversations)
		r.Post("/conversations", a.createConversation)
		r.Get("/conversations/{id}", a.getConversation)
		r.Put("/conversations/{id}", a.updateConversation)
		r.Delete("/conversations/{id}", a.deleteConversation)

		r.Get("/outreach-events", a.listOutreach)
		r.Post("/outreach-events", a.createOutreach)
		r.Get("/outreach-events/{id}", a.getOutreach)
		r.Put("/outreach-events/{id}", a.updateOutreach)
		r.Delete("/outreach-events/{id}", a.deleteOutreach)

		r.Get("/reminders", a.listReminders)
		r.Post("/reminders", a.createReminder)
		r.Get("/reminders/{id}", a.getReminder)
		r.Put("/reminders/{id}", a.updateReminder)
		r.Delete("/reminders/{id}", a.deleteReminder)
	})

	return r
}

func (a *API) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := auth.Bearer(r.Header.Get("Authorization"))
		if token == "" {
			writeError(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		userID, email, err := a.Verifier.ParseToken(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}
		next.ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), userID, email)))
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dest any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dest); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return false
	}
	return true
}

func parseID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return uuid.Nil, false
	}
	return id, true
}

func queryLimit(r *http.Request) int {
	n, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	return n
}

func parseOptionalUUID(raw string) (*uuid.UUID, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func handleStoreErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not found")
	case store.IsFKError(err):
		writeError(w, http.StatusBadRequest, "related record not found")
	case store.IsCheckError(err):
		writeError(w, http.StatusBadRequest, "invalid value")
	default:
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

func (a *API) getMe(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	p, err := a.Store.EnsureProfile(ctx, auth.UserID(ctx), auth.Email(ctx), "")
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

type profileIn struct {
	FullName string `json:"fullName"`
	Timezone string `json:"timezone"`
}

func (a *API) patchMe(w http.ResponseWriter, r *http.Request) {
	var in profileIn
	if !decodeJSON(w, r, &in) {
		return
	}
	fullName := strings.TrimSpace(in.FullName)
	tz := strings.TrimSpace(in.Timezone)
	var fullNamePtr, tzPtr *string
	if fullName != "" {
		fullNamePtr = &fullName
	}
	if tz != "" {
		tzPtr = &tz
	}
	p, err := a.Store.UpdateProfile(r.Context(), auth.UserID(r.Context()), fullNamePtr, tzPtr)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (a *API) getStats(w http.ResponseWriter, r *http.Request) {
	stats, err := a.Store.Stats(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

type companyIn struct {
	Name        string `json:"name"`
	Domain      string `json:"domain"`
	Website     string `json:"website"`
	LinkedinURL string `json:"linkedinUrl"`
	Notes       string `json:"notes"`
}

func (in companyIn) toModel(userID uuid.UUID) (model.Company, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return model.Company{}, errors.New("name is required")
	}
	return model.Company{
		UserID:      userID,
		Name:        name,
		Domain:      model.EmptyToNil(in.Domain),
		Website:     model.EmptyToNil(in.Website),
		LinkedinURL: model.EmptyToNil(in.LinkedinURL),
		Notes:       strings.TrimSpace(in.Notes),
	}, nil
}

func (a *API) listCompanies(w http.ResponseWriter, r *http.Request) {
	items, err := a.Store.ListCompanies(r.Context(), auth.UserID(r.Context()), r.URL.Query().Get("q"), queryLimit(r))
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) getCompany(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	item, err := a.Store.GetCompany(r.Context(), auth.UserID(r.Context()), id)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) createCompany(w http.ResponseWriter, r *http.Request) {
	var in companyIn
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := a.Store.CreateCompany(r.Context(), c)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *API) updateCompany(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var in companyIn
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	c.ID = id
	item, err := a.Store.UpdateCompany(r.Context(), c)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) deleteCompany(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := a.Store.DeleteCompany(r.Context(), auth.UserID(r.Context()), id); err != nil {
		handleStoreErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type contactIn struct {
	CompanyID   string `json:"companyId"`
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	Email       string `json:"email"`
	LinkedinURL string `json:"linkedinUrl"`
	Title       string `json:"title"`
	Notes       string `json:"notes"`
}

func (in contactIn) toModel(userID uuid.UUID) (model.Contact, error) {
	if strings.TrimSpace(in.FirstName) == "" && strings.TrimSpace(in.LastName) == "" {
		return model.Contact{}, errors.New("first or last name is required")
	}
	companyID, err := parseOptionalUUID(in.CompanyID)
	if err != nil {
		return model.Contact{}, errors.New("invalid companyId")
	}
	return model.Contact{
		UserID:      userID,
		CompanyID:   companyID,
		FirstName:   strings.TrimSpace(in.FirstName),
		LastName:    strings.TrimSpace(in.LastName),
		Email:       model.EmptyToNil(in.Email),
		LinkedinURL: model.EmptyToNil(in.LinkedinURL),
		Title:       strings.TrimSpace(in.Title),
		Notes:       strings.TrimSpace(in.Notes),
	}, nil
}

func (a *API) listContacts(w http.ResponseWriter, r *http.Request) {
	items, err := a.Store.ListContacts(r.Context(), auth.UserID(r.Context()), r.URL.Query().Get("q"), queryLimit(r))
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) getContact(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	item, err := a.Store.GetContact(r.Context(), auth.UserID(r.Context()), id)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) createContact(w http.ResponseWriter, r *http.Request) {
	var in contactIn
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := a.Store.CreateContact(r.Context(), c)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *API) updateContact(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var in contactIn
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	c.ID = id
	item, err := a.Store.UpdateContact(r.Context(), c)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) deleteContact(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := a.Store.DeleteContact(r.Context(), auth.UserID(r.Context()), id); err != nil {
		handleStoreErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type jobIn struct {
	CompanyID string `json:"companyId"`
	Title     string `json:"title"`
	URL       string `json:"url"`
	Location  string `json:"location"`
	Status    string `json:"status"`
	Notes     string `json:"notes"`
}

func (in jobIn) toModel(userID uuid.UUID) (model.Job, error) {
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return model.Job{}, errors.New("title is required")
	}
	status, err := model.RequireStatus(in.Status, model.StatusSent)
	if err != nil {
		return model.Job{}, err
	}
	companyID, err := parseOptionalUUID(in.CompanyID)
	if err != nil {
		return model.Job{}, errors.New("invalid companyId")
	}
	return model.Job{
		UserID:    userID,
		CompanyID: companyID,
		Title:     title,
		URL:       model.EmptyToNil(in.URL),
		Location:  strings.TrimSpace(in.Location),
		Status:    status,
		Notes:     strings.TrimSpace(in.Notes),
	}, nil
}

func (a *API) listJobs(w http.ResponseWriter, r *http.Request) {
	items, err := a.Store.ListJobs(r.Context(), auth.UserID(r.Context()), r.URL.Query().Get("status"), r.URL.Query().Get("q"), queryLimit(r))
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) getJob(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	item, err := a.Store.GetJob(r.Context(), auth.UserID(r.Context()), id)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) createJob(w http.ResponseWriter, r *http.Request) {
	var in jobIn
	if !decodeJSON(w, r, &in) {
		return
	}
	j, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := a.Store.CreateJob(r.Context(), j)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *API) updateJob(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var in jobIn
	if !decodeJSON(w, r, &in) {
		return
	}
	j, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	j.ID = id
	item, err := a.Store.UpdateJob(r.Context(), j)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) deleteJob(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := a.Store.DeleteJob(r.Context(), auth.UserID(r.Context()), id); err != nil {
		handleStoreErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type conversationIn struct {
	ContactID string `json:"contactId"`
	CompanyID string `json:"companyId"`
	JobID     string `json:"jobId"`
	Channel   string `json:"channel"`
	Subject   string `json:"subject"`
	Status    string `json:"status"`
}

func (in conversationIn) toModel(userID uuid.UUID) (model.Conversation, error) {
	status, err := model.RequireStatus(in.Status, model.StatusSent)
	if err != nil {
		return model.Conversation{}, err
	}
	channel := strings.TrimSpace(in.Channel)
	if channel == "" {
		channel = "other"
	}
	if !model.ValidChannel(channel) {
		return model.Conversation{}, errors.New("invalid channel")
	}
	contactID, err := parseOptionalUUID(in.ContactID)
	if err != nil {
		return model.Conversation{}, errors.New("invalid contactId")
	}
	companyID, err := parseOptionalUUID(in.CompanyID)
	if err != nil {
		return model.Conversation{}, errors.New("invalid companyId")
	}
	jobID, err := parseOptionalUUID(in.JobID)
	if err != nil {
		return model.Conversation{}, errors.New("invalid jobId")
	}
	return model.Conversation{
		UserID:    userID,
		ContactID: contactID,
		CompanyID: companyID,
		JobID:     jobID,
		Channel:   channel,
		Subject:   strings.TrimSpace(in.Subject),
		Status:    status,
	}, nil
}

func (a *API) listConversations(w http.ResponseWriter, r *http.Request) {
	items, err := a.Store.ListConversations(r.Context(), auth.UserID(r.Context()), r.URL.Query().Get("status"), r.URL.Query().Get("q"), queryLimit(r))
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) getConversation(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	item, err := a.Store.GetConversation(r.Context(), auth.UserID(r.Context()), id)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) createConversation(w http.ResponseWriter, r *http.Request) {
	var in conversationIn
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := a.Store.CreateConversation(r.Context(), c)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *API) updateConversation(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var in conversationIn
	if !decodeJSON(w, r, &in) {
		return
	}
	c, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	c.ID = id
	item, err := a.Store.UpdateConversation(r.Context(), c)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) deleteConversation(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := a.Store.DeleteConversation(r.Context(), auth.UserID(r.Context()), id); err != nil {
		handleStoreErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type outreachIn struct {
	ConversationID string `json:"conversationId"`
	ContactID      string `json:"contactId"`
	CompanyID      string `json:"companyId"`
	JobID          string `json:"jobId"`
	Type           string `json:"type"`
	Channel        string `json:"channel"`
	Source         string `json:"source"`
	Status         string `json:"status"`
	Subject        string `json:"subject"`
	Body           string `json:"body"`
	ExternalID     string `json:"externalId"`
	OccurredAt     string `json:"occurredAt"`
}

func (in outreachIn) toModel(userID uuid.UUID) (model.OutreachEvent, error) {
	status, err := model.RequireStatus(in.Status, model.StatusSent)
	if err != nil {
		return model.OutreachEvent{}, err
	}
	eventType := strings.TrimSpace(in.Type)
	if eventType == "" {
		eventType = "cold_email"
	}
	if !model.ValidType(eventType) {
		return model.OutreachEvent{}, errors.New("invalid type")
	}
	channel := strings.TrimSpace(in.Channel)
	if channel == "" {
		channel = "other"
	}
	if !model.ValidChannel(channel) {
		return model.OutreachEvent{}, errors.New("invalid channel")
	}
	source := strings.TrimSpace(in.Source)
	if source == "" {
		source = "manual"
	}
	if !model.ValidSource(source) {
		return model.OutreachEvent{}, errors.New("invalid source")
	}
	occurredAt := time.Now().UTC()
	if strings.TrimSpace(in.OccurredAt) != "" {
		t, err := time.Parse(time.RFC3339, in.OccurredAt)
		if err != nil {
			return model.OutreachEvent{}, errors.New("occurredAt must be RFC3339")
		}
		occurredAt = t
	}
	conversationID, err := parseOptionalUUID(in.ConversationID)
	if err != nil {
		return model.OutreachEvent{}, errors.New("invalid conversationId")
	}
	contactID, err := parseOptionalUUID(in.ContactID)
	if err != nil {
		return model.OutreachEvent{}, errors.New("invalid contactId")
	}
	companyID, err := parseOptionalUUID(in.CompanyID)
	if err != nil {
		return model.OutreachEvent{}, errors.New("invalid companyId")
	}
	jobID, err := parseOptionalUUID(in.JobID)
	if err != nil {
		return model.OutreachEvent{}, errors.New("invalid jobId")
	}
	return model.OutreachEvent{
		UserID:         userID,
		ConversationID: conversationID,
		ContactID:      contactID,
		CompanyID:      companyID,
		JobID:          jobID,
		Type:           eventType,
		Channel:        channel,
		Source:         source,
		Status:         status,
		Subject:        strings.TrimSpace(in.Subject),
		Body:           strings.TrimSpace(in.Body),
		ExternalID:     model.EmptyToNil(in.ExternalID),
		OccurredAt:     occurredAt,
	}, nil
}

func (a *API) listOutreach(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	items, err := a.Store.ListOutreach(r.Context(), auth.UserID(r.Context()), q.Get("status"), q.Get("type"), q.Get("q"), queryLimit(r))
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) getOutreach(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	item, err := a.Store.GetOutreach(r.Context(), auth.UserID(r.Context()), id)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) createOutreach(w http.ResponseWriter, r *http.Request) {
	var in outreachIn
	if !decodeJSON(w, r, &in) {
		return
	}
	e, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := a.Store.CreateOutreach(r.Context(), e)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *API) updateOutreach(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var in outreachIn
	if !decodeJSON(w, r, &in) {
		return
	}
	e, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	e.ID = id
	item, err := a.Store.UpdateOutreach(r.Context(), e)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) deleteOutreach(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := a.Store.DeleteOutreach(r.Context(), auth.UserID(r.Context()), id); err != nil {
		handleStoreErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type reminderIn struct {
	OutreachEventID string `json:"outreachEventId"`
	ConversationID  string `json:"conversationId"`
	Kind            string `json:"kind"`
	DueAt           string `json:"dueAt"`
	Notes           string `json:"notes"`
	Completed       *bool  `json:"completed"`
}

func (in reminderIn) toModel(userID uuid.UUID) (model.Reminder, error) {
	kind := strings.TrimSpace(in.Kind)
	if kind == "" {
		kind = "follow_up"
	}
	if !model.ValidReminderKind(kind) {
		return model.Reminder{}, errors.New("invalid kind")
	}
	if strings.TrimSpace(in.DueAt) == "" {
		return model.Reminder{}, errors.New("dueAt is required")
	}
	dueAt, err := time.Parse(time.RFC3339, in.DueAt)
	if err != nil {
		t, err2 := time.Parse("2006-01-02T15:04", in.DueAt)
		if err2 != nil {
			return model.Reminder{}, errors.New("dueAt must be RFC3339")
		}
		dueAt = t
	}
	eventID, err := parseOptionalUUID(in.OutreachEventID)
	if err != nil {
		return model.Reminder{}, errors.New("invalid outreachEventId")
	}
	conversationID, err := parseOptionalUUID(in.ConversationID)
	if err != nil {
		return model.Reminder{}, errors.New("invalid conversationId")
	}
	var completedAt *time.Time
	if in.Completed != nil && *in.Completed {
		now := time.Now().UTC()
		completedAt = &now
	}
	return model.Reminder{
		UserID:          userID,
		OutreachEventID: eventID,
		ConversationID:  conversationID,
		Kind:            kind,
		DueAt:           dueAt,
		Notes:           strings.TrimSpace(in.Notes),
		CompletedAt:     completedAt,
	}, nil
}

func (a *API) listReminders(w http.ResponseWriter, r *http.Request) {
	openOnly := r.URL.Query().Get("open") != "false"
	items, err := a.Store.ListReminders(r.Context(), auth.UserID(r.Context()), openOnly, queryLimit(r))
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) getReminder(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	item, err := a.Store.GetReminder(r.Context(), auth.UserID(r.Context()), id)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) createReminder(w http.ResponseWriter, r *http.Request) {
	var in reminderIn
	if !decodeJSON(w, r, &in) {
		return
	}
	rem, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := a.Store.CreateReminder(r.Context(), rem)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *API) updateReminder(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var in reminderIn
	if !decodeJSON(w, r, &in) {
		return
	}
	rem, err := in.toModel(auth.UserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	rem.ID = id
	item, err := a.Store.UpdateReminder(r.Context(), rem)
	if err != nil {
		handleStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) deleteReminder(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := a.Store.DeleteReminder(r.Context(), auth.UserID(r.Context()), id); err != nil {
		handleStoreErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
