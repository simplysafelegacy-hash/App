package handlers

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/simplysafelegacy/backend/internal/storage"
)

type adminReleaseRequest struct {
	ID              string                    `json:"id"`
	VaultID         string                    `json:"vaultId"`
	VaultName       string                    `json:"vaultName"`
	OwnerName       string                    `json:"ownerName"`
	OwnerEmail      string                    `json:"ownerEmail"`
	RequesterID     string                    `json:"requesterId"`
	RequesterName   string                    `json:"requesterName"`
	RequesterEmail  string                    `json:"requesterEmail"`
	RequesterDOB    string                    `json:"requesterDateOfBirth"`
	DocumentType    string                    `json:"documentType"`
	ReleaseReason   string                    `json:"releaseReason"`
	Status          string                    `json:"status"`
	Note            string                    `json:"note"`
	CreatedAt       time.Time                 `json:"createdAt"`
	ReviewedAt      *time.Time                `json:"reviewedAt,omitempty"`
	ReviewedBy      string                    `json:"reviewedBy,omitempty"`
	ReviewedByEmail string                    `json:"reviewedByEmail,omitempty"`
	Files           []adminReleaseRequestFile `json:"files"`
}

type adminReleaseRequestFile struct {
	ID          string `json:"id"`
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
	FileSize    int64  `json:"fileSize"`
	StorageKey  string `json:"storageKey"`
}

type reviewReleaseRequestReq struct {
	Note string `json:"note"`
}

func (d *Deps) AdminMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := currentUser(w, r)
		if !ok {
			return
		}
		var isAdmin bool
		if err := d.DB.QueryRow(r.Context(), `SELECT is_admin FROM users WHERE id = $1`, u.ID).Scan(&isAdmin); err != nil {
			d.internalError(w, r, err, "failed to verify admin access")
			return
		}
		if !isAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (d *Deps) AdminListReleaseRequests(w http.ResponseWriter, r *http.Request) {
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status == "" {
		status = "pending"
	}
	if status != "pending" && status != "approved" && status != "rejected" && status != "all" {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}

	where := ""
	args := []any{}
	if status != "all" {
		where = "WHERE rr.status = $1"
		args = append(args, status)
	}

	rows, err := d.DB.Query(r.Context(), `
		SELECT rr.id, rr.vault_id, v.name, v.owner_name, v.owner_email,
		       COALESCE(rr.requester_id::text, ''), COALESCE(vm.name, ''),
		       COALESCE(vm.email, ''), COALESCE(vm.date_of_birth::text, ''),
		       rr.document_type, rr.release_reason, rr.status, rr.note, rr.created_at,
		       rr.reviewed_at, COALESCE(u.name, ''), COALESCE(u.email, '')
		FROM release_requests rr
		JOIN vaults v ON v.id = rr.vault_id
		LEFT JOIN vault_members vm ON vm.id = rr.requester_id
		LEFT JOIN users u ON u.id = rr.reviewed_by
		`+where+`
		ORDER BY rr.created_at DESC
	`, args...)
	if err != nil {
		d.internalError(w, r, err, "failed to list release requests")
		return
	}
	defer rows.Close()

	out := []adminReleaseRequest{}
	for rows.Next() {
		req, err := scanAdminReleaseRequest(rows)
		if err != nil {
			d.internalError(w, r, err, "failed to scan release request")
			return
		}
		files, err := d.listAdminReleaseRequestFiles(r.Context(), req.ID)
		if err != nil {
			d.internalError(w, r, err, "failed to list release request files")
			return
		}
		req.Files = files
		out = append(out, req)
	}
	writeJSON(w, http.StatusOK, out)
}

func (d *Deps) AdminApproveReleaseRequest(w http.ResponseWriter, r *http.Request) {
	d.adminReviewReleaseRequest(w, r, "approved")
}

func (d *Deps) AdminRejectReleaseRequest(w http.ResponseWriter, r *http.Request) {
	d.adminReviewReleaseRequest(w, r, "rejected")
}

func (d *Deps) adminReviewReleaseRequest(w http.ResponseWriter, r *http.Request, status string) {
	u, ok := currentUser(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var req reviewReleaseRequestReq
	if r.Body != nil {
		_ = decodeBody(r, &req)
	}
	req.Note = strings.TrimSpace(req.Note)

	tx, err := d.DB.Begin(r.Context())
	if err != nil {
		d.internalError(w, r, err, "failed to begin review")
		return
	}
	defer tx.Rollback(r.Context())

	var reviewed adminReleaseRequest
	var reviewedAt *time.Time
	err = tx.QueryRow(r.Context(), `
		UPDATE release_requests
		SET status = $2,
		    reviewed_at = NOW(),
		    reviewed_by = $3,
		    note = CASE WHEN $4 = '' THEN note ELSE $4 END
		WHERE id = $1 AND status = 'pending'
		RETURNING id, vault_id, document_type, release_reason, status, note, created_at, reviewed_at
	`, id, status, u.ID, req.Note).Scan(
		&reviewed.ID, &reviewed.VaultID, &reviewed.DocumentType, &reviewed.ReleaseReason,
		&reviewed.Status, &reviewed.Note, &reviewed.CreatedAt, &reviewedAt,
	)
	if err != nil {
		writeError(w, http.StatusNotFound, "pending release request not found")
		return
	}
	reviewed.ReviewedAt = reviewedAt

	if status == "approved" {
		if _, err := tx.Exec(r.Context(), `
			INSERT INTO vault_document_releases (
				vault_id, document_type, release_request_id, released_by
			) VALUES ($1, $2, $3, $4)
			ON CONFLICT (vault_id, document_type) DO UPDATE SET
				release_request_id = EXCLUDED.release_request_id,
				released_by = EXCLUDED.released_by,
				released_at = NOW()
		`, reviewed.VaultID, reviewed.DocumentType, reviewed.ID, u.ID); err != nil {
			d.internalError(w, r, err, "failed to release document")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		d.internalError(w, r, err, "failed to finish review")
		return
	}

	full, err := d.loadAdminReleaseRequest(r.Context(), reviewed.ID)
	if err != nil {
		d.internalError(w, r, err, "failed to load reviewed request")
		return
	}
	writeJSON(w, http.StatusOK, full)
}

func (d *Deps) AdminDownloadReleaseRequestFile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var bucket, objectKey, fileName, contentType string
	err := d.DB.QueryRow(r.Context(), `
		SELECT storage_bucket, storage_key, file_name, content_type
		FROM release_request_files
		WHERE id = $1
	`, id).Scan(&bucket, &objectKey, &fileName, &contentType)
	if err != nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}

	if d.Storage == nil {
		writeError(w, http.StatusServiceUnavailable, "file downloads are not configured")
		return
	}
	body, err := d.Storage.Download(r.Context(), bucket, objectKey)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "file not found in storage")
			return
		}
		d.internalError(w, r, err, "failed to download release file")
		return
	}
	defer body.Close()

	writeDownloadHeaders(w, fileName, contentType)
	_, _ = io.Copy(w, body)
}

func (d *Deps) loadAdminReleaseRequest(ctx context.Context, id string) (adminReleaseRequest, error) {
	row := d.DB.QueryRow(ctx, `
		SELECT rr.id, rr.vault_id, v.name, v.owner_name, v.owner_email,
		       COALESCE(rr.requester_id::text, ''), COALESCE(vm.name, ''),
		       COALESCE(vm.email, ''), COALESCE(vm.date_of_birth::text, ''),
		       rr.document_type, rr.release_reason, rr.status, rr.note, rr.created_at,
		       rr.reviewed_at, COALESCE(u.name, ''), COALESCE(u.email, '')
		FROM release_requests rr
		JOIN vaults v ON v.id = rr.vault_id
		LEFT JOIN vault_members vm ON vm.id = rr.requester_id
		LEFT JOIN users u ON u.id = rr.reviewed_by
		WHERE rr.id = $1
	`, id)
	req, err := scanAdminReleaseRequest(row)
	if err != nil {
		return adminReleaseRequest{}, err
	}
	files, err := d.listAdminReleaseRequestFiles(ctx, req.ID)
	if err != nil {
		return adminReleaseRequest{}, err
	}
	req.Files = files
	return req, nil
}

func (d *Deps) listAdminReleaseRequestFiles(ctx context.Context, requestID string) ([]adminReleaseRequestFile, error) {
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
	out := []adminReleaseRequestFile{}
	for rows.Next() {
		var file adminReleaseRequestFile
		if err := rows.Scan(&file.ID, &file.FileName, &file.ContentType, &file.FileSize, &file.StorageKey); err != nil {
			return nil, err
		}
		out = append(out, file)
	}
	return out, rows.Err()
}

type releaseRequestScanner interface {
	Scan(dest ...any) error
}

func scanAdminReleaseRequest(row releaseRequestScanner) (adminReleaseRequest, error) {
	var req adminReleaseRequest
	var reviewedAt sql.NullTime
	if err := row.Scan(
		&req.ID, &req.VaultID, &req.VaultName, &req.OwnerName, &req.OwnerEmail,
		&req.RequesterID, &req.RequesterName, &req.RequesterEmail, &req.RequesterDOB,
		&req.DocumentType, &req.ReleaseReason, &req.Status, &req.Note, &req.CreatedAt,
		&reviewedAt, &req.ReviewedBy, &req.ReviewedByEmail,
	); err != nil {
		return req, err
	}
	if reviewedAt.Valid {
		req.ReviewedAt = &reviewedAt.Time
	}
	return req, nil
}
