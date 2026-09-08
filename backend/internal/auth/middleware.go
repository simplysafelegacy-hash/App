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
