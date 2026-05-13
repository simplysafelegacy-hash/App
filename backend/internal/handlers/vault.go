package handlers

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/simplysafelegacy/backend/internal/models"
)

type createVaultReq struct {
	Name                  string `json:"name"`
	FullName              string `json:"fullName"`
	Email                 string `json:"email"`
	Phone                 string `json:"phone"`
	EmergencyContactName  string `json:"emergencyContactName"`
	EmergencyContactPhone string `json:"emergencyContactPhone"`
}

type updateWillReq struct {
	HasWill             bool   `json:"hasWill"`
	LocationType        string `json:"locationType"`
	LocationAddress     string `json:"locationAddress"`
	LocationDescription string `json:"locationDescription"`
}

// GetVault returns the active (X-Vault-Id) vault. Successors who have not
// yet been released receive a sealed shell with members + will scrubbed.
func (d *Deps) GetVault(w http.ResponseWriter, r *http.Request) {
	v, ok := requireVault(w, r)
	if !ok {
		return
	}
	full, err := loadVault(r.Context(), d, v.VaultID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "vault not found")
			return
		}
		d.internalError(w, r, err, "failed to load vault")
		return
	}

	if !v.CanRead() {
		full.Members = []models.VaultMember{}
		full.Will = models.Will{}
		full.EmergencyContactName = ""
		full.EmergencyContactPhone = ""
		full.OwnerEmail = ""
		full.OwnerPhone = ""
	}
	writeJSON(w, http.StatusOK, full)
}

// CreateVault provisions the caller's own vault. Each user has at most one
// vault they own. Re-posting updates contact details. The owner is recorded
// as a 'owner' member so all access checks read from one table.
func (d *Deps) CreateVault(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(w, r)
	if !ok {
		return
	}
	var req createVaultReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.FullName == "" || req.Email == "" || req.Phone == "" ||
		req.EmergencyContactName == "" || req.EmergencyContactPhone == "" {
		writeError(w, http.StatusBadRequest, "all fields are required")
		return
	}
	if req.Name == "" {
		req.Name = req.FullName + "'s vault"
	}

	ctx := r.Context()
	tx, err := d.DB.Begin(ctx)
	if err != nil {
		d.internalError(w, r, err, "could not begin transaction")
		return
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE users SET name = $1, phone = $2 WHERE id = $3
	`, req.FullName, req.Phone, u.ID); err != nil {
		d.internalError(w, r, err, "failed to update user")
		return
	}

	var v models.Vault
	err = tx.QueryRow(ctx, `
		INSERT INTO vaults (
			owner_id, name, owner_name, owner_email, owner_phone,
			emergency_contact_name, emergency_contact_phone
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (owner_id) DO UPDATE SET
			name = EXCLUDED.name,
			owner_name = EXCLUDED.owner_name,
			owner_email = EXCLUDED.owner_email,
			owner_phone = EXCLUDED.owner_phone,
			emergency_contact_name = EXCLUDED.emergency_contact_name,
			emergency_contact_phone = EXCLUDED.emergency_contact_phone
		RETURNING id, name, owner_id, owner_name, owner_email, owner_phone,
		          emergency_contact_name, emergency_contact_phone, released_at, created_at,
		          has_will, COALESCE(will_location_type,''), COALESCE(will_location_address,''),
		          COALESCE(will_location_description,''), will_updated_at
	`,
		u.ID, req.Name, req.FullName, req.Email, req.Phone,
		req.EmergencyContactName, req.EmergencyContactPhone,
	).Scan(
		&v.ID, &v.Name, &v.OwnerID, &v.OwnerName, &v.OwnerEmail, &v.OwnerPhone,
		&v.EmergencyContactName, &v.EmergencyContactPhone, &v.ReleasedAt, &v.CreatedAt,
		&v.Will.HasWill, &v.Will.LocationType, &v.Will.LocationAddress,
		&v.Will.LocationDescription, &v.Will.UpdatedAt,
	)
	if err != nil {
		d.internalError(w, r, err, "failed to create vault")
		return
	}

	// Idempotent owner-membership row.
	if _, err := tx.Exec(ctx, `
		INSERT INTO vault_members (vault_id, user_id, name, email, role)
		VALUES ($1, $2, $3, $4, 'owner')
		ON CONFLICT (vault_id, email) DO UPDATE SET
			role = 'owner', user_id = EXCLUDED.user_id, name = EXCLUDED.name
	`, v.ID, u.ID, req.FullName, req.Email); err != nil {
		d.internalError(w, r, err, "failed to record owner membership")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		d.internalError(w, r, err, "failed to commit")
		return
	}

	v.Members = []models.VaultMember{}
	writeJSON(w, http.StatusCreated, v)
}

// UpdateWill records (or unsets) the will for the active vault. Owner-only.
// hasWill=false clears the location fields; hasWill=true requires at least
// a location type so the entry is meaningful.
func (d *Deps) UpdateWill(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	var req updateWillReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.LocationType = strings.TrimSpace(req.LocationType)
	req.LocationAddress = strings.TrimSpace(req.LocationAddress)
	req.LocationDescription = strings.TrimSpace(req.LocationDescription)

	if req.HasWill && req.LocationType == "" {
		writeError(w, http.StatusBadRequest, "locationType is required when hasWill is true")
		return
	}

	var (
		locationType, locationAddress, locationDescription *string
		updatedAt                                          *time.Time
	)
	if req.HasWill {
		locationType = strPtr(req.LocationType)
		locationAddress = strPtr(req.LocationAddress)
		locationDescription = strPtr(req.LocationDescription)
		now := time.Now()
		updatedAt = &now
	}

	if _, err := d.DB.Exec(r.Context(), `
		UPDATE vaults SET
			has_will                  = $1,
			will_location_type        = $2,
			will_location_address     = $3,
			will_location_description = $4,
			will_updated_at           = $5
		WHERE id = $6
	`, req.HasWill, locationType, locationAddress, locationDescription, updatedAt, v.VaultID); err != nil {
		d.internalError(w, r, err, "failed to update will")
		return
	}

	_ = pushNotification(r.Context(), d, currentUserID(r), &v.VaultID, "will_updated", "Will details updated")

	writeJSON(w, http.StatusOK, models.Will{
		HasWill:             req.HasWill,
		LocationType:        req.LocationType,
		LocationAddress:     req.LocationAddress,
		LocationDescription: req.LocationDescription,
		UpdatedAt:           updatedAt,
	})
}

// ReleaseVault unseals the vault. After this point successors gain read
// access; stewards already had it. Reversible: pass {released:false}
// to re-seal.
func (d *Deps) ReleaseVault(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	var body struct {
		Released bool `json:"released"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var releasedAt *time.Time
	if body.Released {
		now := time.Now()
		releasedAt = &now
	}
	if _, err := d.DB.Exec(r.Context(),
		`UPDATE vaults SET released_at = $1 WHERE id = $2`,
		releasedAt, v.VaultID,
	); err != nil {
		d.internalError(w, r, err, "failed to update release state")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"releasedAt": releasedAt})
}

// loadVault returns the vault row + member list. Callers are responsible
// for scrubbing any fields the requester may not see.
func loadVault(ctx context.Context, d *Deps, vaultID string) (*models.Vault, error) {
	var v models.Vault
	err := d.DB.QueryRow(ctx, `
		SELECT id, name, owner_id, owner_name, owner_email, owner_phone,
		       emergency_contact_name, emergency_contact_phone, released_at, created_at,
		       has_will, COALESCE(will_location_type,''), COALESCE(will_location_address,''),
		       COALESCE(will_location_description,''), will_updated_at
		FROM vaults WHERE id = $1
	`, vaultID).Scan(
		&v.ID, &v.Name, &v.OwnerID, &v.OwnerName, &v.OwnerEmail, &v.OwnerPhone,
		&v.EmergencyContactName, &v.EmergencyContactPhone, &v.ReleasedAt, &v.CreatedAt,
		&v.Will.HasWill, &v.Will.LocationType, &v.Will.LocationAddress,
		&v.Will.LocationDescription, &v.Will.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	members, err := listMembers(ctx, d, vaultID)
	if err != nil {
		return nil, err
	}
	v.Members = members

	return &v, nil
}

func strPtr(s string) *string { return &s }
