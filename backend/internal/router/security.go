package router

import (
	"net/http"
	"sync"
	"time"

	"github.com/simplysafelegacy/backend/internal/auth"
	"golang.org/x/time/rate"
)

// Vault responses and errors must never persist in browser or intermediary caches.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

type userBudget struct {
	requests *rate.Limiter
	writes   *rate.Limiter
	support  *rate.Limiter
	lastSeen time.Time
}

type userLimiter struct {
	mu        sync.Mutex
	users     map[string]*userBudget
	lastSweep time.Time
}

func newUserLimiter() *userLimiter {
	return &userLimiter{users: make(map[string]*userBudget)}
}

// Budgets use the verified local user ID. Forwarded IP headers cannot reset
// them. Limits are per process; a multi-replica deployment needs a shared limiter.
func (l *userLimiter) allow(id, method, path string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.Sub(l.lastSweep) >= time.Minute {
		for id, budget := range l.users {
			if now.Sub(budget.lastSeen) >= time.Hour {
				delete(l.users, id)
			}
		}
		l.lastSweep = now
	}
	budget := l.users[id]
	if budget == nil {
		// Fail closed at capacity rather than evicting an active user's budget.
		if len(l.users) >= 10000 {
			return false
		}
		budget = &userBudget{
			requests: rate.NewLimiter(rate.Every(time.Second/2), 60),
			writes:   rate.NewLimiter(rate.Every(2*time.Second), 10),
			support:  rate.NewLimiter(rate.Every(12*time.Minute), 2),
		}
		l.users[id] = budget
	}
	budget.lastSeen = now
	if !budget.requests.AllowN(now, 1) {
		return false
	}
	if method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions {
		if !budget.writes.AllowN(now, 1) {
			return false
		}
	}
	return path != "/api/support/tickets" || budget.support.AllowN(now, 1)
}

func (l *userLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := auth.UserFrom(r.Context())
		if !ok {
			http.Error(w, "authorization required", http.StatusUnauthorized)
			return
		}
		if !l.allow(u.ID, r.Method, r.URL.Path, time.Now()) {
			w.Header().Set("Retry-After", "60")
			if r.URL.Path == "/api/support/tickets" {
				w.Header().Set("Retry-After", "720")
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"too many requests; try again later"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}
