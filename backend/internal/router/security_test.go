package router

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/simplysafelegacy/backend/internal/handlers"
)

func TestAllPrivateRoutesRequireAuthentication(t *testing.T) {
	h := New(&handlers.Deps{}, nil, []string{"https://app.example"}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	count := 0
	err := chi.Walk(h.(chi.Routes), func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if route == "/health" || route == "/api/billing/plans" || route == "/api/billing/webhook" {
			return nil
		}
		count++
		t.Run(method+" "+route, func(t *testing.T) {
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest(method, route, nil))
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("status=%d, want 401", w.Code)
			}
			if w.Header().Get("Cache-Control") != "private, no-store" {
				t.Fatal("private response can be cached")
			}
		})
		return nil
	})
	if err != nil || count < 30 {
		t.Fatalf("route coverage: count=%d err=%v", count, err)
	}
}

func TestCORSDeniesForeignOrigin(t *testing.T) {
	h := New(&handlers.Deps{}, nil, []string{"https://app.example"}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	for _, origin := range []string{"https://app.example", "https://evil.example"} {
		r := httptest.NewRequest(http.MethodOptions, "/api/vault", nil)
		r.Header.Set("Origin", origin)
		r.Header.Set("Access-Control-Request-Method", "GET")
		r.Header.Set("Access-Control-Request-Headers", "Authorization,X-Vault-Id")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		allowed := w.Header().Get("Access-Control-Allow-Origin") == origin
		if allowed != (origin == "https://app.example") {
			t.Fatalf("incorrect CORS grant to %s", origin)
		}
	}
}

func TestUserBudgetsBoundRequestsAndIsolateAccounts(t *testing.T) {
	l := newUserLimiter()
	now := time.Now()
	for i := 0; i < 60; i++ {
		if !l.allow("a", "GET", "/api/vault", now) {
			t.Fatal("initial read burst rejected")
		}
	}
	if l.allow("a", "GET", "/api/notifications", now) {
		t.Fatal("changing route bypassed read limit")
	}
	if !l.allow("b", "GET", "/api/vault", now) {
		t.Fatal("another user's budget was consumed")
	}
	if !l.allow("a", "GET", "/api/vault", now.Add(time.Second)) {
		t.Fatal("budget did not refill")
	}
	for i := 0; i < 10; i++ {
		if !l.allow("c", "POST", "/api/vault", now) {
			t.Fatal("write burst rejected")
		}
	}
	if l.allow("c", "DELETE", "/api/members/1", now) {
		t.Fatal("changing mutation route bypassed limit")
	}
	for i := 0; i < 2; i++ {
		if !l.allow("d", "POST", "/api/support/tickets", now) {
			t.Fatal("initial support burst rejected")
		}
	}
	if l.allow("d", "POST", "/api/support/tickets", now) {
		t.Fatal("support spam accepted")
	}
	if !l.allow("d", "POST", "/api/support/tickets", now.Add(12*time.Minute)) {
		t.Fatal("support budget did not refill")
	}
}

func TestConcurrentRequestsCannotBypassBudget(t *testing.T) {
	l := newUserLimiter()
	now := time.Now()
	var count atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if l.allow("same-user", "POST", "/api/vault", now) {
				count.Add(1)
			}
		}()
	}
	wg.Wait()
	if count.Load() != 10 {
		t.Fatalf("allowed %d concurrent writes, want 10", count.Load())
	}
}

func TestLimiterEvictsOnlyIdleAccountsAndDeniesAtCapacity(t *testing.T) {
	l := newUserLimiter()
	now := time.Now()
	l.allow("idle", "GET", "/", now.Add(-2*time.Hour))
	l.allow("active", "GET", "/", now)
	if _, ok := l.users["idle"]; ok {
		t.Fatal("idle budget retained")
	}
	for i := 0; i < 10000; i++ {
		l.users[time.Unix(int64(i), 0).String()] = &userBudget{lastSeen: now}
	}
	if l.allow("new", "GET", "/", now) {
		t.Fatal("capacity limit bypassed")
	}
}
