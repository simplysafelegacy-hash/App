package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/sealed/backend/internal/models"
)

type createVaultReq struct {
	Name                  string `json:"name"`
	FullName              string `json:"fullName"`
	Email                 string `json:"email"`
	Phone                 string `json:"phone"`
	EmergencyContactName  string `json:"emergencyContactName"`
	EmergencyContactPhone string `json:"emergencyContactPhone"`
}

// GetVault returns the active (X-Vault-Id) vault. Successors who have not
// yet been released receive a sealed view with no documents or members.
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

	// Successors before release see a sealed shell.
	if !v.CanRead() {
		full.Documents = []models.Document{}
		full.Members = []models.VaultMember{}
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
		          emergency_contact_name, emergency_contact_phone, released_at, created_at
	`,
		u.ID, req.Name, req.FullName, req.Email, req.Phone,
		req.EmergencyContactName, req.EmergencyContactPhone,
	).Scan(
		&v.ID, &v.Name, &v.OwnerID, &v.OwnerName, &v.OwnerEmail, &v.OwnerPhone,
		&v.EmergencyContactName, &v.EmergencyContactPhone, &v.ReleasedAt, &v.CreatedAt,
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

	v.Documents = []models.Document{}
	v.Members = []models.VaultMember{}
	writeJSON(w, http.StatusCreated, v)
}

// ReleaseVault unseals the vault. After this point successors gain read +
// download access; stewards already had it. Reversible: pass {released:false}
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

// loadVault returns a fully hydrated vault — documents, members, the lot.
// Callers are responsible for scrubbing any fields the requester may not see.
func loadVault(ctx context.Context, d *Deps, vaultID string) (*models.Vault, error) {
	var v models.Vault
	err := d.DB.QueryRow(ctx, `
		SELECT id, name, owner_id, owner_name, owner_email, owner_phone,
		       emergency_contact_name, emergency_contact_phone, released_at, created_at
		FROM vaults WHERE id = $1
	`, vaultID).Scan(
		&v.ID, &v.Name, &v.OwnerID, &v.OwnerName, &v.OwnerEmail, &v.OwnerPhone,
		&v.EmergencyContactName, &v.EmergencyContactPhone, &v.ReleasedAt, &v.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	docs, err := listDocuments(ctx, d, vaultID)
	if err != nil {
		return nil, err
	}
	v.Documents = docs

	members, err := listMembers(ctx, d, vaultID)
	if err != nil {
		return nil, err
	}
	v.Members = members

	return &v, nil
}
