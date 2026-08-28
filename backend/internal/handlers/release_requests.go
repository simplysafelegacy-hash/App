package handlers

import (
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/simplysafelegacy/backend/internal/models"
	"github.com/simplysafelegacy/backend/internal/storage"
)

const maxReleaseUploadBytes = 25 << 20

// A person may submit at most this many release requests per document, to keep
// admin review from being spammed. Counted per requesting member + document.
const maxReleaseRequestsPerDocument = 3

// maxReleaseFiles is the number of proof files allowed on a single submission.
const maxReleaseFiles = 3

func (d *Deps) CreateReleaseRequest(w http.ResponseWriter, r *http.Request) {
	v, ok := requireVault(w, r)
	if !ok {
		return
	}
	if err := r.ParseMultipartForm(maxReleaseUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "invalid upload")
		return
	}

	documentType := strings.TrimSpace(r.FormValue("documentType"))
	reason := strings.TrimSpace(r.FormValue("releaseReason"))
	note := strings.TrimSpace(r.FormValue("note"))
	if reason == "" {
		reason = defaultReleaseReason(documentType)
	}
	if !validReleaseRequest(documentType, reason) {
		writeError(w, http.StatusBadRequest, "invalid release request type")
		return
	}
	if !v.CanSubmitReleaseRequest(documentType) {
		writeError(w, http.StatusForbidden, "you are not allowed to request release for this document")
		return
	}
	used, err := d.countMemberReleaseRequests(r.Context(), v.VaultID, v.MemberID, documentType)
	if err != nil {
		d.internalError(w, r, err, "failed to count release requests")
		return
	}
	if used >= maxReleaseRequestsPerDocument {
		writeError(w, http.StatusForbidden, fmt.Sprintf("you have used all %d submissions for this document", maxReleaseRequestsPerDocument))
		return
	}
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		writeError(w, http.StatusBadRequest, "at least one file is required")
		return
	}
	if len(files) > maxReleaseFiles {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("upload up to %d files", maxReleaseFiles))
		return
	}
	if d.Storage == nil {
		writeError(w, http.StatusServiceUnavailable, "release uploads are not configured")
		return
	}

	req, err := d.createReleaseRequest(r.Context(), v, documentType, reason, note, files)
	if err != nil {
		d.internalError(w, r, err, "failed to create release request")
		return
	}
	writeJSON(w, http.StatusCreated, req)
}

func (d *Deps) ListReleaseRequests(w http.ResponseWriter, r *http.Request) {
	v, ok := requireRead(w, r)
	if !ok {
		return
	}
	rows, err := d.DB.Query(r.Context(), `
		SELECT id, vault_id, COALESCE(requester_id::text, ''), document_type,
		       release_reason, status, note, created_at
		FROM release_requests
		WHERE vault_id = $1
		ORDER BY created_at DESC
	`, v.VaultID)
	if err != nil {
		d.internalError(w, r, err, "failed to list release requests")
		return
	}
	defer rows.Close()

	out := []models.ReleaseRequest{}
	for rows.Next() {
		var req models.ReleaseRequest
		if err := rows.Scan(
			&req.ID, &req.VaultID, &req.RequesterID, &req.DocumentType,
			&req.ReleaseReason, &req.Status, &req.Note, &req.CreatedAt,
		); err != nil {
			d.internalError(w, r, err, "failed to scan release request")
			return
		}
		files, err := listReleaseRequestFiles(r.Context(), d, req.ID)
		if err != nil {
			d.internalError(w, r, err, "failed to list release request files")
			return
		}
		req.Files = files
		out = append(out, req)
	}
	writeJSON(w, http.StatusOK, out)
}

func (d *Deps) createReleaseRequest(
	ctx context.Context,
	v CtxVault,
	documentType string,
	reason string,
	note string,
	files []*multipart.FileHeader,
) (models.ReleaseRequest, error) {
	tx, err := d.DB.Begin(ctx)
	if err != nil {
		return models.ReleaseRequest{}, err
	}
	defer tx.Rollback(ctx)

	var req models.ReleaseRequest
	err = tx.QueryRow(ctx, `
		INSERT INTO release_requests (
			vault_id, requester_id, document_type, release_reason, note
		) VALUES ($1, $2, $3, $4, $5)
		RETURNING id, vault_id, COALESCE(requester_id::text, ''), document_type,
		          release_reason, status, note, created_at
	`, v.VaultID, v.MemberID, documentType, reason, note).Scan(
		&req.ID, &req.VaultID, &req.RequesterID, &req.DocumentType,
		&req.ReleaseReason, &req.Status, &req.Note, &req.CreatedAt,
	)
	if err != nil {
		return models.ReleaseRequest{}, err
	}

	for _, header := range files {
		uploaded, err := d.uploadReleaseFile(ctx, v.VaultID, req.ID, header)
		if err != nil {
			return models.ReleaseRequest{}, err
		}
		var file models.ReleaseRequestFile
		err = tx.QueryRow(ctx, `
			INSERT INTO release_request_files (
				release_request_id, storage_bucket, storage_key, file_name, content_type, file_size
			) VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id, file_name, content_type, file_size, storage_key
		`, req.ID, d.Storage.Bucket(), uploaded.ObjectKey, uploaded.FileName, uploaded.ContentType, uploaded.Size).Scan(
			&file.ID, &file.FileName, &file.ContentType, &file.FileSize, &file.StorageKey,
		)
		if err != nil {
			return models.ReleaseRequest{}, err
		}
		req.Files = append(req.Files, file)
	}
	if err := tx.Commit(ctx); err != nil {
		return models.ReleaseRequest{}, err
	}
	return req, nil
}

type uploadedReleaseFile struct {
	ObjectKey   string
	FileName    string
	ContentType string
	Size        int64
}

func (d *Deps) uploadReleaseFile(ctx context.Context, vaultID, requestID string, header *multipart.FileHeader) (uploadedReleaseFile, error) {
	file, err := header.Open()
	if err != nil {
		return uploadedReleaseFile{}, err
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	safeName := sanitizeObjectPart(header.Filename)
	objectKey := storage.BuildKey(vaultID, "release-requests", requestID, safeName)

	if err := d.Storage.Upload(ctx, objectKey, contentType, file, header.Size); err != nil {
		return uploadedReleaseFile{}, err
	}
	return uploadedReleaseFile{
		ObjectKey:   objectKey,
		FileName:    header.Filename,
		ContentType: contentType,
		Size:        header.Size,
	}, nil
}

// countMemberReleaseRequests returns how many release requests a member has
// already submitted for a document on a vault, used to enforce the per-document
// submission cap.
func (d *Deps) countMemberReleaseRequests(ctx context.Context, vaultID, memberID, documentType string) (int, error) {
	var n int
	err := d.DB.QueryRow(ctx, `
		SELECT count(*)
		FROM release_requests
		WHERE vault_id = $1 AND requester_id = $2 AND document_type = $3
	`, vaultID, memberID, documentType).Scan(&n)
	return n, err
}

func listReleaseRequestFiles(ctx context.Context, d *Deps, requestID string) ([]models.ReleaseRequestFile, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT id, file_name, content_type, file_size, storage_key
		FROM release_request_files
		WHERE release_request_id = $1
		ORDER BY created_at ASC
	`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.ReleaseRequestFile{}
	for rows.Next() {
		var f models.ReleaseRequestFile
		if err := rows.Scan(&f.ID, &f.FileName, &f.ContentType, &f.FileSize, &f.StorageKey); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func defaultReleaseReason(documentType string) string {
	if documentType == "will" {
		return "death"
	}
	return "incapacitated"
}

func validReleaseRequest(documentType, reason string) bool {
	switch documentType {
	case "will":
		return reason == "death"
	case "power_of_attorney", "health_care_directive":
		return reason == "incapacitated"
	default:
		return false
	}
}

func sanitizeObjectPart(name string) string {
	base := filepath.Base(name)
	base = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '.', r == '-', r == '_':
			return r
		default:
			return '-'
		}
	}, base)
	if base == "." || base == "" {
		return "upload"
	}
	return base
}
