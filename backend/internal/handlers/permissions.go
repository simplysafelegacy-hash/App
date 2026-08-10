package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/simplysafelegacy/backend/internal/auth"
	"github.com/simplysafelegacy/backend/internal/models"
)

// CtxVault is the per-request vault scope, populated by the vault middleware
// after looking up the caller's membership.
type CtxVault struct {
	VaultID          string
	Role             string
	Released         bool   // vault.released_at IS NOT NULL
	MemberID         string // the caller's vault_members.id
	AccessTiming     string
	Permissions      []models.MemberPermission
	ReleasedDocument map[string]bool
	RecordedDocument map[string]bool
}

// CanRead reports whether the caller may see vault contents.
//   - owner   → always
//   - steward → always
//   - successor → only the will, after the vault is released
//   - POA / health proxy → their document now or after release, by timing
func (v CtxVault) CanRead() bool {
	if v.Role == models.RoleOwner {
		return true
	}
	for _, p := range v.Permissions {
		if v.permissionCanReadDocument(p, p.DocumentType) {
			return true
		}
	}
	if len(v.Permissions) > 0 {
		return false
	}
	switch v.Role {
	case models.RoleSteward:
		return true
	case models.RoleSuccessor:
		return v.IsDocumentReleased("will")
	case models.RolePOAAgent, models.RoleHealthCareProxy:
		return v.AccessTiming == models.AccessNow || v.IsDocumentReleased(permissionDocumentForRole(v.Role))
	}
	return false
}

func (v CtxVault) CanReadDocument(documentType string) bool {
	if v.Role == models.RoleOwner {
		return true
	}
	for _, p := range v.Permissions {
		if v.permissionCanReadDocument(p, documentType) {
			return true
		}
	}
	if len(v.Permissions) > 0 {
		return false
	}
	// Fallback for members with no explicit permission rows. In practice every
	// non-owner member is created with at least one permission, so this path is
	// rarely hit; it stays conservative and scoped to the will.
	switch v.Role {
	case models.RoleSteward:
		return documentType == models.SectionWill
	case models.RoleSuccessor:
		return documentType == models.SectionWill && v.IsDocumentReleased(documentType)
	case models.RolePOAAgent:
		return documentType == models.SectionPowerOfAttorney && (v.AccessTiming == models.AccessNow || v.IsDocumentReleased(documentType))
	case models.RoleHealthCareProxy:
		return documentType == models.SectionHealthCareDirective && (v.AccessTiming == models.AccessNow || v.IsDocumentReleased(documentType))
	}
	return false
}

func (v CtxVault) IsDocumentReleased(documentType string) bool {
	return v.Released || v.ReleasedDocument[documentType]
}

func (v CtxVault) IsDocumentRecorded(documentType string) bool {
	return v.RecordedDocument[documentType]
}

func (v CtxVault) ShouldMaskVaultIdentity() bool {
	return shouldMaskVaultIdentity(v.Role, v.Permissions, v.Released, v.ReleasedDocument)
}

func shouldMaskVaultIdentity(
	role string,
	permissions []models.MemberPermission,
	vaultReleased bool,
	releasedDocuments map[string]bool,
) bool {
	if role == models.RoleOwner || len(permissions) == 0 {
		return false
	}
	for _, p := range permissions {
		if !p.Hidden {
			return false
		}
	}
	return true
}

func (v CtxVault) CanSubmitReleaseRequest(documentType string) bool {
	if v.Role == models.RoleOwner {
		return false
	}
	return v.IsDocumentRecorded(documentType) && !v.IsDocumentReleased(documentType)
}

func (v CtxVault) permissionCanReadDocument(p models.MemberPermission, documentType string) bool {
	if p.DocumentType != documentType {
		return false
	}
	if p.Hidden {
		return false
	}
	// steward/successor are generic "read now" / "read after release" roles that
	// apply to any section (will and the list/record sections alike). POA and
	// health-care-proxy stay bound to their specific document.
	switch p.PermissionRole {
	case models.RoleSteward:
		return p.AccessTiming == models.AccessNow || v.IsDocumentReleased(documentType)
	case models.RoleSuccessor:
		return v.IsDocumentReleased(documentType)
	case models.RolePOAAgent:
		return documentType == models.SectionPowerOfAttorney && (p.AccessTiming == models.AccessNow || v.IsDocumentReleased(documentType))
	case models.RoleHealthCareProxy:
		return documentType == models.SectionHealthCareDirective && (p.AccessTiming == models.AccessNow || v.IsDocumentReleased(documentType))
	}
	return false
}

func permissionDocumentForRole(role string) string {
	switch role {
	case models.RolePOAAgent:
		return "power_of_attorney"
	case models.RoleHealthCareProxy:
		return "health_care_directive"
	default:
		return "will"
	}
}

// CanModify reports whether the caller may add, edit, or delete vault
// contents (the will, members, vault metadata).
func (v CtxVault) CanModify() bool {
	return v.Role == models.RoleOwner
}

type ctxKey string

const vaultCtxKey ctxKey = "handlers.vault"

func vaultFrom(ctx context.Context) (CtxVault, bool) {
	v, ok := ctx.Value(vaultCtxKey).(CtxVault)
	return v, ok
}

func listReleasedDocuments(ctx context.Context, d *Deps, vaultID string) (map[string]bool, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT document_type
		FROM vault_document_releases
		WHERE vault_id = $1
	`, vaultID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]bool{}
	for rows.Next() {
		var documentType string
		if err := rows.Scan(&documentType); err != nil {
			return nil, err
		}
		out[documentType] = true
	}
	return out, rows.Err()
}

// VaultMiddleware reads the X-Vault-Id header, resolves the caller's role on
// that vault, and attaches CtxVault to the request context. Requests with no
// header or a vault the caller does not belong to are rejected with 404 — we
// don't reveal whether the vault exists.
func (d *Deps) VaultMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		vaultID := r.Header.Get("X-Vault-Id")
		if vaultID == "" {
			writeError(w, http.StatusBadRequest, "X-Vault-Id header required")
			return
		}
		u, ok := auth.UserFrom(r.Context())
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthenticated")
			return
		}

		var (
			released     *string
			role         string
			memberID     string
			accessTiming string
		)
		err := d.DB.QueryRow(r.Context(), `
			SELECT vm.id, vm.role::text, v.released_at::text, COALESCE(vm.access_timing, 'now')
			FROM vault_members vm
			JOIN vaults v ON v.id = vm.vault_id
			WHERE vm.vault_id = $1 AND vm.user_id = $2
		`, vaultID, u.ID).Scan(&memberID, &role, &released, &accessTiming)

		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "vault not found")
				return
			}
			d.internalError(w, r, err, "failed to resolve vault membership")
			return
		}

		ctx := r.Context()
		permissions, err := listMemberPermissions(ctx, d, memberID)
		if err != nil {
			d.internalError(w, r, err, "failed to resolve vault permissions")
			return
		}
		releasedDocuments, err := listReleasedDocuments(ctx, d, vaultID)
		if err != nil {
			d.internalError(w, r, err, "failed to resolve released documents")
			return
		}
		recordedDocuments, err := listRecordedDocumentTypes(ctx, d, vaultID)
		if err != nil {
			d.internalError(w, r, err, "failed to resolve recorded documents")
			return
		}
		ctx = context.WithValue(ctx, vaultCtxKey, CtxVault{
			VaultID:          vaultID,
			Role:             role,
			Released:         released != nil,
			MemberID:         memberID,
			AccessTiming:     accessTiming,
			Permissions:      permissions,
			ReleasedDocument: releasedDocuments,
			RecordedDocument: releasedDocumentMap(recordedDocuments),
		})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireVault loads the vault scope or aborts the request with 401/403.
func requireVault(w http.ResponseWriter, r *http.Request) (CtxVault, bool) {
	v, ok := vaultFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "no vault scope")
		return CtxVault{}, false
	}
	return v, true
}

func requireRead(w http.ResponseWriter, r *http.Request) (CtxVault, bool) {
	v, ok := requireVault(w, r)
	if !ok {
		return v, false
	}
	if !v.CanRead() {
		writeError(w, http.StatusForbidden, "this vault is sealed; access has not yet been released")
		return v, false
	}
	return v, true
}

func requireOwner(w http.ResponseWriter, r *http.Request) (CtxVault, bool) {
	v, ok := requireVault(w, r)
	if !ok {
		return v, false
	}
	if !v.CanModify() {
		writeError(w, http.StatusForbidden, "only the vault owner may perform this action")
		return v, false
	}
	return v, true
}
