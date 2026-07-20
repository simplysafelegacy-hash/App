package handlers

import (
	"context"
	"net/http"

	"github.com/simplysafelegacy/backend/internal/models"
)

// ListMyVaults returns every vault the caller has access to — owned or
// joined. Used to populate the vault switcher in the UI.
func (d *Deps) ListMyVaults(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(w, r)
	if !ok {
		return
	}
	rows, err := d.DB.Query(r.Context(), `
		SELECT v.id, v.name, v.owner_name, v.owner_email, vm.id,
		       vm.role::text, COALESCE(vm.access_timing, 'now'), v.released_at, v.created_at
		FROM vault_members vm
		JOIN vaults v ON v.id = vm.vault_id
		WHERE vm.user_id = $1
		ORDER BY (vm.role = 'owner') DESC, v.created_at DESC
	`, u.ID)
	if err != nil {
		d.internalError(w, r, err, "failed to list vaults")
		return
	}
	defer rows.Close()

	out := []models.VaultSummary{}
	for rows.Next() {
		var s models.VaultSummary
		var memberID string
		if err := rows.Scan(
			&s.ID, &s.Name, &s.OwnerName, &s.OwnerEmail, &memberID,
			&s.Role, &s.AccessTiming, &s.ReleasedAt, &s.CreatedAt,
		); err != nil {
			d.internalError(w, r, err, "scan error")
			return
		}
		releasedDocuments, err := listReleasedDocumentTypes(r.Context(), d, s.ID)
		if err != nil {
			d.internalError(w, r, err, "failed to list released documents")
			return
		}
		s.ReleasedDocs = releasedDocuments
		recordedDocuments, err := listRecordedDocumentTypes(r.Context(), d, s.ID)
		if err != nil {
			d.internalError(w, r, err, "failed to list recorded documents")
			return
		}
		s.RecordedDocs = recordedDocuments
		memberPermissions, err := listMemberPermissions(r.Context(), d, memberID)
		if err != nil {
			d.internalError(w, r, err, "failed to list member permissions")
			return
		}
		if s.Role != models.RoleOwner {
			if len(memberPermissions) == 0 {
				continue
			}
			s.Role = primaryRoleFromPermissions(memberPermissions)
			s.AccessTiming = primaryAccessTimingFromPermissions(s.Role, memberPermissions)
			if shouldMaskVaultIdentity(s.Role, memberPermissions, s.ReleasedAt != nil, releasedDocumentMap(releasedDocuments)) {
				s.Name = "Sealed vault"
				s.OwnerName = "Vault owner"
				s.OwnerEmail = ""
			}
		}
		s.Permissions = memberPermissions
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, out)
}

func releasedDocumentMap(documentTypes []string) map[string]bool {
	out := map[string]bool{}
	for _, documentType := range documentTypes {
		out[documentType] = true
	}
	return out
}

func listRecordedDocumentTypes(ctx context.Context, d *Deps, vaultID string) ([]string, error) {
	var hasWill, hasPOA, hasHealth bool
	if err := d.DB.QueryRow(ctx, `
		SELECT has_will, has_power_of_attorney, has_health_care_directive
		FROM vaults
		WHERE id = $1
	`, vaultID).Scan(&hasWill, &hasPOA, &hasHealth); err != nil {
		return nil, err
	}

	out := []string{}
	if hasWill {
		out = append(out, "will")
	}
	if hasPOA {
		out = append(out, "power_of_attorney")
	}
	if hasHealth {
		out = append(out, "health_care_directive")
	}
	return out, nil
}

func listReleasedDocumentTypes(ctx context.Context, d *Deps, vaultID string) ([]string, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT document_type
		FROM vault_document_releases
		WHERE vault_id = $1
		ORDER BY document_type
	`, vaultID)
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
	return out, rows.Err()
}
