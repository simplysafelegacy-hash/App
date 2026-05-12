package auth

import (
	"context"
	"net/http"
	"strings"
)

type ctxKey string

const userCtxKey ctxKey = "auth.user"

type CtxUser struct {
	ID    string
	Email string
}

// Middleware verifies the Authorization: Bearer <token> header and injects
// the authenticated user into the request context. Unauthenticated requests
// get a 401 and the handler chain is not invoked.
func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := extractBearer(r)
		if raw == "" {
			writeError(w, http.StatusUnauthorized, "authorization required")
			return
		}
		claims, err := s.Parse(raw)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		ctx := context.WithValue(r.Context(), userCtxKey, CtxUser{ID: claims.UserID, Email: claims.Email})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func UserFrom(ctx context.Context) (CtxUser, bool) {
	u, ok := ctx.Value(userCtxKey).(CtxUser)
	return u, ok
}

func extractBearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if h == "" {
		return ""
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return parts[1]
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}
