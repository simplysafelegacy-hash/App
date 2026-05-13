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
	VaultID  string
	Role     string
	Released bool   // vault.released_at IS NOT NULL
	MemberID string // the caller's vault_members.id
}

// CanRead reports whether the caller may see vault contents.
//   - owner   → always
//   - steward → always
//   - successor → only after the vault is released
func (v CtxVault) CanRead() bool {
	switch v.Role {
	case models.RoleOwner, models.RoleSteward:
		return true
	case models.RoleSuccessor:
		return v.Released
	}
	return false
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
			released *string
			role     string
			memberID string
		)
		err := d.DB.QueryRow(r.Context(), `
			SELECT vm.id, vm.role::text, v.released_at::text
			FROM vault_members vm
			JOIN vaults v ON v.id = vm.vault_id
			WHERE vm.vault_id = $1 AND vm.user_id = $2
		`, vaultID, u.ID).Scan(&memberID, &role, &released)

		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "vault not found")
				return
			}
			d.internalError(w, r, err, "failed to resolve vault membership")
			return
		}

		ctx := context.WithValue(r.Context(), vaultCtxKey, CtxVault{
			VaultID:  vaultID,
			Role:     role,
			Released: released != nil,
			MemberID: memberID,
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
