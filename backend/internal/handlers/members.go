package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sealed/backend/internal/models"
)

type memberReq struct {
	Name        string   `json:"name"`
	Email       string   `json:"email"`
	Role        string   `json:"role"` // "steward" | "successor"
	DocumentIDs []string `json:"documentIds"`
}

func (d *Deps) ListMembers(w http.ResponseWriter, r *http.Request) {
	v, ok := requireRead(w, r)
	if !ok {
		return
	}
	// Stewards / successors only see themselves to avoid leaking the list of
	// people who else has access. Owners see everyone.
	if v.CanModify() {
		members, err := listMembers(r.Context(), d, v.VaultID)
		if err != nil {
			d.internalError(w, r, err, "failed to list members")
			return
		}
		writeJSON(w, http.StatusOK, members)
		return
	}
	writeJSON(w, http.StatusOK, []models.VaultMember{})
}

func (d *Deps) CreateMember(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	var req memberReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Name = strings.TrimSpace(req.Name)
	if req.Email == "" || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name and email are required")
		return
	}
	if req.Role == "" {
		req.Role = models.RoleSteward
	}
	if req.Role != models.RoleSteward && req.Role != models.RoleSuccessor {
		writeError(w, http.StatusBadRequest, "role must be 'steward' or 'successor'")
		return
	}

	ctx := r.Context()
	tx, err := d.DB.Begin(ctx)
	if err != nil {
		d.internalError(w, r, err, "could not begin transaction")
		return
	}
	defer tx.Rollback(ctx)

	// Try to link an existing user account by email — if Jane invites
	// michael@... and Michael already has an account, his memberships
	// should appear in his vault switcher immediately.
	var linkedUserID *string
	var found string
	err = tx.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, req.Email).Scan(&found)
	switch {
	case err == nil:
		linkedUserID = &found
	case isNoRows(err):
		// pending invite — user_id stays null until they sign up
	default:
		d.internalError(w, r, err, "failed to resolve invitee")
		return
	}

	var m models.VaultMember
	err = tx.QueryRow(ctx, `
		INSERT INTO vault_members (vault_id, user_id, name, email, role)
		VALUES ($1, $2, $3, $4, $5::vault_role)
		ON CONFLICT (vault_id, email) DO UPDATE SET
			name = EXCLUDED.name,
			role = EXCLUDED.role,
			user_id = COALESCE(EXCLUDED.user_id, vault_members.user_id)
		RETURNING id, COALESCE(user_id::text, ''), name, email, role::text
	`, v.VaultID, linkedUserID, req.Name, req.Email, req.Role).Scan(
		&m.ID, &m.UserID, &m.Name, &m.Email, &m.Role,
	)
	if err != nil {
		d.internalError(w, r, err, "failed to create member")
		return
	}

	// Optional: pre-grant access to specific documents.
	if len(req.DocumentIDs) > 0 {
		if err := setMemberDocumentAccessTx(ctx, tx, m.ID, v.VaultID, req.DocumentIDs); err != nil {
			d.internalError(w, r, err, "failed to set document access")
			return
		}
		m.DocumentIDs = req.DocumentIDs
	} else {
		m.DocumentIDs = []string{}
	}

	if err := tx.Commit(ctx); err != nil {
		d.internalError(w, r, err, "failed to commit")
		return
	}

	_ = pushNotification(ctx, d, currentUserID(r), &v.VaultID, "member_added",
		fmt.Sprintf("%s added as %s", m.Name, m.Role))
	writeJSON(w, http.StatusCreated, m)
}

func (d *Deps) UpdateMember(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var req memberReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Role != "" && req.Role != models.RoleSteward && req.Role != models.RoleSuccessor {
		writeError(w, http.StatusBadRequest, "role must be 'steward' or 'successor'")
		return
	}

	ctx := r.Context()
	tx, err := d.DB.Begin(ctx)
	if err != nil {
		d.internalError(w, r, err, "could not begin transaction")
		return
	}
	defer tx.Rollback(ctx)

	var m models.VaultMember
	err = tx.QueryRow(ctx, `
		UPDATE vault_members SET
			name = COALESCE(NULLIF($3,''), name),
			role = COALESCE(NULLIF($4,'')::vault_role, role)
		WHERE id = $1 AND vault_id = $2 AND role <> 'owner'
		RETURNING id, COALESCE(user_id::text,''), name, email, role::text
	`, id, v.VaultID, req.Name, req.Role).Scan(
		&m.ID, &m.UserID, &m.Name, &m.Email, &m.Role,
	)
	if err != nil {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}

	if req.DocumentIDs != nil {
		if err := setMemberDocumentAccessTx(ctx, tx, m.ID, v.VaultID, req.DocumentIDs); err != nil {
			d.internalError(w, r, err, "failed to set document access")
			return
		}
		m.DocumentIDs = req.DocumentIDs
	} else {
		m.DocumentIDs, _ = loadMemberDocuments(ctx, d, m.ID)
	}

	if err := tx.Commit(ctx); err != nil {
		d.internalError(w, r, err, "failed to commit")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (d *Deps) DeleteMember(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	// Owner can't remove themselves through this endpoint — that's a vault
	// transfer or deletion, both out of scope here.
	tag, err := d.DB.Exec(r.Context(),
		`DELETE FROM vault_members WHERE id = $1 AND vault_id = $2 AND role <> 'owner'`,
		id, v.VaultID)
	if err != nil {
		d.internalError(w, r, err, "failed to remove member")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// listMembers returns every member of the vault, owners included.
func listMembers(ctx context.Context, d *Deps, vaultID string) ([]models.VaultMember, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT id, COALESCE(user_id::text, ''), name, email, role::text
		FROM vault_members
		WHERE vault_id = $1
		ORDER BY (role = 'owner') DESC, created_at ASC
	`, vaultID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.VaultMember{}
	for rows.Next() {
		var m models.VaultMember
		if err := rows.Scan(&m.ID, &m.UserID, &m.Name, &m.Email, &m.Role); err != nil {
			return nil, err
		}
		docs, err := loadMemberDocuments(ctx, d, m.ID)
		if err != nil {
			return nil, err
		}
		m.DocumentIDs = docs
		out = append(out, m)
	}
	return out, rows.Err()
}

func loadMemberDocuments(ctx context.Context, d *Deps, memberID string) ([]string, error) {
	rows, err := d.DB.Query(ctx,
		`SELECT document_id FROM member_document_access WHERE member_id = $1`, memberID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// setMemberDocumentAccessTx replaces the set of documents a member may see.
// Document IDs that don't belong to the vault are silently dropped.
func setMemberDocumentAccessTx(ctx context.Context, tx pgx.Tx, memberID, vaultID string, docIDs []string) error {
	if _, err := tx.Exec(ctx,
		`DELETE FROM member_document_access WHERE member_id = $1`, memberID); err != nil {
		return err
	}
	for _, did := range docIDs {
		_, err := tx.Exec(ctx, `
			INSERT INTO member_document_access (member_id, document_id)
			SELECT $1, $2 WHERE EXISTS (
				SELECT 1 FROM documents WHERE id = $2 AND vault_id = $3
			)
			ON CONFLICT DO NOTHING
		`, memberID, did, vaultID)
		if err != nil {
			return err
		}
	}
	return nil
}
