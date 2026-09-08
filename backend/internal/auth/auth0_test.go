package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// fakeAuth0 stands up a JWKS endpoint backed by a throwaway RSA key, so the
// verifier can be exercised exactly as it would be against a real tenant.
type fakeAuth0 struct {
	srv   *httptest.Server
	key   *rsa.PrivateKey
	keyID string
}

func newFakeAuth0(t *testing.T) *fakeAuth0 {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeAuth0{key: key, keyID: "test-key-1"}

	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/jwks.json", func(w http.ResponseWriter, r *http.Request) {
		n := base64.RawURLEncoding.EncodeToString(key.N.Bytes())
		e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]string{
				{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": f.keyID, "n": n, "e": e},
			},
		})
	})
	f.srv = httptest.NewServer(mux)
	return f
}

func (f *fakeAuth0) issuer() string { return f.srv.URL + "/" }

// sign mints a token with the given claims, signed by the fake tenant's key.
func (f *fakeAuth0) sign(t *testing.T, claims jwt.Claims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = f.keyID
	s, err := tok.SignedString(f.key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func (f *fakeAuth0) verifier(t *testing.T, audience string) *Auth0Verifier {
	t.Helper()
	// NewAuth0Verifier prefixes https:// and builds the JWKS URL itself, so
	// construct directly against the test server here.
	v, err := newVerifierForTest(context.Background(), f.issuer(), audience)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func goodClaims(iss, aud string) jwt.RegisteredClaims {
	return jwt.RegisteredClaims{
		Issuer:    iss,
		Subject:   "auth0|abc123",
		Audience:  jwt.ClaimStrings{aud},
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}
}

func TestVerifyAcceptsValidToken(t *testing.T) {
	f := newFakeAuth0(t)
	defer f.srv.Close()
	v := f.verifier(t, "https://api.simplysafelegacy.com")

	raw := f.sign(t, Auth0Claims{RegisteredClaims: goodClaims(f.issuer(), "https://api.simplysafelegacy.com")})
	claims, err := v.Verify(raw)
	if err != nil {
		t.Fatalf("valid token rejected: %v", err)
	}
	if claims.Subject != "auth0|abc123" {
		t.Fatalf("subject = %q", claims.Subject)
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	f := newFakeAuth0(t)
	defer f.srv.Close()
	v := f.verifier(t, "aud")

	c := goodClaims(f.issuer(), "aud")
	c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-2 * time.Hour))
	if _, err := v.Verify(f.sign(t, Auth0Claims{RegisteredClaims: c})); err == nil {
		t.Fatal("expired token accepted")
	}
}

func TestVerifyRejectsWrongAudience(t *testing.T) {
	f := newFakeAuth0(t)
	defer f.srv.Close()
	v := f.verifier(t, "https://api.simplysafelegacy.com")

	// A token minted for a different API in the same tenant must not work.
	raw := f.sign(t, Auth0Claims{RegisteredClaims: goodClaims(f.issuer(), "https://some-other-api")})
	if _, err := v.Verify(raw); err == nil {
		t.Fatal("token for another audience accepted")
	}
}

func TestVerifyRejectsWrongIssuer(t *testing.T) {
	f := newFakeAuth0(t)
	defer f.srv.Close()
	v := f.verifier(t, "aud")

	raw := f.sign(t, Auth0Claims{RegisteredClaims: goodClaims("https://evil.example.com/", "aud")})
	if _, err := v.Verify(raw); err == nil {
		t.Fatal("token from another issuer accepted")
	}
}

// The alg-confusion attack: re-sign the token with HS256 using the tenant's
// PUBLIC key as the HMAC secret. A verifier that doesn't pin the algorithm
// will happily validate it. WithValidMethods must stop this.
func TestVerifyRejectsAlgorithmConfusion(t *testing.T) {
	f := newFakeAuth0(t)
	defer f.srv.Close()
	v := f.verifier(t, "aud")

	pubDER := fmt.Sprintf("%d%s", f.key.E, f.key.N.String())
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, Auth0Claims{
		RegisteredClaims: goodClaims(f.issuer(), "aud"),
	})
	tok.Header["kid"] = f.keyID
	raw, err := tok.SignedString([]byte(pubDER))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := v.Verify(raw); err == nil {
		t.Fatal("HS256-signed token accepted — algorithm confusion possible")
	}
}

// A token signed by a key the tenant never published must fail.
func TestVerifyRejectsForeignKey(t *testing.T) {
	f := newFakeAuth0(t)
	defer f.srv.Close()
	v := f.verifier(t, "aud")

	attacker, _ := rsa.GenerateKey(rand.Reader, 2048)
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, Auth0Claims{
		RegisteredClaims: goodClaims(f.issuer(), "aud"),
	})
	tok.Header["kid"] = f.keyID // claim to be the real key
	raw, err := tok.SignedString(attacker)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := v.Verify(raw); err == nil {
		t.Fatal("token signed by an unknown key accepted")
	}
}

func TestVerifyRejectsNoneAlgorithm(t *testing.T) {
	f := newFakeAuth0(t)
	defer f.srv.Close()
	v := f.verifier(t, "aud")

	tok := jwt.NewWithClaims(jwt.SigningMethodNone, Auth0Claims{
		RegisteredClaims: goodClaims(f.issuer(), "aud"),
	})
	raw, err := tok.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := v.Verify(raw); err == nil {
		t.Fatal(`"alg: none" token accepted`)
	}
}

func TestVerifyRejectsMissingSubject(t *testing.T) {
	f := newFakeAuth0(t)
	defer f.srv.Close()
	v := f.verifier(t, "aud")

	c := goodClaims(f.issuer(), "aud")
	c.Subject = ""
	if _, err := v.Verify(f.sign(t, Auth0Claims{RegisteredClaims: c})); err == nil {
		t.Fatal("token without a subject accepted")
	}
}

func TestNewAuth0VerifierRequiresConfig(t *testing.T) {
	ctx := context.Background()
	if _, err := NewAuth0Verifier(ctx, "", "aud"); err == nil {
		t.Fatal("empty domain accepted")
	}
	if _, err := NewAuth0Verifier(ctx, "tenant.auth0.com", ""); err == nil {
		t.Fatal("empty audience accepted")
	}
}
