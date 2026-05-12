package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sealed/backend/internal/models"
)

type documentReq struct {
	Type         string   `json:"type"`
	Name         string   `json:"name"`
	FileName     *string  `json:"fileName,omitempty"`
	LocationType string   `json:"locationType"`
	Address      string   `json:"address"`
	Description  string   `json:"description"`
	MemberIDs    []string `json:"memberIds"`
}

func (d *Deps) ListDocuments(w http.ResponseWriter, r *http.Request) {
	v, ok := requireRead(w, r)
	if !ok {
		return
	}
	docs, err := listDocumentsForViewer(r.Context(), d, v)
	if err != nil {
		d.internalError(w, r, err, "failed to list documents")
		return
	}
	writeJSON(w, http.StatusOK, docs)
}

func (d *Deps) GetDocument(w http.ResponseWriter, r *http.Request) {
	v, ok := requireRead(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	doc, err := loadDocumentForViewer(r.Context(), d, v, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "document not found")
			return
		}
		d.internalError(w, r, err, "failed to load document")
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

func (d *Deps) CreateDocument(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	var req documentReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Type == "" || req.Name == "" || req.LocationType == "" || req.Address == "" {
		writeError(w, http.StatusBadRequest, "type, name, locationType and address are required")
		return
	}

	ctx := r.Context()
	tx, err := d.DB.Begin(ctx)
	if err != nil {
		d.internalError(w, r, err, "could not begin transaction")
		return
	}
	defer tx.Rollback(ctx)

	var doc models.Document
	err = tx.QueryRow(ctx, `
		INSERT INTO documents (vault_id, type, name, file_name, location_type, address, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, type, name, file_key, file_name, location_type, address, description, created_at, last_updated
	`,
		v.VaultID, req.Type, req.Name, req.FileName,
		req.LocationType, req.Address, req.Description,
	).Scan(
		&doc.ID, &doc.Type, &doc.Name, &doc.FileKey, &doc.FileName,
		&doc.LocationType, &doc.Address, &doc.Description, &doc.CreatedAt, &doc.LastUpdated,
	)
	if err != nil {
		d.internalError(w, r, err, "failed to create document")
		return
	}

	if err := setMemberAccessTx(ctx, tx, doc.ID, v.VaultID, req.MemberIDs); err != nil {
		d.internalError(w, r, err, "failed to set member access")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		d.internalError(w, r, err, "failed to commit")
		return
	}

	_ = pushNotification(ctx, d, currentUserID(r), &v.VaultID, "document_added",
		fmt.Sprintf("%s added to vault", doc.Name))

	doc.HasFile = doc.FileKey != nil && *doc.FileKey != ""
	doc.MemberIDs = req.MemberIDs
	if doc.MemberIDs == nil {
		doc.MemberIDs = []string{}
	}
	writeJSON(w, http.StatusCreated, doc)
}

func (d *Deps) UpdateDocument(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var req documentReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()
	tx, err := d.DB.Begin(ctx)
	if err != nil {
		d.internalError(w, r, err, "could not begin transaction")
		return
	}
	defer tx.Rollback(ctx)

	var doc models.Document
	err = tx.QueryRow(ctx, `
		UPDATE documents SET
			type          = COALESCE(NULLIF($3,''), type),
			name          = COALESCE(NULLIF($4,''), name),
			file_name     = COALESCE($5, file_name),
			location_type = COALESCE(NULLIF($6,''), location_type),
			address       = COALESCE(NULLIF($7,''), address),
			description   = COALESCE(NULLIF($8,''), description),
			last_updated  = NOW()
		WHERE id = $1 AND vault_id = $2
		RETURNING id, type, name, file_key, file_name, location_type, address, description, created_at, last_updated
	`,
		id, v.VaultID, req.Type, req.Name, req.FileName,
		req.LocationType, req.Address, req.Description,
	).Scan(
		&doc.ID, &doc.Type, &doc.Name, &doc.FileKey, &doc.FileName,
		&doc.LocationType, &doc.Address, &doc.Description, &doc.CreatedAt, &doc.LastUpdated,
	)
	if err != nil {
		writeError(w, http.StatusNotFound, "document not found")
		return
	}

	if req.MemberIDs != nil {
		if err := setMemberAccessTx(ctx, tx, doc.ID, v.VaultID, req.MemberIDs); err != nil {
			d.internalError(w, r, err, "failed to set member access")
			return
		}
		doc.MemberIDs = req.MemberIDs
	} else {
		doc.MemberIDs, _ = loadDocumentMembers(ctx, d, doc.ID)
	}

	if err := tx.Commit(ctx); err != nil {
		d.internalError(w, r, err, "failed to commit")
		return
	}
	doc.HasFile = doc.FileKey != nil && *doc.FileKey != ""
	_ = pushNotification(ctx, d, currentUserID(r), &v.VaultID, "document_updated", "Document updated")
	writeJSON(w, http.StatusOK, doc)
}

func (d *Deps) DeleteDocument(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	_, err := d.DB.Exec(r.Context(),
		`DELETE FROM documents WHERE id = $1 AND vault_id = $2`, id, v.VaultID)
	if err != nil {
		d.internalError(w, r, err, "failed to delete document")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type presignReq struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
}

type presignResp struct {
	UploadURL string `json:"uploadUrl"`
	FileKey   string `json:"fileKey"`
}

// PresignUpload produces a one-off URL the client can PUT the file to.
// Owner-only — only owners add documents in the first place.
func (d *Deps) PresignUpload(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var req presignReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Filename == "" || req.ContentType == "" {
		writeError(w, http.StatusBadRequest, "filename and contentType are required")
		return
	}

	var exists bool
	if err := d.DB.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM documents WHERE id = $1 AND vault_id = $2)`,
		id, v.VaultID,
	).Scan(&exists); err != nil || !exists {
		writeError(w, http.StatusNotFound, "document not found")
		return
	}

	key := fmt.Sprintf("vaults/%s/documents/%s/%s-%s",
		v.VaultID, id, uuid.NewString(), sanitize(req.Filename))

	uploadURL, err := d.Storage.PresignPut(r.Context(), key, req.ContentType, 15*time.Minute)
	if err != nil {
		d.internalError(w, r, err, "failed to presign upload")
		return
	}

	if _, err := d.DB.Exec(r.Context(), `
		UPDATE documents SET file_key = $1, file_name = $2, last_updated = NOW()
		WHERE id = $3 AND vault_id = $4
	`, key, req.Filename, id, v.VaultID); err != nil {
		d.internalError(w, r, err, "failed to record file key")
		return
	}

	writeJSON(w, http.StatusOK, presignResp{UploadURL: uploadURL, FileKey: key})
}

// DownloadDocument returns a short-lived presigned GET URL for the document
// file. Available to any role that can read; successors must wait for the
// vault to be released.
func (d *Deps) DownloadDocument(w http.ResponseWriter, r *http.Request) {
	v, ok := requireRead(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	// Resolve file_key, scoped to the caller's permissions on this document.
	doc, err := loadDocumentForViewer(r.Context(), d, v, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "document not found")
			return
		}
		d.internalError(w, r, err, "failed to load document")
		return
	}
	if doc.FileKey == nil || *doc.FileKey == "" {
		writeError(w, http.StatusNotFound, "no digital copy on file")
		return
	}

	url, err := d.Storage.PresignGet(r.Context(), *doc.FileKey, 5*time.Minute)
	if err != nil {
		d.internalError(w, r, err, "failed to presign download")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"url":      url,
		"fileName": doc.FileName,
		"expiresIn": 300,
	})
}

// -- internals --------------------------------------------------------------

// listDocumentsForViewer returns documents visible to the caller. Owners see
// every document in the vault. Stewards / released successors see only the
// documents they were granted access to via member_document_access.
func listDocumentsForViewer(ctx context.Context, d *Deps, v CtxVault) ([]models.Document, error) {
	if v.CanModify() {
		return listDocuments(ctx, d, v.VaultID)
	}
	return listDocumentsForMember(ctx, d, v.VaultID, v.MemberID)
}

func listDocuments(ctx context.Context, d *Deps, vaultID string) ([]models.Document, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT id, type, name, file_key, file_name, location_type, address, description, created_at, last_updated
		FROM documents WHERE vault_id = $1 ORDER BY created_at DESC
	`, vaultID)
	if err != nil {
		return nil, err
	}
	return scanDocuments(ctx, d, rows)
}

func listDocumentsForMember(ctx context.Context, d *Deps, vaultID, memberID string) ([]models.Document, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT d.id, d.type, d.name, d.file_key, d.file_name, d.location_type,
		       d.address, d.description, d.created_at, d.last_updated
		FROM documents d
		JOIN member_document_access mda ON mda.document_id = d.id
		WHERE d.vault_id = $1 AND mda.member_id = $2
		ORDER BY d.created_at DESC
	`, vaultID, memberID)
	if err != nil {
		return nil, err
	}
	return scanDocuments(ctx, d, rows)
}

func scanDocuments(ctx context.Context, d *Deps, rows pgx.Rows) ([]models.Document, error) {
	defer rows.Close()
	out := []models.Document{}
	for rows.Next() {
		var doc models.Document
		if err := rows.Scan(
			&doc.ID, &doc.Type, &doc.Name, &doc.FileKey, &doc.FileName,
			&doc.LocationType, &doc.Address, &doc.Description, &doc.CreatedAt, &doc.LastUpdated,
		); err != nil {
			return nil, err
		}
		members, err := loadDocumentMembers(ctx, d, doc.ID)
		if err != nil {
			return nil, err
		}
		doc.MemberIDs = members
		doc.HasFile = doc.FileKey != nil && *doc.FileKey != ""
		out = append(out, doc)
	}
	return out, rows.Err()
}

func loadDocumentForViewer(ctx context.Context, d *Deps, v CtxVault, docID string) (*models.Document, error) {
	var doc models.Document
	var query string
	var args []any
	if v.CanModify() {
		query = `
			SELECT id, type, name, file_key, file_name, location_type, address, description, created_at, last_updated
			FROM documents WHERE id = $1 AND vault_id = $2
		`
		args = []any{docID, v.VaultID}
	} else {
		query = `
			SELECT d.id, d.type, d.name, d.file_key, d.file_name, d.location_type,
			       d.address, d.description, d.created_at, d.last_updated
			FROM documents d
			JOIN member_document_access mda ON mda.document_id = d.id
			WHERE d.id = $1 AND d.vault_id = $2 AND mda.member_id = $3
		`
		args = []any{docID, v.VaultID, v.MemberID}
	}
	err := d.DB.QueryRow(ctx, query, args...).Scan(
		&doc.ID, &doc.Type, &doc.Name, &doc.FileKey, &doc.FileName,
		&doc.LocationType, &doc.Address, &doc.Description, &doc.CreatedAt, &doc.LastUpdated,
	)
	if err != nil {
		return nil, err
	}
	members, err := loadDocumentMembers(ctx, d, doc.ID)
	if err != nil {
		return nil, err
	}
	doc.MemberIDs = members
	doc.HasFile = doc.FileKey != nil && *doc.FileKey != ""
	return &doc, nil
}

func loadDocumentMembers(ctx context.Context, d *Deps, docID string) ([]string, error) {
	rows, err := d.DB.Query(ctx,
		`SELECT member_id FROM member_document_access WHERE document_id = $1`, docID)
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

// setMemberAccessTx replaces the set of members allowed to see a document.
// Member IDs not belonging to the vault are silently dropped — this prevents
// access escalation by guessing IDs from another vault.
func setMemberAccessTx(ctx context.Context, tx pgx.Tx, docID, vaultID string, memberIDs []string) error {
	if _, err := tx.Exec(ctx,
		`DELETE FROM member_document_access WHERE document_id = $1`, docID); err != nil {
		return err
	}
	for _, mid := range memberIDs {
		_, err := tx.Exec(ctx, `
			INSERT INTO member_document_access (member_id, document_id)
			SELECT $1, $2 WHERE EXISTS (
				SELECT 1 FROM vault_members
				WHERE id = $1 AND vault_id = $3 AND role IN ('steward','successor')
			)
			ON CONFLICT DO NOTHING
		`, mid, docID, vaultID)
		if err != nil {
			return err
		}
	}
	return nil
}

func sanitize(name string) string {
	return strings.ReplaceAll(strings.ReplaceAll(name, "/", "_"), "\\", "_")
}
