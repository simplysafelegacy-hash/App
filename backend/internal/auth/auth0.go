package auth

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// Auth0Verifier validates access tokens issued by Auth0.
//
// Auth0 signs with RS256 and publishes its public keys at
// /.well-known/jwks.json. We fetch that key set once at boot and refresh it
// in the background, so a key rotation at Auth0 does not require a redeploy.
//
// Only the public key is ever held here — this process cannot mint a token,
// which is the point of moving off a shared HMAC secret. A leaked backend
// config no longer lets an attacker forge sessions.
type Auth0Verifier struct {
	keyfunc  keyfunc.Keyfunc
	issuer   string
	audience string
}

// Auth0Claims is the subset of an Auth0 access token we act on.
//
// Subject is Auth0's stable user id ("auth0|abc123", "google-oauth2|123…").
// It is the only trustworthy identifier in the token: email is not
// guaranteed present on an access token, and is not unique across
// connections, so it is never used to look up a user.
type Auth0Claims struct {
	jwt.RegisteredClaims
}

// NewAuth0Verifier builds a verifier for the given tenant domain and API
// audience. domain is the bare tenant host ("your-tenant.us.auth0.com");
// audience must match the API identifier configured in Auth0.
func NewAuth0Verifier(ctx context.Context, domain, audience string) (*Auth0Verifier, error) {
	domain = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(domain, "https://"), "/"))
	if domain == "" {
		return nil, errors.New("auth0: domain is required")
	}
	if strings.TrimSpace(audience) == "" {
		return nil, errors.New("auth0: audience is required")
	}

	// Auth0 is always https. A plain-http issuer is only meaningful when
	// pointing at a local mock tenant, so it is accepted solely when the
	// domain is explicitly a loopback address — never for a real hostname.
	scheme := "https://"
	if isLoopback(domain) {
		scheme = "http://"
	}
	return newVerifierForTest(ctx, scheme+domain+"/", audience)
}

// isLoopback reports whether host addresses the local machine, ignoring any
// port. Used to permit an http mock tenant in development.
//
// SplitHostPort rather than a manual colon split: the naive version cut on
// the last colon, which both mangled a bare IPv6 literal and accepted
// "localhost:8080.evil.com" as loopback.
func isLoopback(host string) bool {
	h := strings.Trim(host, "[]")
	// SplitHostPort happily accepts a non-numeric "port", so
	// "localhost:8080.evil.com" splits to host "localhost". Only strip a
	// suffix that is actually a port number.
	if hostOnly, port, err := net.SplitHostPort(host); err == nil {
		if _, convErr := strconv.ParseUint(port, 10, 16); convErr == nil {
			h = strings.Trim(hostOnly, "[]")
		}
	}
	if h == "localhost" {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && ip.IsLoopback()
}

// newVerifierForTest builds a verifier from a fully-qualified issuer URL.
// NewAuth0Verifier is the production entry point; this exists so tests can
// point at a local JWKS server over http.
func newVerifierForTest(ctx context.Context, issuer, audience string) (*Auth0Verifier, error) {
	jwksURL := issuer + ".well-known/jwks.json"

	// Fetching at boot means a wrong domain fails the deploy rather than
	// every login. The client refreshes the key set on its own afterwards.
	k, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("auth0: load JWKS from %s: %w", jwksURL, err)
	}

	return &Auth0Verifier{keyfunc: k, issuer: issuer, audience: audience}, nil
}

// Issuer is the expected `iss` claim, exposed for logging and diagnostics.
func (v *Auth0Verifier) Issuer() string { return v.issuer }

// Verify parses and validates a raw access token, returning its claims.
//
// Every check below matters:
//   - RS256 only. Refusing other algorithms blocks the classic "alg: none"
//     and HMAC-confusion attacks, where a token is re-signed using the
//     public key as an HMAC secret.
//   - Issuer and audience must match this tenant and this API, so a token
//     minted for some other Auth0 application cannot be replayed here.
//   - Expiry is enforced with no leeway beyond a small clock skew.
func (v *Auth0Verifier) Verify(raw string) (*Auth0Claims, error) {
	claims := &Auth0Claims{}
	tok, err := jwt.ParseWithClaims(raw, claims, v.keyfunc.Keyfunc,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience(v.audience),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return nil, err
	}
	if !tok.Valid {
		return nil, errors.New("auth0: token invalid")
	}
	if strings.TrimSpace(claims.Subject) == "" {
		return nil, errors.New("auth0: token has no subject")
	}
	return claims, nil
}
