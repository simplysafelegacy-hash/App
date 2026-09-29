package handlers

import (
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/simplysafelegacy/backend/internal/models"
	"github.com/simplysafelegacy/backend/internal/storage"
)

const maxReleaseUploadBytes = 25 << 20

// maxReleaseUploadMemory bounds in-memory buffering; maxReleaseUploadBytes is
// the hard cap, enforced with http.MaxBytesReader.
const maxReleaseUploadMemory = 8 << 20

// A person may submit at most this many release requests per document, to keep
// admin review from being spammed. Counted per requesting member + document.
const maxReleaseRequestsPerDocument = 3

// maxReleaseFiles is the number of proof files allowed on a single submission.
const maxReleaseFiles = 3

var errReleaseRequestLimit = errors.New("release request limit reached")

func (d *Deps) CreateReleaseRequest(w http.ResponseWriter, r *http.Request) {
	v, ok := requireVault(w, r)
	if !ok {
		return
	}
	// See CreateAttachment: ParseMultipartForm bounds memory, not body size.
	// The limit covers the whole submission, not each of the three files.
	r.Body = http.MaxBytesReader(w, r.Body, maxReleaseUploadBytes)
	if err := r.ParseMultipartForm(maxReleaseUploadMemory); err != nil {
		writeError(w, http.StatusBadRequest, "invalid or oversized upload")
		return
	}
	defer r.MultipartForm.RemoveAll()

	// One proof packet may cover several documents: the same physician
	// certifications establish incapacity for both the power of attorney and
	// the health care directive, and one death certificate covers both the will
	// and the trust. `documentTypes` is the multi-valued form field; a single
	// `documentType` is still accepted so older clients keep working.
	requested := dedupeStrings(r.MultipartForm.Value["documentTypes"])
	if len(requested) == 0 {
		requested = dedupeStrings([]string{r.FormValue("documentType")})
	}
	reason := strings.TrimSpace(r.FormValue("releaseReason"))
	note := strings.TrimSpace(r.FormValue("note"))
	if len(requested) == 0 {
		writeError(w, http.StatusBadRequest, "at least one document type is required")
		return
	}
	if reason == "" {
		reason = defaultReleaseReason(requested[0])
	}

	// Every document in one packet must be provable by the same evidence.
	for _, documentType := range requested {
		if !validReleaseRequest(documentType, reason) {
			writeError(w, http.StatusBadRequest, "invalid release request type")
			return
		}
	}

	// Narrow to what this caller may actually submit for, and what is not
	// already at the per-document cap. Partial submissions are the useful
	// behaviour: if the POA is already released, the directive still goes
	// through rather than the whole packet failing.
	documentTypes := make([]string, 0, len(requested))
	var notAllowed, atCap []string
	for _, documentType := range requested {
		if !v.CanSubmitReleaseRequest(documentType) {
			notAllowed = append(notAllowed, documentType)
			continue
		}
		used, err := d.countMemberReleaseRequests(r.Context(), v.VaultID, v.MemberID, documentType)
		if err != nil {
			d.internalError(w, r, err, "failed to count release requests")
			return
		}
		if used >= maxReleaseRequestsPerDocument {
			atCap = append(atCap, documentType)
			continue
		}
		documentTypes = append(documentTypes, documentType)
	}
	if len(documentTypes) == 0 {
		switch {
		case len(atCap) > 0:
			writeError(w, http.StatusForbidden, fmt.Sprintf(
				"you have used all %d submissions for this document", maxReleaseRequestsPerDocument))
		case len(notAllowed) > 0:
			writeError(w, http.StatusForbidden, "you are not allowed to request release for this document")
		default:
			writeError(w, http.StatusBadRequest, "nothing to submit for review")
		}
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

	req, err := d.createReleaseRequest(r.Context(), v, documentTypes, reason, note, files)
	if err != nil {
		if errors.Is(err, errReleaseRequestLimit) {
			writeError(w, http.StatusForbidden, "release request submission limit reached")
			return
		}
		d.internalError(w, r, err, "failed to create release request")
		return
	}
	writeJSON(w, http.StatusCreated, req)
}

// ListReleaseRequests returns the release requests the caller may see.
//
// requireVault, NOT requireRead: whoever submits proof of death is by
// definition a sealed successor who cannot yet read the vault. Gating this on
// CanRead returned 403 to exactly the person who had just uploaded proof, so
// their own submission vanished from the UI and the card invited them to
// upload again as though nothing had been sent.
//
// Scope: the owner sees every submission against their vault. Everyone else
// sees only their own — which is also the unit the per-member submission cap
// counts, so the "N of 3 submissions left" the UI derives from this list now
// matches what the server will actually accept. It also stops one member
// learning that another has filed a death certificate.
func (d *Deps) ListReleaseRequests(w http.ResponseWriter, r *http.Request) {
	v, ok := requireVault(w, r)
	if !ok {
		return
	}
	sql := `
		SELECT id, vault_id, COALESCE(requester_id::text, ''), document_type,
		       release_reason, status, note, created_at
		FROM release_requests
		WHERE vault_id = $1
	`
	args := []any{v.VaultID}
	if !v.CanModify() {
		sql += ` AND requester_id = $2`
		args = append(args, v.MemberID)
	}
	sql += ` ORDER BY created_at DESC`

	rows, err := d.DB.Query(r.Context(), sql, args...)
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
		documentTypes, err := listReleaseRequestDocumentTypes(r.Context(), d, req.ID)
		if err != nil {
			d.internalError(w, r, err, "failed to list release request documents")
			return
		}
		req.DocumentTypes = documentTypes
		out = append(out, req)
	}
	writeJSON(w, http.StatusOK, out)
}

// listReleaseRequestDocumentTypes returns every document one proof packet
// covers. Falls back to the request's representative document_type so a row
// written before migration 019 (or by a client posting a single documentType)
// still reports its coverage.
func listReleaseRequestDocumentTypes(ctx context.Context, d *Deps, requestID string) ([]string, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT document_type FROM release_request_documents
		WHERE release_request_id = $1
		ORDER BY document_type
	`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var documentType string
		if err := rows.Scan(&documentType); err != nil {
			return nil, err
		}
		out = append(out, documentType)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		var documentType string
		if err := d.DB.QueryRow(ctx,
			`SELECT document_type FROM release_requests WHERE id = $1`, requestID,
		).Scan(&documentType); err != nil {
			return nil, err
		}
		out = append(out, documentType)
	}
	return out, nil
}

// dedupeStrings trims, drops blanks, and removes repeats while keeping order.
func dedupeStrings(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, raw := range in {
		v := strings.TrimSpace(raw)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

func (d *Deps) createReleaseRequest(
	ctx context.Context,
	v CtxVault,
	documentTypes []string,
	reason string,
	note string,
	files []*multipart.FileHeader,
) (models.ReleaseRequest, error) {
	tx, err := d.DB.Begin(ctx)
	if err != nil {
		return models.ReleaseRequest{}, err
	}
	defer tx.Rollback(ctx)

	// Serialize submissions by member and recheck the cap inside this transaction.
	// The earlier check supports partial packets; this check closes concurrent races.
	var memberID string
	if err := tx.QueryRow(ctx,
		`SELECT id FROM vault_members WHERE id = $1 AND vault_id = $2 FOR UPDATE`,
		v.MemberID, v.VaultID).Scan(&memberID); err != nil {
		return models.ReleaseRequest{}, err
	}
	for _, documentType := range documentTypes {
		var used int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM release_requests rr
			JOIN release_request_documents rrd ON rrd.release_request_id = rr.id
			WHERE rr.requester_id = $1 AND rr.vault_id = $2 AND rrd.document_type = $3
		`, memberID, v.VaultID, documentType).Scan(&used); err != nil {
			return models.ReleaseRequest{}, err
		}
		if used >= maxReleaseRequestsPerDocument {
			return models.ReleaseRequest{}, errReleaseRequestLimit
		}
	}

	committed := false
	var uploadedKeys []string
	defer func() {
		if committed || len(uploadedKeys) == 0 {
			return
		}
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		defer cancel()
		for _, key := range uploadedKeys {
			if err := d.Storage.Delete(cleanupCtx, d.Storage.Bucket(), key); err != nil {
				d.Logger.Error("failed to remove uncommitted release proof", "key", key, "err", err)
			}
		}
	}()

	var req models.ReleaseRequest
	err = tx.QueryRow(ctx, `
		INSERT INTO release_requests (
			vault_id, requester_id, document_type, release_reason, note
		) VALUES ($1, $2, $3, $4, $5)
		RETURNING id, vault_id, COALESCE(requester_id::text, ''), document_type,
		          release_reason, status, note, created_at
	`, v.VaultID, v.MemberID, documentTypes[0], reason, note).Scan(
		&req.ID, &req.VaultID, &req.RequesterID, &req.DocumentType,
		&req.ReleaseReason, &req.Status, &req.Note, &req.CreatedAt,
	)
	if err != nil {
		return models.ReleaseRequest{}, err
	}

	// The coverage set. document_type above is only the representative one.
	for _, documentType := range documentTypes {
		if _, err := tx.Exec(ctx, `
			INSERT INTO release_request_documents (release_request_id, document_type)
			VALUES ($1, $2) ON CONFLICT DO NOTHING
		`, req.ID, documentType); err != nil {
			return models.ReleaseRequest{}, err
		}
	}
	req.DocumentTypes = documentTypes

	for _, header := range files {
		uploaded, err := d.uploadReleaseFile(ctx, v.VaultID, req.ID, header)
		if err != nil {
			return models.ReleaseRequest{}, err
		}
		uploadedKeys = append(uploadedKeys, uploaded.ObjectKey)
		var file models.ReleaseRequestFile
		err = tx.QueryRow(ctx, `
			INSERT INTO release_request_files (
				release_request_id, storage_bucket, storage_key, file_name, content_type, file_size
			) VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id, file_name, content_type, file_size
		`, req.ID, d.Storage.Bucket(), uploaded.ObjectKey, uploaded.FileName, uploaded.ContentType, uploaded.Size).Scan(
			&file.ID, &file.FileName, &file.ContentType, &file.FileSize,
		)
		if err != nil {
			return models.ReleaseRequest{}, err
		}
		req.Files = append(req.Files, file)
	}
	if err := tx.Commit(ctx); err != nil {
		return models.ReleaseRequest{}, err
	}
	committed = true
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
	objectKey := storage.BuildKey(vaultID, "release-requests", requestID, uuid.NewString(), safeName)

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
		FROM release_requests rr
		JOIN release_request_documents rrd ON rrd.release_request_id = rr.id
		WHERE rr.vault_id = $1 AND rr.requester_id = $2 AND rrd.document_type = $3
	`, vaultID, memberID, documentType).Scan(&n)
	return n, err
}

// listReleaseRequestFiles is the member-facing file list. It deliberately
// omits storage_key: nothing in the UI reads it, and an object key is not
// something to hand to someone who cannot download the object anyway.
func listReleaseRequestFiles(ctx context.Context, d *Deps, requestID string) ([]models.ReleaseRequestFile, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT id, file_name, content_type, file_size
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
		if err := rows.Scan(&f.ID, &f.FileName, &f.ContentType, &f.FileSize); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func defaultReleaseReason(documentType string) string {
	if stewardSuccessorSection(documentType) {
		return "death"
	}
	return "incapacitated"
}

// deathOperativeSections are the sections whose grants are gated on death —
// every section that uses the steward(now)/successor(after-death) model.
//
// Death is a fact about the person, not about one document. When an admin
// accepts a death certificate, every after-death grant the owner made has to
// activate, or it can never activate at all: nothing else in the system ever
// writes vault_document_releases, and the owner cannot release their own vault
// once they are dead. Before this existed, an after-death grant on the lists,
// funeral wishes or contacts was permanently unreachable — grantable in the UI
// but impossible to open.
func deathOperativeSections() []string {
	return []string{
		models.SectionWill,
		models.SectionTrust,
		models.SectionPersonalProperty,
		models.SectionNonProbate,
		models.SectionFuneral,
		models.SectionContacts,
	}
}

func validReleaseRequest(documentType, reason string) bool {
	switch documentType {
	case models.SectionPowerOfAttorney, models.SectionHealthCareDirective:
		// The incapacity pair, each with its own role and its own proof.
		return reason == "incapacitated"
	default:
		// Everything else is death-operative. Accepting the list sections here
		// (not just will and trust) means a vault whose only recorded content
		// is a funeral wish or a contact list can still have death proven
		// against it.
		return reason == "death" && stewardSuccessorSection(documentType)
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
