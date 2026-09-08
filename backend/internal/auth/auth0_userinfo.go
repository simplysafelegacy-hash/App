package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Auth0Profile is the user profile returned by Auth0's /userinfo endpoint.
type Auth0Profile struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Nickname      string `json:"nickname"`
	Picture       string `json:"picture"`
}

// UserInfo fetches the profile for an access token from Auth0's /userinfo.
//
// Access tokens are not guaranteed to carry email or name claims, so a
// first-time sign-in asks Auth0 directly rather than trusting anything the
// client sends. The token is presented as-is; Auth0 answers only if it is
// valid and carries the openid/profile/email scopes.
func (v *Auth0Verifier) UserInfo(ctx context.Context, accessToken string) (*Auth0Profile, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.issuer+"userinfo", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth0 userinfo: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("auth0 userinfo: unexpected status %d", resp.StatusCode)
	}

	var p Auth0Profile
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		return nil, fmt.Errorf("auth0 userinfo: decode: %w", err)
	}
	p.Email = strings.ToLower(strings.TrimSpace(p.Email))
	if p.Name == "" {
		p.Name = p.Nickname
	}
	return &p, nil
}
