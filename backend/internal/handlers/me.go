package handlers

import (
	"net/http"

	"github.com/sealed/backend/internal/models"
)

// ListMyVaults returns every vault the caller has access to — owned or
// joined. Used to populate the vault switcher in the UI.
func (d *Deps) ListMyVaults(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(w, r)
	if !ok {
		return
	}
	rows, err := d.DB.Query(r.Context(), `
		SELECT v.id, v.name, v.owner_name, v.owner_email,
		       vm.role::text, v.released_at, v.created_at
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
		if err := rows.Scan(
			&s.ID, &s.Name, &s.OwnerName, &s.OwnerEmail,
			&s.Role, &s.ReleasedAt, &s.CreatedAt,
		); err != nil {
			d.internalError(w, r, err, "scan error")
			return
		}
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, out)
}
