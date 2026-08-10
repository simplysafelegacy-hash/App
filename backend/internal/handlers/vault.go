package handlers

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
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

type updateDocumentReq struct {
	HasDocument         bool   `json:"hasDocument"`
	LocationType        string `json:"locationType"`
	LocationAddress     string `json:"locationAddress"`
	LocationDescription string `json:"locationDescription"`
}

// GetVault returns the active (X-Vault-Id) vault. Successors who have not
// yet been released receive a sealed shell with members + documents scrubbed.
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
		full.Documents = []models.VaultDocument{}
		full.Attachments = []models.VaultAttachment{}
		full.Entries = []models.VaultEntry{}
		full.Funeral = models.FuneralWishes{}
		full.EmergencyContactName = ""
		full.EmergencyContactPhone = ""
		full.OwnerEmail = ""
		full.OwnerPhone = ""
		if v.ShouldMaskVaultIdentity() {
			full.Name = "Sealed vault"
			full.OwnerName = "Vault owner"
		}
	} else {
		filterDocumentsForAccess(full, v)
		if !v.CanModify() {
			full.Members = []models.VaultMember{}
		}
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

	var (
		v      models.Vault
		poa    models.VaultDocument
		health models.VaultDocument
	)
	poa.Type = "power_of_attorney"
	health.Type = "health_care_directive"
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
		          COALESCE(will_location_description,''), will_updated_at,
		          has_power_of_attorney, COALESCE(poa_location_type,''), COALESCE(poa_location_address,''),
		          COALESCE(poa_location_description,''), poa_updated_at,
		          has_health_care_directive, COALESCE(health_care_location_type,''), COALESCE(health_care_location_address,''),
		          COALESCE(health_care_location_description,''), health_care_updated_at
	`,
		u.ID, req.Name, req.FullName, req.Email, req.Phone,
		req.EmergencyContactName, req.EmergencyContactPhone,
	).Scan(
		&v.ID, &v.Name, &v.OwnerID, &v.OwnerName, &v.OwnerEmail, &v.OwnerPhone,
		&v.EmergencyContactName, &v.EmergencyContactPhone, &v.ReleasedAt, &v.CreatedAt,
		&v.Will.HasWill, &v.Will.LocationType, &v.Will.LocationAddress,
		&v.Will.LocationDescription, &v.Will.UpdatedAt,
		&poa.HasDocument, &poa.LocationType, &poa.LocationAddress,
		&poa.LocationDescription, &poa.UpdatedAt,
		&health.HasDocument, &health.LocationType, &health.LocationAddress,
		&health.LocationDescription, &health.UpdatedAt,
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
	v.Documents = documentsFromFields(v.Will, poa, health)
	v.Attachments = []models.VaultAttachment{}
	v.Entries = []models.VaultEntry{}
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
	limits, err := d.effectivePlanLimits(r.Context(), currentUserID(r))
	if err != nil {
		d.internalError(w, r, err, "failed to load plan limits")
		return
	}
	if req.HasWill && !documentAllowedByPlan(limits, "will") {
		writeError(w, http.StatusForbidden, documentPlanError("will"))
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

func (d *Deps) UpdateDocument(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	documentType := strings.TrimSpace(chi.URLParam(r, "type"))
	spec, ok := documentSpecFor(documentType)
	if !ok {
		writeError(w, http.StatusBadRequest, "unsupported document type")
		return
	}
	var req updateDocumentReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.LocationType = strings.TrimSpace(req.LocationType)
	req.LocationAddress = strings.TrimSpace(req.LocationAddress)
	req.LocationDescription = strings.TrimSpace(req.LocationDescription)

	if req.HasDocument && req.LocationType == "" {
		writeError(w, http.StatusBadRequest, "locationType is required when hasDocument is true")
		return
	}
	limits, err := d.effectivePlanLimits(r.Context(), currentUserID(r))
	if err != nil {
		d.internalError(w, r, err, "failed to load plan limits")
		return
	}
	if req.HasDocument && !documentAllowedByPlan(limits, spec.documentType) {
		writeError(w, http.StatusForbidden, documentPlanError(spec.documentType))
		return
	}

	var (
		locationType, locationAddress, locationDescription *string
		updatedAt                                          *time.Time
	)
	if req.HasDocument {
		locationType = strPtr(req.LocationType)
		locationAddress = strPtr(req.LocationAddress)
		locationDescription = strPtr(req.LocationDescription)
		now := time.Now()
		updatedAt = &now
	}

	if _, err := d.DB.Exec(r.Context(), spec.updateSQL,
		req.HasDocument, locationType, locationAddress, locationDescription, updatedAt, v.VaultID); err != nil {
		d.internalError(w, r, err, "failed to update document")
		return
	}

	_ = pushNotification(r.Context(), d, currentUserID(r), &v.VaultID, "document_updated", "Document details updated")

	writeJSON(w, http.StatusOK, models.VaultDocument{
		Type:                spec.documentType,
		HasDocument:         req.HasDocument,
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
	tx, err := d.DB.Begin(r.Context())
	if err != nil {
		d.internalError(w, r, err, "failed to begin release update")
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(),
		`UPDATE vaults SET released_at = $1 WHERE id = $2`,
		releasedAt, v.VaultID,
	); err != nil {
		d.internalError(w, r, err, "failed to update release state")
		return
	}
	if !body.Released {
		if _, err := tx.Exec(r.Context(),
			`DELETE FROM vault_document_releases WHERE vault_id = $1`,
			v.VaultID,
		); err != nil {
			d.internalError(w, r, err, "failed to clear document releases")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		d.internalError(w, r, err, "failed to finish release update")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"releasedAt":        releasedAt,
		"releasedDocuments": []string{},
	})
}

func (d *Deps) ResealDocumentRelease(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	documentType := strings.TrimSpace(chi.URLParam(r, "type"))
	if _, ok := documentSpecFor(documentType); !ok {
		writeError(w, http.StatusBadRequest, "unsupported document type")
		return
	}
	if _, err := d.DB.Exec(r.Context(), `
		DELETE FROM vault_document_releases
		WHERE vault_id = $1 AND document_type = $2
	`, v.VaultID, documentType); err != nil {
		d.internalError(w, r, err, "failed to re-seal document")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"documentType": documentType})
}

// loadVault returns the vault row + member list. Callers are responsible
// for scrubbing any fields the requester may not see.
func loadVault(ctx context.Context, d *Deps, vaultID string) (*models.Vault, error) {
	var (
		v      models.Vault
		poa    models.VaultDocument
		health models.VaultDocument
	)
	poa.Type = "power_of_attorney"
	health.Type = "health_care_directive"
	err := d.DB.QueryRow(ctx, `
		SELECT id, name, owner_id, owner_name, owner_email, owner_phone,
		       emergency_contact_name, emergency_contact_phone, released_at, created_at,
		       has_will, COALESCE(will_location_type,''), COALESCE(will_location_address,''),
		       COALESCE(will_location_description,''), will_updated_at,
		       has_power_of_attorney, COALESCE(poa_location_type,''), COALESCE(poa_location_address,''),
		       COALESCE(poa_location_description,''), poa_updated_at,
		       has_health_care_directive, COALESCE(health_care_location_type,''), COALESCE(health_care_location_address,''),
		       COALESCE(health_care_location_description,''), health_care_updated_at
		FROM vaults WHERE id = $1
	`, vaultID).Scan(
		&v.ID, &v.Name, &v.OwnerID, &v.OwnerName, &v.OwnerEmail, &v.OwnerPhone,
		&v.EmergencyContactName, &v.EmergencyContactPhone, &v.ReleasedAt, &v.CreatedAt,
		&v.Will.HasWill, &v.Will.LocationType, &v.Will.LocationAddress,
		&v.Will.LocationDescription, &v.Will.UpdatedAt,
		&poa.HasDocument, &poa.LocationType, &poa.LocationAddress,
		&poa.LocationDescription, &poa.UpdatedAt,
		&health.HasDocument, &health.LocationType, &health.LocationAddress,
		&health.LocationDescription, &health.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	members, err := listMembers(ctx, d, vaultID)
	if err != nil {
		return nil, err
	}
	v.Members = members
	v.Documents = documentsFromFields(v.Will, poa, health)

	attachments, err := listVaultAttachments(ctx, d, vaultID)
	if err != nil {
		return nil, err
	}
	v.Attachments = attachments

	entries, err := listAllVaultEntries(ctx, d, vaultID)
	if err != nil {
		return nil, err
	}
	v.Entries = entries

	funeral, err := loadFuneralWishes(ctx, d, vaultID)
	if err != nil {
		return nil, err
	}
	v.Funeral = funeral

	return &v, nil
}

// listVaultAttachments returns every attachment on the vault, unfiltered.
// Callers scrub sections the requester may not read (see GetVault).
func listVaultAttachments(ctx context.Context, d *Deps, vaultID string) ([]models.VaultAttachment, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT id, section, entry_id::text, file_name, content_type, file_size, created_at
		FROM vault_attachments
		WHERE vault_id = $1
		ORDER BY created_at DESC
	`, vaultID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.VaultAttachment{}
	for rows.Next() {
		var a models.VaultAttachment
		var entryID *string
		if err := rows.Scan(&a.ID, &a.Section, &entryID, &a.FileName, &a.ContentType, &a.FileSize, &a.CreatedAt); err != nil {
			return nil, err
		}
		a.EntryID = entryID
		out = append(out, a)
	}
	return out, rows.Err()
}

func strPtr(s string) *string { return &s }

type documentSpec struct {
	documentType string
	updateSQL    string
}

func documentSpecFor(documentType string) (documentSpec, bool) {
	switch documentType {
	case "will":
		return documentSpec{
			documentType: "will",
			updateSQL: `
				UPDATE vaults SET
					has_will = $1,
					will_location_type = $2,
					will_location_address = $3,
					will_location_description = $4,
					will_updated_at = $5
				WHERE id = $6
			`,
		}, true
	case "power_of_attorney":
		return documentSpec{
			documentType: "power_of_attorney",
			updateSQL: `
				UPDATE vaults SET
					has_power_of_attorney = $1,
					poa_location_type = $2,
					poa_location_address = $3,
					poa_location_description = $4,
					poa_updated_at = $5
				WHERE id = $6
			`,
		}, true
	case "health_care_directive":
		return documentSpec{
			documentType: "health_care_directive",
			updateSQL: `
				UPDATE vaults SET
					has_health_care_directive = $1,
					health_care_location_type = $2,
					health_care_location_address = $3,
					health_care_location_description = $4,
					health_care_updated_at = $5
				WHERE id = $6
			`,
		}, true
	default:
		return documentSpec{}, false
	}
}

func documentsFromFields(will models.Will, poa, health models.VaultDocument) []models.VaultDocument {
	return []models.VaultDocument{
		{
			Type:                "will",
			HasDocument:         will.HasWill,
			LocationType:        will.LocationType,
			LocationAddress:     will.LocationAddress,
			LocationDescription: will.LocationDescription,
			UpdatedAt:           will.UpdatedAt,
		},
		poa,
		health,
	}
}

func filterDocumentsForAccess(v *models.Vault, access CtxVault) {
	filtered := make([]models.VaultDocument, 0, len(v.Documents))
	for _, doc := range v.Documents {
		if access.CanReadDocument(doc.Type) {
			filtered = append(filtered, doc)
		}
	}
	v.Documents = filtered
	if !access.CanReadDocument(models.SectionWill) {
		v.Will = models.Will{}
	}

	attachments := make([]models.VaultAttachment, 0, len(v.Attachments))
	for _, a := range v.Attachments {
		if access.CanReadDocument(a.Section) {
			attachments = append(attachments, a)
		}
	}
	v.Attachments = attachments

	entries := make([]models.VaultEntry, 0, len(v.Entries))
	for _, e := range v.Entries {
		if access.CanReadDocument(e.Section) {
			entries = append(entries, e)
		}
	}
	v.Entries = entries

	if !access.CanReadDocument(models.SectionFuneral) {
		v.Funeral = models.FuneralWishes{}
	}
}
