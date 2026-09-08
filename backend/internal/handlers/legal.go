package handlers

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"
)

// LegalDocumentVersion identifies the revision of the Terms of Service and
// Privacy Policy currently in force.
//
// Bump this when either document changes materially. Consent rows store the
// value that was current when the user accepted, so an old acceptance keeps
// pointing at the text it actually agreed to.
const LegalDocumentVersion = "2026-09-02"

// recordLegalConsent writes one acceptance row.
//
// All four flags are recorded together because the signup checkbox is a
// single control covering all four claims — terms, privacy, age, and
// residency. They are stored as separate columns so a row remains
// self-describing even after the checkbox copy changes.
//
// The timestamp is the database's NOW(), never a client-supplied value: a
// consent record is only evidence if the server vouches for when it was
// made.
func (d *Deps) recordLegalConsent(ctx context.Context, userID, version, ip, userAgent string) error {
	if version == "" {
		version = LegalDocumentVersion
	}
	_, err := d.DB.Exec(ctx, `
		INSERT INTO user_legal_consents
		    (user_id, accepted_terms, accepted_privacy,
		     attested_age_18, attested_nj_resident,
		     document_version, ip_address, user_agent)
		VALUES ($1, TRUE, TRUE, TRUE, TRUE, $2, $3, $4)
	`, userID, version, nullable(ip), nullable(userAgent))
	return err
}

// LegalConsentStatus is the shape returned by GET /api/legal/consent.
type LegalConsentStatus struct {
	Accepted        bool       `json:"accepted"`
	AcceptedAt      *time.Time `json:"acceptedAt,omitempty"`
	DocumentVersion *string    `json:"documentVersion,omitempty"`
	CurrentVersion  string     `json:"currentVersion"`

	// Eligibility attestations made alongside the acceptance: the user is
	// at least 18 and a New Jersey resident (Privacy Policy section 1).
	AttestedAge18      bool `json:"attestedAge18"`
	AttestedNJResident bool `json:"attestedNjResident"`
}

// latestLegalConsent reads the user's most recent acceptance, if any.
//
// "Accepted" requires all four claims. A row from before the eligibility
// columns existed (migration 015) has them FALSE and so does not count as a
// complete acceptance — which is correct: those users were never asked.
func (d *Deps) latestLegalConsent(ctx context.Context, userID string) (LegalConsentStatus, error) {
	out := LegalConsentStatus{CurrentVersion: LegalDocumentVersion}

	rows, err := d.DB.Query(ctx, `
		SELECT accepted_at, document_version,
		       attested_age_18, attested_nj_resident
		FROM user_legal_consents
		WHERE user_id = $1
		  AND accepted_terms AND accepted_privacy
		  AND attested_age_18 AND attested_nj_resident
		ORDER BY accepted_at DESC
		LIMIT 1
	`, userID)
	if err != nil {
		return out, err
	}
	defer rows.Close()

	if rows.Next() {
		var at time.Time
		var version string
		if err := rows.Scan(&at, &version, &out.AttestedAge18, &out.AttestedNJResident); err != nil {
			return out, err
		}
		out.Accepted = true
		out.AcceptedAt = &at
		out.DocumentVersion = &version
	}
	return out, rows.Err()
}

// GetLegalConsent reports whether the caller has accepted the terms.
func (d *Deps) GetLegalConsent(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(w, r)
	if !ok {
		return
	}
	status, err := d.latestLegalConsent(r.Context(), u.ID)
	if err != nil {
		d.internalError(w, r, err, "could not read consent record")
		return
	}
	writeJSON(w, http.StatusOK, status)
}

// AcceptLegal records the caller's acceptance of the Terms of Service and
// Privacy Policy.
//
// The SPA collects the checkbox on /signup *before* handing off to Auth0,
// then calls this once the account exists and it holds an access token.
// Both documents are accepted together, so there is no request body to
// trust — the endpoint records consent for the authenticated caller and
// stamps the server's own time.
func (d *Deps) AcceptLegal(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(w, r)
	if !ok {
		return
	}

	if err := d.recordLegalConsent(
		r.Context(), u.ID, LegalDocumentVersion,
		clientIP(r), r.UserAgent(),
	); err != nil {
		d.internalError(w, r, err, "could not record acceptance")
		return
	}

	d.Logger.Info("legal: consent recorded",
		"user_id", u.ID, "version", LegalDocumentVersion)

	status, err := d.latestLegalConsent(r.Context(), u.ID)
	if err != nil {
		// The write succeeded; failing the request now would invite a
		// duplicate acceptance on retry. Report the known-good outcome.
		now := time.Now().UTC()
		version := LegalDocumentVersion
		writeJSON(w, http.StatusOK, LegalConsentStatus{
			Accepted:           true,
			AcceptedAt:         &now,
			DocumentVersion:    &version,
			CurrentVersion:     LegalDocumentVersion,
			AttestedAge18:      true,
			AttestedNJResident: true,
		})
		return
	}
	writeJSON(w, http.StatusOK, status)
}

// clientIP extracts the caller's address, preferring the proxy headers Caddy
// sets. Returns "" when no usable address is found — the consent row's
// ip_address is nullable precisely because this can fail.
func clientIP(r *http.Request) string {
	// X-Forwarded-For is a comma-separated chain; the first entry is the
	// original client.
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		first := strings.TrimSpace(strings.Split(xff, ",")[0])
		if isIP(first) {
			return first
		}
	}
	if xr := strings.TrimSpace(r.Header.Get("X-Real-IP")); isIP(xr) {
		return xr
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && isIP(host) {
		return host
	}
	if isIP(r.RemoteAddr) {
		return r.RemoteAddr
	}
	return ""
}

func isIP(s string) bool {
	return s != "" && net.ParseIP(s) != nil
}
