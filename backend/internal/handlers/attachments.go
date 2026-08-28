package handlers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/simplysafelegacy/backend/internal/models"
	"github.com/simplysafelegacy/backend/internal/storage"
)

// maxAttachmentBytes caps a single document-copy upload. Document copies
// (scanned wills, PDFs) are larger than release-proof photos, so this is more
// generous than maxReleaseUploadBytes.
const maxAttachmentBytes = 50 << 20

// attachmentSections are the sections a document copy may be attached to.
// Only the singular legal documents accept copies for now; list sections
// attach files per entry in a later phase.
func attachmentSectionAllowed(section string) bool {
	switch section {
	case models.SectionWill, models.SectionPowerOfAttorney, models.SectionHealthCareDirective:
		return true
	default:
		return false
	}
}

// ListAttachments returns the vault's attachments the caller may see. Each
// attachment is included only when the caller can read its section, so a
// sealed successor never learns a will copy exists before release.
func (d *Deps) ListAttachments(w http.ResponseWriter, r *http.Request) {
	v, ok := requireRead(w, r)
	if !ok {
		return
	}
	rows, err := d.DB.Query(r.Context(), `
		SELECT id, section, entry_id::text, file_name, content_type, file_size, created_at
		FROM vault_attachments
		WHERE vault_id = $1
		ORDER BY created_at DESC
	`, v.VaultID)
	if err != nil {
		d.internalError(w, r, err, "failed to list attachments")
		return
	}
	defer rows.Close()

	out := []models.VaultAttachment{}
	for rows.Next() {
		var a models.VaultAttachment
		var entryID *string
		if err := rows.Scan(&a.ID, &a.Section, &entryID, &a.FileName, &a.ContentType, &a.FileSize, &a.CreatedAt); err != nil {
			d.internalError(w, r, err, "failed to scan attachment")
			return
		}
		a.EntryID = entryID
		if v.CanReadDocument(a.Section) {
			out = append(out, a)
		}
	}
	if err := rows.Err(); err != nil {
		d.internalError(w, r, err, "failed to read attachments")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// CreateAttachment uploads a document copy. Owner-only: only the vault owner
// may add copies of documents, matching who may edit document details.
func (d *Deps) CreateAttachment(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	if d.Storage == nil {
		writeError(w, http.StatusServiceUnavailable, "file uploads are not configured")
		return
	}
	if err := r.ParseMultipartForm(maxAttachmentBytes); err != nil {
		writeError(w, http.StatusBadRequest, "invalid upload")
		return
	}
	section := strings.TrimSpace(r.FormValue("section"))
	if !attachmentSectionAllowed(section) {
		writeError(w, http.StatusBadRequest, "unsupported section for uploads")
		return
	}

	// The plan must include this section before a copy can be stored.
	limits, err := d.effectivePlanLimits(r.Context(), currentUserID(r))
	if err != nil {
		d.internalError(w, r, err, "failed to load plan limits")
		return
	}
	if !documentAllowedByPlan(limits, section) {
		writeError(w, http.StatusForbidden, documentPlanError(section))
		return
	}

	files := r.MultipartForm.File["files"]
	if len(files) != 1 {
		writeError(w, http.StatusBadRequest, "upload exactly one file")
		return
	}

	attachment, err := d.storeAttachment(r.Context(), v.VaultID, section, currentUserID(r), files[0])
	if err != nil {
		d.internalError(w, r, err, "failed to store attachment")
		return
	}
	writeJSON(w, http.StatusCreated, attachment)
}

// DownloadAttachment streams the file bytes through the backend after checking
// the caller may read the attachment's section. The object bytes never leave
// S3 via a public or presigned URL — only through this gated proxy, so access
// is governed by our permission rules rather than by holding a link.
func (d *Deps) DownloadAttachment(w http.ResponseWriter, r *http.Request) {
	v, ok := requireVault(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	var section, bucket, objectKey, fileName, contentType string
	err := d.DB.QueryRow(r.Context(), `
		SELECT section, storage_bucket, storage_key, file_name, content_type
		FROM vault_attachments
		WHERE id = $1 AND vault_id = $2
	`, id, v.VaultID).Scan(&section, &bucket, &objectKey, &fileName, &contentType)
	if err != nil {
		if isNoRows(err) {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		d.internalError(w, r, err, "failed to load attachment")
		return
	}
	if !v.CanReadDocument(section) {
		// Match the sealed-vault wording; don't reveal the file exists.
		writeError(w, http.StatusForbidden, "this document has not been released to you yet")
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
		d.internalError(w, r, err, "failed to download file")
		return
	}
	defer body.Close()

	writeDownloadHeaders(w, fileName, contentType)
	_, _ = io.Copy(w, body)
}

// DeleteAttachment removes a document copy. Owner-only. The S3 object is
// best-effort deleted; a storage failure does not block removing the row.
func (d *Deps) DeleteAttachment(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	var bucket, objectKey string
	err := d.DB.QueryRow(r.Context(), `
		DELETE FROM vault_attachments
		WHERE id = $1 AND vault_id = $2
		RETURNING storage_bucket, storage_key
	`, id, v.VaultID).Scan(&bucket, &objectKey)
	if err != nil {
		if isNoRows(err) {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		d.internalError(w, r, err, "failed to delete attachment")
		return
	}
	if d.Storage != nil && objectKey != "" {
		if delErr := d.Storage.Delete(r.Context(), bucket, objectKey); delErr != nil {
			// Row is already gone; log the orphaned object but return success.
			d.Logger.Warn("attachment object not deleted from storage",
				"bucket", bucket, "key", objectKey, "err", delErr)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (d *Deps) storeAttachment(
	ctx context.Context,
	vaultID, section, uploadedBy string,
	header *multipart.FileHeader,
) (models.VaultAttachment, error) {
	file, err := header.Open()
	if err != nil {
		return models.VaultAttachment{}, err
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	attachmentID := uuid.NewString()
	safeName := sanitizeObjectPart(header.Filename)
	objectKey := storage.BuildKey(vaultID, "attachments", section, attachmentID, safeName)

	if err := d.Storage.Upload(ctx, objectKey, contentType, file, header.Size); err != nil {
		return models.VaultAttachment{}, err
	}

	var a models.VaultAttachment
	err = d.DB.QueryRow(ctx, `
		INSERT INTO vault_attachments (
			id, vault_id, section, storage_bucket, storage_key,
			file_name, content_type, file_size, uploaded_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, section, entry_id::text, file_name, content_type, file_size, created_at
	`, attachmentID, vaultID, section, d.Storage.Bucket(), objectKey,
		header.Filename, contentType, header.Size, uploadedBy).Scan(
		&a.ID, &a.Section, &a.EntryID, &a.FileName, &a.ContentType, &a.FileSize, &a.CreatedAt,
	)
	if err != nil {
		// Roll back the just-uploaded object so we don't orphan it.
		_ = d.Storage.Delete(ctx, d.Storage.Bucket(), objectKey)
		return models.VaultAttachment{}, err
	}
	return a, nil
}

// safeDownloadContentTypes are the content types we will echo back to a
// browser as-is. Everything else is served as application/octet-stream.
//
// Why: the stored content_type comes from the uploader's multipart header,
// so it is attacker-controlled. Serving text/html or image/svg+xml from our
// own origin would let an uploaded file execute script in a victim's session
// (stored XSS) — SVG in particular is a live document, not just an image.
// Documents are also served as attachments rather than inline, so the browser
// downloads them instead of rendering them in our origin.
var safeDownloadContentTypes = map[string]bool{
	"application/pdf": true,
	"image/jpeg":      true,
	"image/png":       true,
	"image/gif":       true,
	"image/webp":      true,
	"image/heic":      true,
	"image/heif":      true,
	"text/plain":      true,
}

// writeDownloadHeaders sets the response headers for a proxied object,
// forcing a safe content type and a download disposition.
func writeDownloadHeaders(w http.ResponseWriter, fileName, contentType string) {
	// Strip any parameters ("image/png; charset=..") before matching.
	base := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	if !safeDownloadContentTypes[base] {
		base = "application/octet-stream"
	}
	w.Header().Set("Content-Type", base)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// Defence in depth: even if a type slipped through, this CSP stops the
	// document from loading scripts or being framed.
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="%s"`, sanitizeObjectPart(fileName)))
}
