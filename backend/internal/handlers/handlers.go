package handlers

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sealed/backend/internal/auth"
	"github.com/sealed/backend/internal/storage"
)

// Deps carries everything the handlers need. The zero value is not usable;
// construct via New.
type Deps struct {
	DB      *pgxpool.Pool
	Auth    *auth.Service
	Google  *auth.GoogleService
	Storage *storage.Client
	Logger  *slog.Logger
	Dev     bool // when true, internal error responses include the underlying error
}

func New(
	db *pgxpool.Pool,
	authSvc *auth.Service,
	google *auth.GoogleService,
	s *storage.Client,
	logger *slog.Logger,
	dev bool,
) *Deps {
	if logger == nil {
		logger = slog.Default()
	}
	return &Deps{DB: db, Auth: authSvc, Google: google, Storage: s, Logger: logger, Dev: dev}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// internalError logs the real cause of a 500 with full request context and
// returns a public-safe message to the client. In dev mode, the underlying
// error is attached to the response so the browser network tab shows it.
func (d *Deps) internalError(w http.ResponseWriter, r *http.Request, err error, publicMsg string) {
	attrs := []any{
		slog.String("method", r.Method),
		slog.String("path", r.URL.Path),
		slog.String("request_id", middleware.GetReqID(r.Context())),
		slog.String("public_msg", publicMsg),
		slog.Any("err", err),
	}
	if u, ok := auth.UserFrom(r.Context()); ok {
		attrs = append(attrs, slog.String("user_id", u.ID))
	}
	d.Logger.Error("handler error", attrs...)

	body := map[string]string{"error": publicMsg}
	if d.Dev && err != nil {
		body["detail"] = err.Error()
	}
	writeJSON(w, http.StatusInternalServerError, body)
}

func decodeBody(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

// currentUser returns the authenticated user from context, failing the
// request with 401 if absent. Returns false when the caller should abort.
func currentUser(w http.ResponseWriter, r *http.Request) (auth.CtxUser, bool) {
	u, ok := auth.UserFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthenticated")
		return auth.CtxUser{}, false
	}
	return u, true
}

func isNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }
