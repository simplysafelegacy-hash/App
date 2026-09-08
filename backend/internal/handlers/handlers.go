package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/simplysafelegacy/backend/internal/auth"
	"github.com/simplysafelegacy/backend/internal/config"
	"github.com/simplysafelegacy/backend/internal/storage"
)

// Deps carries everything the handlers need. The zero value is not usable;
// construct via New.
type Deps struct {
	DB      *pgxpool.Pool
	Auth0   *auth.Auth0Verifier
	Stripe  StripeConfig
	Storage *storage.Client
	Support SupportConfig
	Logger  *slog.Logger
	Dev     bool

	// auth0Cache memoises Auth0 subject -> local user for the lifetime of a
	// few requests. See auth0.go for why this cannot grant stale authority.
	auth0Cache *auth0UserCache
}

// StripeConfig is the subset of config the billing handler needs. Carved
// off so handlers don't depend on the whole config package shape.
type StripeConfig struct {
	SecretKey        string
	WebhookSecret    string
	PublishableKey   string
	PublicAppURL     string
	PriceIndividual  string
	PriceFamily      string
	PriceSafekeeping string
}

type SupportConfig struct {
	EmailTo      string
	SMTPHost     string
	SMTPPort     string
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string
}

// StorageConfigFrom maps app config onto the storage package's config.
func StorageConfigFrom(c *config.Config) storage.Config {
	return storage.Config{
		Bucket:       c.S3Bucket,
		Region:       c.AWSRegion,
		SSEKMSKeyID:  c.S3KMSKeyID,
		Endpoint:     c.S3Endpoint,
		UsePathStyle: c.S3PathStyle,
	}
}

func SupportConfigFrom(c *config.Config) SupportConfig {
	return SupportConfig{
		EmailTo:      c.SupportEmailTo,
		SMTPHost:     c.SMTPHost,
		SMTPPort:     c.SMTPPort,
		SMTPUsername: c.SMTPUsername,
		SMTPPassword: c.SMTPPassword,
		SMTPFrom:     c.SMTPFrom,
	}
}

func StripeConfigFrom(c *config.Config) StripeConfig {
	return StripeConfig{
		SecretKey:        c.StripeSecretKey,
		WebhookSecret:    c.StripeWebhookSecret,
		PublishableKey:   c.StripePublishableKey,
		PublicAppURL:     c.PublicAppURL,
		PriceIndividual:  c.StripePriceIndividual,
		PriceFamily:      c.StripePriceFamily,
		PriceSafekeeping: c.StripePriceSafekeeping,
	}
}

func New(
	db *pgxpool.Pool,
	auth0 *auth.Auth0Verifier,
	stripe StripeConfig,
	store *storage.Client,
	support SupportConfig,
	logger *slog.Logger,
	dev bool,
) *Deps {
	if logger == nil {
		logger = slog.Default()
	}
	return &Deps{
		DB:         db,
		Auth0:      auth0,
		Stripe:     stripe,
		Storage:    store,
		Support:    support,
		Logger:     logger,
		Dev:        dev,
		auth0Cache: newAuth0UserCache(60 * time.Second),
	}
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

// maxJSONBodyBytes caps a JSON request body. Nothing this API accepts as
// JSON is large — the biggest is a member's permission list — so a generous
// ceiling still refuses a body sent purely to consume memory.
const maxJSONBodyBytes = 1 << 20

func decodeBody(r *http.Request, dst any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, maxJSONBodyBytes))
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
