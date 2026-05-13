package handlers

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/simplysafelegacy/backend/internal/auth"
	"github.com/simplysafelegacy/backend/internal/models"
)

type googleAuthReq struct {
	Code string `json:"code"`
}

type registerReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResp struct {
	Token string      `json:"token"`
	User  models.User `json:"user"`
}

// Minimum password length. Deliberately low (12) so older users can pick
// memorable passphrases; argon2id absorbs the brute-force cost. MFA will
// be the second layer when added.
const minPasswordLen = 12

// errEmailTaken signals that a register attempt collided with an existing
// account. We never set a password on an existing row through register —
// that would let anyone claim an unverified email and lock the real owner
// out. Linking is handled by signing in with the original method first.
var errEmailTaken = errors.New("email already registered")

// Loose email shape check. The real validation is "can you receive mail
// at this address," which we don't enforce yet — email verification is
// deferred until we wire up an email provider.
var emailRE = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

// GoogleAuth exchanges an authorization code (received from Google in the
// browser via @react-oauth/google's popup flow) for tokens, verifies the
// ID token, then either creates a new user or links an existing one.
//
// Account-linking rules:
//   - If a user with the same google_sub exists → log them in.
//   - Else if a user with the matching verified email exists → bind
//     google_sub onto that row and log them in (account merge).
//   - Else create a new user.
//
// In every case we issue our own JWT — Google's token is not used after
// this handler returns.
func (d *Deps) GoogleAuth(w http.ResponseWriter, r *http.Request) {
	var req googleAuthReq
	if err := decodeBody(r, &req); err != nil || strings.TrimSpace(req.Code) == "" {
		writeError(w, http.StatusBadRequest, "code is required")
		return
	}

	profile, err := d.Google.ExchangeCode(r.Context(), req.Code)
	if err != nil {
		d.Logger.Warn("google code exchange failed", "err", err)
		writeError(w, http.StatusUnauthorized, "could not verify Google sign-in")
		return
	}
	if profile.Email == "" || !profile.EmailVerified {
		writeError(w, http.StatusUnauthorized, "Google account email is not verified")
		return
	}

	basic, err := d.upsertGoogleUser(r.Context(), profile)
	if err != nil {
		d.internalError(w, r, err, "failed to provision account")
		return
	}
	user, err := loadUser(r.Context(), d, basic.ID)
	if err != nil {
		d.internalError(w, r, err, "failed to load user after sign-in")
		return
	}
	tok, err := d.Auth.Issue(user.ID, user.Email)
	if err != nil {
		d.internalError(w, r, err, "failed to issue token")
		return
	}
	writeJSON(w, http.StatusOK, authResp{Token: tok, User: user})
}

// upsertGoogleUser implements the find/link/create flow. Runs in a
// transaction so the optional email-based link and the pending-invite
// claim happen atomically.
func (d *Deps) upsertGoogleUser(ctx context.Context, p *auth.GoogleProfile) (models.User, error) {
	tx, err := d.DB.Begin(ctx)
	if err != nil {
		return models.User{}, err
	}
	defer tx.Rollback(ctx)

	var user models.User

	// 1. Try google_sub.
	err = tx.QueryRow(ctx, `
		SELECT id, email, name, phone, avatar_url
		FROM users WHERE google_sub = $1
	`, p.Sub).Scan(&user.ID, &user.Email, &user.Name, &user.Phone, &user.AvatarURL)

	switch {
	case err == nil:
		// Refresh avatar/name in case Google's copy moved on.
		if _, err := tx.Exec(ctx, `
			UPDATE users SET avatar_url = $1, name = COALESCE(NULLIF($2,''), name)
			WHERE id = $3
		`, nullable(p.Picture), p.Name, user.ID); err != nil {
			return models.User{}, err
		}
		if p.Picture != "" {
			user.AvatarURL = &p.Picture
		}

	case errors.Is(err, pgx.ErrNoRows):
		// 2. Try email — link existing account.
		err = tx.QueryRow(ctx, `
			UPDATE users
			SET google_sub = $1,
			    avatar_url = COALESCE($2, avatar_url),
			    name       = COALESCE(NULLIF($3,''), name)
			WHERE email = $4
			RETURNING id, email, name, phone, avatar_url
		`, p.Sub, nullable(p.Picture), p.Name, strings.ToLower(p.Email)).
			Scan(&user.ID, &user.Email, &user.Name, &user.Phone, &user.AvatarURL)

		if errors.Is(err, pgx.ErrNoRows) {
			// 3. Brand-new user.
			if err = tx.QueryRow(ctx, `
				INSERT INTO users (email, name, google_sub, avatar_url)
				VALUES ($1, $2, $3, $4)
				RETURNING id, email, name, phone, avatar_url
			`, strings.ToLower(p.Email), p.Name, p.Sub, nullable(p.Picture)).
				Scan(&user.ID, &user.Email, &user.Name, &user.Phone, &user.AvatarURL); err != nil {
				return models.User{}, err
			}
		} else if err != nil {
			return models.User{}, err
		}

	default:
		return models.User{}, err
	}

	// Claim any vault invitations addressed to this email.
	if _, err := tx.Exec(ctx, `
		UPDATE vault_members SET user_id = $1
		WHERE email = $2 AND user_id IS NULL
	`, user.ID, user.Email); err != nil {
		return models.User{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return models.User{}, err
	}
	return user, nil
}

// Register creates a new account with an email + password. Rejects any
// email that already has an account — including Google-only rows — so a
// stranger can't claim someone else's email and ride along when the real
// owner later signs in with Google.
func (d *Deps) Register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	name := strings.TrimSpace(req.Name)
	if !emailRE.MatchString(email) {
		writeError(w, http.StatusBadRequest, "enter a valid email address")
		return
	}
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if len(req.Password) < minPasswordLen {
		writeError(w, http.StatusBadRequest, "password must be at least 12 characters")
		return
	}

	hash, err := d.Auth.HashPassword(req.Password)
	if err != nil {
		d.internalError(w, r, err, "failed to hash password")
		return
	}

	user, err := d.createPasswordUser(r.Context(), email, name, hash)
	if err != nil {
		if errors.Is(err, errEmailTaken) {
			writeError(w, http.StatusConflict, "an account with that email already exists — try signing in")
			return
		}
		d.internalError(w, r, err, "failed to create account")
		return
	}

	tok, err := d.Auth.Issue(user.ID, user.Email)
	if err != nil {
		d.internalError(w, r, err, "failed to issue token")
		return
	}
	writeJSON(w, http.StatusOK, authResp{Token: tok, User: user})
}

// Login verifies an email + password pair. Every failure mode returns
// the same opaque message to avoid leaking which emails are registered
// or whether an account has a password set.
func (d *Deps) Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || req.Password == "" {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	var (
		userID       string
		userEmail    string
		passwordHash *string
	)
	err := d.DB.QueryRow(r.Context(), `
		SELECT id, email, password_hash FROM users WHERE email = $1
	`, email).Scan(&userID, &userEmail, &passwordHash)
	if err != nil {
		if isNoRows(err) {
			writeError(w, http.StatusUnauthorized, "invalid email or password")
			return
		}
		d.internalError(w, r, err, "failed to look up account")
		return
	}
	if passwordHash == nil || !d.Auth.CheckPassword(*passwordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	user, err := loadUser(r.Context(), d, userID)
	if err != nil {
		d.internalError(w, r, err, "failed to load user")
		return
	}
	tok, err := d.Auth.Issue(user.ID, user.Email)
	if err != nil {
		d.internalError(w, r, err, "failed to issue token")
		return
	}
	writeJSON(w, http.StatusOK, authResp{Token: tok, User: user})
}

func (d *Deps) createPasswordUser(ctx context.Context, email, name, hash string) (models.User, error) {
	tx, err := d.DB.Begin(ctx)
	if err != nil {
		return models.User{}, err
	}
	defer tx.Rollback(ctx)

	var user models.User
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, name, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id, email, name, phone, avatar_url
	`, email, name, hash).Scan(&user.ID, &user.Email, &user.Name, &user.Phone, &user.AvatarURL)
	if err != nil {
		// 23505 = unique_violation on users_email_key.
		if strings.Contains(err.Error(), "users_email_key") || strings.Contains(err.Error(), "23505") {
			return models.User{}, errEmailTaken
		}
		return models.User{}, err
	}

	// Claim any vault invitations addressed to this email.
	if _, err := tx.Exec(ctx, `
		UPDATE vault_members SET user_id = $1
		WHERE email = $2 AND user_id IS NULL
	`, user.ID, user.Email); err != nil {
		return models.User{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return models.User{}, err
	}
	return user, nil
}

// Me returns the authenticated user's profile.
func (d *Deps) Me(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(w, r)
	if !ok {
		return
	}
	user, err := loadUser(r.Context(), d, u.ID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

// loadUser hydrates the full User model — basic profile + subscription
// state. Used by every endpoint that returns a user payload, so the SPA
// always sees current plan/status.
func loadUser(ctx context.Context, d *Deps, id string) (models.User, error) {
	var user models.User
	err := d.DB.QueryRow(ctx, `
		SELECT id, email, name, phone, avatar_url,
		       subscription_status, subscription_plan, current_period_end, trial_end
		FROM users WHERE id = $1
	`, id).Scan(
		&user.ID, &user.Email, &user.Name, &user.Phone, &user.AvatarURL,
		&user.SubscriptionStatus, &user.SubscriptionPlan,
		&user.CurrentPeriodEnd, &user.TrialEnd,
	)
	return user, err
}

// nullable converts an empty string to a typed nil so pgx writes SQL NULL
// rather than the empty string.
func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
