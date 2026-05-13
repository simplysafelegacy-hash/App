package router

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/simplysafelegacy/backend/internal/auth"
	"github.com/simplysafelegacy/backend/internal/handlers"
)

func New(h *handlers.Deps, authSvc *auth.Service, allowedOrigins []string, logger *slog.Logger) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(requestLogger(logger))
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: allowedOrigins,
		AllowedMethods: []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{
			"Accept", "Authorization", "Content-Type",
			"X-Request-ID", "X-Vault-Id",
		},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	r.Route("/api", func(r chi.Router) {
		// Public auth + Stripe webhook. The webhook is intentionally
		// unauthenticated — the signature header proves authenticity.
		r.Post("/auth/google", h.GoogleAuth)
		r.Post("/auth/register", h.Register)
		r.Post("/auth/login", h.Login)
		r.Post("/billing/webhook", h.Webhook)

		// Authenticated, no vault scope required.
		r.Group(func(r chi.Router) {
			r.Use(authSvc.Middleware)

			r.Get("/auth/me", h.Me)
			r.Get("/me/vaults", h.ListMyVaults)
			r.Post("/vault", h.CreateVault)

			r.Post("/billing/checkout", h.CreateCheckout)
			r.Post("/billing/portal", h.CustomerPortal)
		})

		// Authenticated + scoped to a specific vault via X-Vault-Id.
		r.Group(func(r chi.Router) {
			r.Use(authSvc.Middleware)
			r.Use(h.VaultMiddleware)

			r.Get("/vault", h.GetVault)
			r.Post("/vault/release", h.ReleaseVault)
			r.Put("/vault/will", h.UpdateWill)

			r.Get("/members", h.ListMembers)
			r.Post("/members", h.CreateMember)
			r.Patch("/members/{id}", h.UpdateMember)
			r.Delete("/members/{id}", h.DeleteMember)
		})

		// Authenticated, notifications are user-global (cross-vault).
		r.Group(func(r chi.Router) {
			r.Use(authSvc.Middleware)
			r.Get("/notifications", h.ListNotifications)
			r.Post("/notifications/{id}/read", h.MarkNotificationRead)
		})
	})

	return r
}

// requestLogger emits one structured line per request, including method, path,
// status, duration, request id, and remote ip. 5xx responses log at error
// level so they surface loudly in log pipelines.
func requestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)

			attrs := []any{
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", ww.Status()),
				slog.Int("bytes", ww.BytesWritten()),
				slog.Duration("duration", time.Since(start)),
				slog.String("request_id", middleware.GetReqID(r.Context())),
				slog.String("remote", r.RemoteAddr),
			}
			switch {
			case ww.Status() >= 500:
				logger.Error("request", attrs...)
			case ww.Status() >= 400:
				logger.Warn("request", attrs...)
			default:
				logger.Info("request", attrs...)
			}
		})
	}
}
