package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/simplysafelegacy/backend/internal/models"
)

// entrySectionAllowed reports whether a section is backed by the vault_entries
// list model. Only the two list sections are; the singular documents are not.
func entrySectionAllowed(section string) bool {
	switch section {
	case models.SectionPersonalProperty, models.SectionNonProbate, models.SectionContacts:
		return true
	default:
		return false
	}
}

type entryReq struct {
	Section       string                        `json:"section"`
	Title         string                        `json:"title"`
	Details       map[string]any                `json:"details"`
	SortOrder     int                           `json:"sortOrder"`
	Beneficiaries []models.VaultEntryBeneficiary `json:"beneficiaries"`
}

// ListEntries returns the vault's list entries for a single section, but only
// when the caller may read that section. Beneficiaries ride along, so a sealed
// viewer who cannot read the section never sees any names.
func (d *Deps) ListEntries(w http.ResponseWriter, r *http.Request) {
	v, ok := requireVault(w, r)
	if !ok {
		return
	}
	section := strings.TrimSpace(r.URL.Query().Get("section"))
	if !entrySectionAllowed(section) {
		writeError(w, http.StatusBadRequest, "unsupported section")
		return
	}
	if !v.CanReadDocument(section) {
		writeError(w, http.StatusForbidden, "this section has not been released to you yet")
		return
	}
	entries, err := listVaultEntries(r.Context(), d, v.VaultID, section)
	if err != nil {
		d.internalError(w, r, err, "failed to list entries")
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

// CreateEntry adds a list item (owner-only), plan-gated by section.
func (d *Deps) CreateEntry(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	var req entryReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Section = strings.TrimSpace(req.Section)
	req.Title = strings.TrimSpace(req.Title)
	if !entrySectionAllowed(req.Section) {
		writeError(w, http.StatusBadRequest, "unsupported section")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "a title is required")
		return
	}
	limits, err := d.effectivePlanLimits(r.Context(), currentUserID(r))
	if err != nil {
		d.internalError(w, r, err, "failed to load plan limits")
		return
	}
	if !documentAllowedByPlan(limits, req.Section) {
		writeError(w, http.StatusForbidden, documentPlanError(req.Section))
		return
	}

	detailsJSON, err := marshalDetails(req.Details)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid details")
		return
	}

	tx, err := d.DB.Begin(r.Context())
	if err != nil {
		d.internalError(w, r, err, "could not begin transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var entryID string
	if err := tx.QueryRow(r.Context(), `
		INSERT INTO vault_entries (vault_id, section, title, details, sort_order)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, v.VaultID, req.Section, req.Title, detailsJSON, req.SortOrder).Scan(&entryID); err != nil {
		d.internalError(w, r, err, "failed to create entry")
		return
	}
	if err := insertBeneficiaries(r.Context(), tx, entryID, req.Beneficiaries); err != nil {
		d.internalError(w, r, err, "failed to save beneficiaries")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		d.internalError(w, r, err, "failed to commit")
		return
	}

	entry, err := loadVaultEntry(r.Context(), d, v.VaultID, entryID)
	if err != nil {
		d.internalError(w, r, err, "failed to load entry")
		return
	}
	writeJSON(w, http.StatusCreated, entry)
}

// UpdateEntry replaces an entry's fields and its full beneficiary list
// (owner-only). The section is immutable — it is set at creation.
func (d *Deps) UpdateEntry(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var req entryReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "a title is required")
		return
	}
	detailsJSON, err := marshalDetails(req.Details)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid details")
		return
	}

	tx, err := d.DB.Begin(r.Context())
	if err != nil {
		d.internalError(w, r, err, "could not begin transaction")
		return
	}
	defer tx.Rollback(r.Context())

	tag, err := tx.Exec(r.Context(), `
		UPDATE vault_entries
		SET title = $3, details = $4, sort_order = $5, updated_at = NOW()
		WHERE id = $1 AND vault_id = $2
	`, id, v.VaultID, req.Title, detailsJSON, req.SortOrder)
	if err != nil {
		d.internalError(w, r, err, "failed to update entry")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "entry not found")
		return
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM vault_entry_beneficiaries WHERE entry_id = $1`, id); err != nil {
		d.internalError(w, r, err, "failed to update beneficiaries")
		return
	}
	if err := insertBeneficiaries(r.Context(), tx, id, req.Beneficiaries); err != nil {
		d.internalError(w, r, err, "failed to save beneficiaries")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		d.internalError(w, r, err, "failed to commit")
		return
	}

	entry, err := loadVaultEntry(r.Context(), d, v.VaultID, id)
	if err != nil {
		d.internalError(w, r, err, "failed to load entry")
		return
	}
	writeJSON(w, http.StatusOK, entry)
}

// DeleteEntry removes a list item (owner-only). Beneficiaries cascade.
func (d *Deps) DeleteEntry(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	tag, err := d.DB.Exec(r.Context(),
		`DELETE FROM vault_entries WHERE id = $1 AND vault_id = $2`, id, v.VaultID)
	if err != nil {
		d.internalError(w, r, err, "failed to delete entry")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "entry not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- helpers ---

// insertBeneficiaries writes the ordered beneficiary rows for an entry. Blank
// names are skipped so an empty row in the UI does not create a ghost record.
func insertBeneficiaries(ctx context.Context, tx pgx.Tx, entryID string, beneficiaries []models.VaultEntryBeneficiary) error {
	for i, b := range beneficiaries {
		name := strings.TrimSpace(b.Name)
		if name == "" {
			continue
		}
		var memberID *string
		if b.MemberID != nil && strings.TrimSpace(*b.MemberID) != "" {
			memberID = b.MemberID
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO vault_entry_beneficiaries (
				entry_id, name, relationship, share, note, member_id, sort_order
			) VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, entryID, name, strings.TrimSpace(b.Relationship), strings.TrimSpace(b.Share),
			strings.TrimSpace(b.Note), memberID, i); err != nil {
			return err
		}
	}
	return nil
}

func marshalDetails(details map[string]any) ([]byte, error) {
	if details == nil {
		return []byte("{}"), nil
	}
	return json.Marshal(details)
}

// listVaultEntries returns every entry for one section, ordered, with
// beneficiaries. Unfiltered — callers gate on section access first.
func listVaultEntries(ctx context.Context, d *Deps, vaultID, section string) ([]models.VaultEntry, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT id, section, title, details, sort_order, created_at, updated_at
		FROM vault_entries
		WHERE vault_id = $1 AND section = $2
		ORDER BY sort_order ASC, created_at ASC
	`, vaultID, section)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.VaultEntry{}
	ids := []string{}
	for rows.Next() {
		var e models.VaultEntry
		var detailsRaw []byte
		if err := rows.Scan(&e.ID, &e.Section, &e.Title, &detailsRaw, &e.SortOrder, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(detailsRaw, &e.Details); err != nil {
			e.Details = map[string]any{}
		}
		e.Beneficiaries = []models.VaultEntryBeneficiary{}
		out = append(out, e)
		ids = append(ids, e.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}

	byEntry, err := listBeneficiariesByEntry(ctx, d, ids)
	if err != nil {
		return nil, err
	}
	for i := range out {
		if bens, ok := byEntry[out[i].ID]; ok {
			out[i].Beneficiaries = bens
		}
	}
	return out, nil
}

// listAllVaultEntries returns every entry across all list sections, used to
// embed entries in the full vault. Callers scrub sections the requester may
// not read.
func listAllVaultEntries(ctx context.Context, d *Deps, vaultID string) ([]models.VaultEntry, error) {
	var out []models.VaultEntry
	for _, section := range []string{models.SectionPersonalProperty, models.SectionNonProbate, models.SectionContacts} {
		entries, err := listVaultEntries(ctx, d, vaultID, section)
		if err != nil {
			return nil, err
		}
		out = append(out, entries...)
	}
	if out == nil {
		out = []models.VaultEntry{}
	}
	return out, nil
}

func loadVaultEntry(ctx context.Context, d *Deps, vaultID, entryID string) (models.VaultEntry, error) {
	var e models.VaultEntry
	var detailsRaw []byte
	err := d.DB.QueryRow(ctx, `
		SELECT id, section, title, details, sort_order, created_at, updated_at
		FROM vault_entries
		WHERE id = $1 AND vault_id = $2
	`, entryID, vaultID).Scan(&e.ID, &e.Section, &e.Title, &detailsRaw, &e.SortOrder, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		return models.VaultEntry{}, err
	}
	if err := json.Unmarshal(detailsRaw, &e.Details); err != nil {
		e.Details = map[string]any{}
	}
	byEntry, err := listBeneficiariesByEntry(ctx, d, []string{e.ID})
	if err != nil {
		return models.VaultEntry{}, err
	}
	if bens, ok := byEntry[e.ID]; ok {
		e.Beneficiaries = bens
	} else {
		e.Beneficiaries = []models.VaultEntryBeneficiary{}
	}
	return e, nil
}

func listBeneficiariesByEntry(ctx context.Context, d *Deps, entryIDs []string) (map[string][]models.VaultEntryBeneficiary, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT id, entry_id, name, relationship, share, note, member_id::text, sort_order
		FROM vault_entry_beneficiaries
		WHERE entry_id = ANY($1)
		ORDER BY sort_order ASC
	`, entryIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string][]models.VaultEntryBeneficiary{}
	for rows.Next() {
		var b models.VaultEntryBeneficiary
		var entryID string
		var memberID *string
		if err := rows.Scan(&b.ID, &entryID, &b.Name, &b.Relationship, &b.Share, &b.Note, &memberID, &b.SortOrder); err != nil {
			return nil, err
		}
		b.MemberID = memberID
		out[entryID] = append(out[entryID], b)
	}
	return out, rows.Err()
}
