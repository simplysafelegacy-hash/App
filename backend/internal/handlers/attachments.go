package handlers

import (
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"google.golang.org/api/googleapi"
	storage "google.golang.org/api/storage/v1"

	"github.com/simplysafelegacy/backend/internal/models"
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
	if d.Storage.Bucket == "" {
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
// GCS via a public or signed URL — only through this gated proxy.
func (d *Deps) DownloadAttachment(w http.ResponseWriter, r *http.Request) {
	v, ok := requireVault(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	var section, bucket, objectName, fileName, contentType string
	err := d.DB.QueryRow(r.Context(), `
		SELECT section, gcs_bucket, gcs_object, file_name, content_type
		FROM vault_attachments
		WHERE id = $1 AND vault_id = $2
	`, id, v.VaultID).Scan(&section, &bucket, &objectName, &fileName, &contentType)
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

	svc, err := storage.NewService(r.Context())
	if err != nil {
		d.internalError(w, r, err, "failed to initialize storage")
		return
	}
	resp, err := svc.Objects.Get(bucket, objectName).Download()
	if err != nil {
		if gerr, ok := err.(*googleapi.Error); ok && gerr.Code == http.StatusNotFound {
			writeError(w, http.StatusNotFound, "file not found in storage")
			return
		}
		d.internalError(w, r, err, "failed to download file")
		return
	}
	defer resp.Body.Close()

	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, sanitizeObjectPart(fileName)))
	_, _ = io.Copy(w, resp.Body)
}

// DeleteAttachment removes a document copy. Owner-only. The GCS object is
// best-effort deleted; a storage failure does not block removing the row.
func (d *Deps) DeleteAttachment(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	var bucket, objectName string
	err := d.DB.QueryRow(r.Context(), `
		DELETE FROM vault_attachments
		WHERE id = $1 AND vault_id = $2
		RETURNING gcs_bucket, gcs_object
	`, id, v.VaultID).Scan(&bucket, &objectName)
	if err != nil {
		if isNoRows(err) {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		d.internalError(w, r, err, "failed to delete attachment")
		return
	}
	if bucket != "" && objectName != "" {
		if delErr := deleteFromGCS(r.Context(), bucket, objectName); delErr != nil {
			// Row is already gone; log the orphaned object but return success.
			d.Logger.Warn("attachment object not deleted from storage",
				"bucket", bucket, "object", objectName, "err", delErr)
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
	objectName := fmt.Sprintf("%s/attachments/%s/%s/%s", vaultID, section, attachmentID, safeName)

	if err := uploadToGCS(ctx, d.Storage.Bucket, objectName, contentType, file); err != nil {
		return models.VaultAttachment{}, err
	}

	var a models.VaultAttachment
	err = d.DB.QueryRow(ctx, `
		INSERT INTO vault_attachments (
			id, vault_id, section, gcs_bucket, gcs_object,
			file_name, content_type, file_size, uploaded_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, section, entry_id::text, file_name, content_type, file_size, created_at
	`, attachmentID, vaultID, section, d.Storage.Bucket, objectName,
		header.Filename, contentType, header.Size, uploadedBy).Scan(
		&a.ID, &a.Section, &a.EntryID, &a.FileName, &a.ContentType, &a.FileSize, &a.CreatedAt,
	)
	if err != nil {
		// Roll back the just-uploaded object so we don't orphan it.
		_ = deleteFromGCS(ctx, d.Storage.Bucket, objectName)
		return models.VaultAttachment{}, err
	}
	return a, nil
}

func deleteFromGCS(ctx context.Context, bucket, objectName string) error {
	svc, err := storage.NewService(ctx)
	if err != nil {
		return err
	}
	return svc.Objects.Delete(bucket, objectName).Context(ctx).Do()
}
