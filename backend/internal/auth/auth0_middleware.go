package auth

import (
	"context"
	"net/http"
)

// Auth0User is the identity resolved from a verified access token, after it
// has been mapped onto a local users row.
type Auth0User struct {
	Sub string // Auth0 subject, e.g. "auth0|abc123"
}

type auth0CtxKey string

const auth0SubCtxKey auth0CtxKey = "auth.auth0sub"

// UserResolver maps a verified Auth0 subject onto a local user, creating the
// row on first sign-in. Implemented by the handlers package, which owns the
// database; declared here so this package stays free of storage concerns.
type UserResolver interface {
	ResolveAuth0User(ctx context.Context, sub, token string) (CtxUser, error)
}

// Auth0Middleware verifies the bearer token against Auth0 and injects the
// corresponding local user into the request context.
//
// Handlers downstream keep using UserFrom(ctx), so the entire authorization
// surface — vault ownership, admin checks, document permissions — is
// unchanged by the move to Auth0. Only how identity is established changed.
func Auth0Middleware(v *Auth0Verifier, resolver UserResolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := extractBearer(r)
			if raw == "" {
				writeError(w, http.StatusUnauthorized, "authorization required")
				return
			}

			claims, err := v.Verify(raw)
			if err != nil {
				// Deliberately opaque: distinguishing "expired" from
				// "malformed" from "wrong audience" helps an attacker probe
				// the tenant configuration. The real reason is logged
				// server-side by the resolver's caller when it matters.
				writeError(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}

			user, err := resolver.ResolveAuth0User(r.Context(), claims.Subject, raw)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "could not resolve account")
				return
			}

			ctx := context.WithValue(r.Context(), userCtxKey, user)
			ctx = context.WithValue(ctx, auth0SubCtxKey, claims.Subject)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// Auth0SubFrom returns the verified Auth0 subject for the request, when the
// request came through Auth0Middleware.
func Auth0SubFrom(ctx context.Context) (string, bool) {
	s, ok := ctx.Value(auth0SubCtxKey).(string)
	return s, ok
}
