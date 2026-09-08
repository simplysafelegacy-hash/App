package handlers

import (
	"context"
	"net/http"

	"github.com/simplysafelegacy/backend/internal/models"
)

// Authentication is handled by Auth0.
//
// The SPA obtains an access token from Auth0 and sends it as a bearer token;
// auth.Auth0Middleware verifies it against the tenant's JWKS and maps the
// subject onto a local users row (see auth0.go). This backend never sees,
// stores, or verifies a password — there is no register, login, password
// reset, or session-issuing endpoint left to attack.
//
// Everything downstream still calls UserFrom(ctx), so authorization rules
// (vault ownership, admin, document permissions) are unchanged.

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
		SELECT u.id, u.email, u.name, u.phone, u.avatar_url, u.is_admin,
		       u.subscription_status, u.subscription_plan,
		       u.current_period_end, u.trial_end,
		       (SELECT MAX(c.accepted_at)
		          FROM user_legal_consents c
		         WHERE c.user_id = u.id
		           AND c.accepted_terms AND c.accepted_privacy
		           AND c.attested_age_18 AND c.attested_nj_resident)
		FROM users u WHERE u.id = $1
	`, id).Scan(
		&user.ID, &user.Email, &user.Name, &user.Phone, &user.AvatarURL, &user.IsAdmin,
		&user.SubscriptionStatus, &user.SubscriptionPlan,
		&user.CurrentPeriodEnd, &user.TrialEnd,
		&user.LegalAcceptedAt,
	)
	if err != nil {
		return user, err
	}
	limits, err := d.effectivePlanLimits(ctx, id)
	if err != nil {
		return user, err
	}
	user.PlanLimits = &limits
	user.SubscriptionPlan = &limits.PlanCode
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
