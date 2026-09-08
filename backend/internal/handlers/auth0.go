package handlers

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/simplysafelegacy/backend/internal/auth"
)

// auth0UserCache memoises sub -> local user so a burst of API calls does not
// hit Postgres (and possibly Auth0's /userinfo) on every single request.
//
// Entries are small and short-lived: a user's id and email do not change
// mid-session, and anything that *does* change — subscription, admin flag,
// permissions — is read fresh from the database by the handlers themselves,
// never from this cache. So a stale entry cannot grant stale authority.
type auth0UserCache struct {
	mu  sync.RWMutex
	ttl time.Duration
	m   map[string]auth0CacheEntry
}

type auth0CacheEntry struct {
	user      auth.CtxUser
	expiresAt time.Time
}

func newAuth0UserCache(ttl time.Duration) *auth0UserCache {
	return &auth0UserCache{ttl: ttl, m: make(map[string]auth0CacheEntry)}
}

func (c *auth0UserCache) get(sub string) (auth.CtxUser, bool) {
	c.mu.RLock()
	e, ok := c.m[sub]
	c.mu.RUnlock()
	if !ok || time.Now().After(e.expiresAt) {
		return auth.CtxUser{}, false
	}
	return e.user, true
}

func (c *auth0UserCache) put(sub string, u auth.CtxUser) {
	c.mu.Lock()
	// Bound the map so a flood of distinct subjects can't grow it without
	// limit; the cache is an optimisation, so dropping it wholesale is fine.
	if len(c.m) > 10000 {
		c.m = make(map[string]auth0CacheEntry)
	}
	c.m[sub] = auth0CacheEntry{user: u, expiresAt: time.Now().Add(c.ttl)}
	c.mu.Unlock()
}

// ErrAuth0EmailUnverified is returned when Auth0 reports an unverified email.
var ErrAuth0EmailUnverified = errors.New("auth0: email not verified")

// ResolveAuth0User maps a verified Auth0 subject onto a local users row,
// provisioning one on first sign-in.
//
// Linking rules, in order:
//
//  1. auth0_sub matches   -> that user. The normal path.
//  2. verified email matches an existing row -> bind auth0_sub onto it.
//     This is how pre-Auth0 accounts keep their vaults: the row (and so
//     vaults.owner_id) is preserved, only the login method changes.
//  3. otherwise -> create a new user.
//
// Rule 2 is the dangerous one and is why an unverified email is refused
// outright: if Auth0 let someone sign up as victim@example.com without
// proving control of it, matching on email would hand them the victim's
// vault. Requiring email_verified means Auth0 has already proven ownership.
func (d *Deps) ResolveAuth0User(ctx context.Context, sub, token string) (auth.CtxUser, error) {
	if u, ok := d.auth0Cache.get(sub); ok {
		return u, nil
	}

	// Fast path: already linked. Avoids a /userinfo round trip per login.
	var u auth.CtxUser
	err := d.DB.QueryRow(ctx, `
		SELECT id, email FROM users WHERE auth0_sub = $1
	`, sub).Scan(&u.ID, &u.Email)
	if err == nil {
		d.auth0Cache.put(sub, u)
		return u, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return auth.CtxUser{}, err
	}

	// First sign-in for this subject: ask Auth0 who they are.
	profile, err := d.Auth0.UserInfo(ctx, token)
	if err != nil {
		return auth.CtxUser{}, err
	}
	if profile.Sub != sub {
		// The token's subject and the profile's must agree; a mismatch means
		// the token was not issued for this profile.
		return auth.CtxUser{}, fmt.Errorf("auth0: subject mismatch")
	}
	if profile.Email == "" || !profile.EmailVerified {
		d.Logger.Warn("auth0 sign-in refused: unverified email",
			"sub", sub, "has_email", profile.Email != "")
		return auth.CtxUser{}, ErrAuth0EmailUnverified
	}

	u, err = d.linkOrCreateAuth0User(ctx, sub, profile)
	if err != nil {
		return auth.CtxUser{}, err
	}
	d.auth0Cache.put(sub, u)
	return u, nil
}

func (d *Deps) linkOrCreateAuth0User(ctx context.Context, sub string, p *auth.Auth0Profile) (auth.CtxUser, error) {
	tx, err := d.DB.Begin(ctx)
	if err != nil {
		return auth.CtxUser{}, err
	}
	defer tx.Rollback(ctx)

	var u auth.CtxUser
	email := strings.ToLower(strings.TrimSpace(p.Email))

	// Link an existing account by verified email, but only if it has not
	// already been claimed by a different Auth0 subject. Without that guard,
	// two Auth0 connections sharing an email (e.g. a database user and a
	// Google user) would fight over one row.
	err = tx.QueryRow(ctx, `
		UPDATE users
		SET auth0_sub  = $1,
		    avatar_url = COALESCE(NULLIF($2,''), avatar_url),
		    name       = COALESCE(NULLIF($3,''), name)
		WHERE email = $4 AND auth0_sub IS NULL
		RETURNING id, email
	`, sub, p.Picture, p.Name, email).Scan(&u.ID, &u.Email)

	switch {
	case err == nil:
		d.Logger.Info("auth0: linked existing account", "sub", sub, "user_id", u.ID)

	case errors.Is(err, pgx.ErrNoRows):
		// No unclaimed row with that email — create a new user.
		name := p.Name
		if name == "" {
			name = email
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO users (email, name, auth0_sub, avatar_url)
			VALUES ($1, $2, $3, NULLIF($4,''))
			RETURNING id, email
		`, email, name, sub, p.Picture).Scan(&u.ID, &u.Email)
		if err != nil {
			// A row with this email exists but is bound to another subject.
			if strings.Contains(err.Error(), "users_email_key") {
				return auth.CtxUser{}, fmt.Errorf(
					"auth0: email %s is already linked to a different identity", email)
			}
			return auth.CtxUser{}, err
		}
		d.Logger.Info("auth0: provisioned new account", "sub", sub, "user_id", u.ID)

	default:
		return auth.CtxUser{}, err
	}

	// Claim any vault invitations addressed to this email — same behaviour
	// the password and Google flows had.
	if _, err := tx.Exec(ctx, `
		UPDATE vault_members SET user_id = $1
		WHERE email = $2 AND user_id IS NULL
	`, u.ID, u.Email); err != nil {
		return auth.CtxUser{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return auth.CtxUser{}, err
	}
	return u, nil
}
