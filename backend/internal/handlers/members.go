package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/simplysafelegacy/backend/internal/models"
)

type memberReq struct {
	Name         string                    `json:"name"`
	Email        string                    `json:"email"`
	Role         string                    `json:"role"`
	DateOfBirth  string                    `json:"dateOfBirth"`
	AccessTiming string                    `json:"accessTiming"`
	Permissions  []models.MemberPermission `json:"permissions"`
}

func (d *Deps) ListMembers(w http.ResponseWriter, r *http.Request) {
	v, ok := requireRead(w, r)
	if !ok {
		return
	}
	// Stewards / successors only see themselves to avoid leaking who else
	// has access. Owners see everyone.
	if v.CanModify() {
		members, err := listMembers(r.Context(), d, v.VaultID)
		if err != nil {
			d.internalError(w, r, err, "failed to list members")
			return
		}
		writeJSON(w, http.StatusOK, members)
		return
	}
	writeJSON(w, http.StatusOK, []models.VaultMember{})
}

func (d *Deps) CreateMember(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	var req memberReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Name = strings.TrimSpace(req.Name)
	req.DateOfBirth = strings.TrimSpace(req.DateOfBirth)
	req.AccessTiming = strings.TrimSpace(req.AccessTiming)
	req.Permissions = normalizeRequestedPermissions(req)
	if req.Email == "" || req.Name == "" || req.DateOfBirth == "" {
		writeError(w, http.StatusBadRequest, "name, birthday, and email are required")
		return
	}
	if len(req.Permissions) == 0 {
		writeError(w, http.StatusBadRequest, "at least one permission is required")
		return
	}
	if msg := validateMemberPermissions(req.Permissions); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	if req.Role == "" {
		req.Role = primaryRoleFromPermissions(req.Permissions)
	}
	if !validMemberRole(req.Role) {
		writeError(w, http.StatusBadRequest, "unsupported member role")
		return
	}
	dob, err := time.Parse("2006-01-02", req.DateOfBirth)
	if err != nil {
		writeError(w, http.StatusBadRequest, "birthday must be YYYY-MM-DD")
		return
	}
	if req.Role != "" {
		if req.AccessTiming == "" {
			req.AccessTiming = primaryAccessTimingFromPermissions(req.Role, req.Permissions)
		}
		req.AccessTiming = normalizeAccessTiming(req.Role, req.AccessTiming)
	} else {
		req.AccessTiming = ""
	}
	if req.AccessTiming == "" {
		writeError(w, http.StatusBadRequest, "access timing is invalid for this role")
		return
	}

	ctx := r.Context()
	limits, err := d.effectivePlanLimits(ctx, currentUserID(r))
	if err != nil {
		d.internalError(w, r, err, "failed to load plan limits")
		return
	}
	if !memberRoleAllowedByPlan(limits, req.Role) {
		writeError(w, http.StatusForbidden, "your current plan does not include this permission role")
		return
	}
	for _, permission := range req.Permissions {
		if !memberRoleAllowedByPlan(limits, permission.PermissionRole) {
			writeError(w, http.StatusForbidden, "your current plan does not include this permission role")
			return
		}
	}
	if err := d.checkMemberLimit(ctx, v.VaultID, req.Email, limits.MaxAuthorizedPeople); err != nil {
		if errors.Is(err, errPlanMemberLimit) {
			writeError(w, http.StatusForbidden, fmt.Sprintf(
				"your current plan allows up to %d authorized people",
				limits.MaxAuthorizedPeople,
			))
			return
		}
		d.internalError(w, r, err, "failed to check member limit")
		return
	}

	// Try to link an existing user account by email — if Jane invites
	// michael@... and Michael already has an account, his memberships
	// should appear in his vault switcher immediately.
	var linkedUserID *string
	var found string
	err = d.DB.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, req.Email).Scan(&found)
	switch {
	case err == nil:
		linkedUserID = &found
	case isNoRows(err):
		// pending invite — user_id stays null until they sign up
	default:
		d.internalError(w, r, err, "failed to resolve invitee")
		return
	}

	var m models.VaultMember
	err = d.DB.QueryRow(ctx, `
		INSERT INTO vault_members (vault_id, user_id, name, email, role, date_of_birth, access_timing)
		VALUES ($1, $2, $3, $4, $5::vault_role, $6, $7)
		ON CONFLICT (vault_id, email) DO UPDATE SET
			name = EXCLUDED.name,
			role = EXCLUDED.role,
			date_of_birth = EXCLUDED.date_of_birth,
			access_timing = EXCLUDED.access_timing,
			user_id = COALESCE(EXCLUDED.user_id, vault_members.user_id)
		RETURNING id, COALESCE(user_id::text, ''), name, email, role::text,
		          COALESCE(date_of_birth::text, ''), COALESCE(access_timing, 'now')
	`, v.VaultID, linkedUserID, req.Name, req.Email, req.Role, dob, req.AccessTiming).Scan(
		&m.ID, &m.UserID, &m.Name, &m.Email, &m.Role, &m.DateOfBirth, &m.AccessTiming,
	)
	if err != nil {
		d.internalError(w, r, err, "failed to create member")
		return
	}
	if err := replaceMemberPermissions(ctx, d, m.ID, req.Permissions); err != nil {
		d.internalError(w, r, err, "failed to save member permissions")
		return
	}
	m.Permissions, _ = listMemberPermissions(ctx, d, m.ID)

	_ = pushNotification(ctx, d, currentUserID(r), &v.VaultID, "member_added",
		fmt.Sprintf("%s added to the vault", m.Name))
	writeJSON(w, http.StatusCreated, m)
}

func memberRoleAllowedByPlan(limits models.PlanLimits, role string) bool {
	switch role {
	case models.RoleSteward:
		return limits.AllowWill && limits.MaxAuthorizedPeople > 0
	case models.RoleSuccessor:
		return limits.AllowWill && limits.MaxAuthorizedPeople > 0
	case models.RolePOAAgent:
		return limits.AllowPowerOfAttorney && limits.MaxAuthorizedPeople > 0
	case models.RoleHealthCareProxy:
		return limits.AllowHealthCareDirective && limits.MaxAuthorizedPeople > 0
	default:
		return false
	}
}

func validateMemberPermissions(permissions []models.MemberPermission) string {
	seen := map[string]bool{}
	willRole := ""
	for _, permission := range permissions {
		key := permission.DocumentType + ":" + permission.PermissionRole
		if seen[key] {
			return "duplicate permission selected"
		}
		seen[key] = true

		switch permission.PermissionRole {
		case models.RoleSteward, models.RoleSuccessor:
			if permission.DocumentType != "will" {
				return "will steward and successor permissions must be for the will"
			}
			if permission.PermissionRole == models.RoleSteward && permission.AccessTiming != models.AccessNow {
				return "will steward access must be available now"
			}
			if permission.PermissionRole == models.RoleSuccessor && permission.AccessTiming != models.AccessAfterDeath {
				return "will successor access must be after death"
			}
			if willRole != "" && willRole != permission.PermissionRole {
				return "choose either will steward or will successor, not both"
			}
			willRole = permission.PermissionRole
		case models.RolePOAAgent:
			if permission.DocumentType != "power_of_attorney" {
				return "power of attorney agent permission must be for power of attorney"
			}
		case models.RoleHealthCareProxy:
			if permission.DocumentType != "health_care_directive" {
				return "health care proxy permission must be for health care directive"
			}
		default:
			return "unsupported permission role"
		}
	}
	return ""
}

func (d *Deps) UpdateMember(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var req memberReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Role != "" && !validMemberRole(req.Role) {
		writeError(w, http.StatusBadRequest, "unsupported member role")
		return
	}
	if len(req.Permissions) > 0 {
		for i := range req.Permissions {
			req.Permissions[i] = normalizeMemberPermission(req.Permissions[i])
		}
		if msg := validateMemberPermissions(req.Permissions); msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}
	}
	if req.Role == "" && len(req.Permissions) > 0 {
		req.Role = primaryRoleFromPermissions(req.Permissions)
	}
	if req.Role != "" || len(req.Permissions) > 0 {
		limits, err := d.effectivePlanLimits(r.Context(), currentUserID(r))
		if err != nil {
			d.internalError(w, r, err, "failed to load plan limits")
			return
		}
		if req.Role != "" && !memberRoleAllowedByPlan(limits, req.Role) {
			writeError(w, http.StatusForbidden, "your current plan does not include this permission role")
			return
		}
		for _, permission := range req.Permissions {
			if !memberRoleAllowedByPlan(limits, permission.PermissionRole) {
				writeError(w, http.StatusForbidden, "your current plan does not include this permission role")
				return
			}
		}
	}
	if req.Role != "" {
		if req.AccessTiming == "" {
			req.AccessTiming = primaryAccessTimingFromPermissions(req.Role, req.Permissions)
		}
		req.AccessTiming = normalizeAccessTiming(req.Role, req.AccessTiming)
	} else {
		req.AccessTiming = ""
	}

	var m models.VaultMember
	err := d.DB.QueryRow(r.Context(), `
		UPDATE vault_members SET
			name = COALESCE(NULLIF($3,''), name),
			role = COALESCE(NULLIF($4,'')::vault_role, role),
			access_timing = COALESCE(NULLIF($5,''), access_timing)
		WHERE id = $1 AND vault_id = $2 AND role <> 'owner'
		RETURNING id, COALESCE(user_id::text,''), name, email, role::text,
		          COALESCE(date_of_birth::text, ''), COALESCE(access_timing, 'now')
	`, id, v.VaultID, req.Name, req.Role, req.AccessTiming).Scan(
		&m.ID, &m.UserID, &m.Name, &m.Email, &m.Role, &m.DateOfBirth, &m.AccessTiming,
	)
	if err != nil {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	if len(req.Permissions) > 0 {
		if err := replaceMemberPermissions(r.Context(), d, m.ID, req.Permissions); err != nil {
			d.internalError(w, r, err, "failed to save member permissions")
			return
		}
	}
	m.Permissions, _ = listMemberPermissions(r.Context(), d, m.ID)
	writeJSON(w, http.StatusOK, m)
}

func (d *Deps) DeleteMember(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	tag, err := d.DB.Exec(r.Context(),
		`DELETE FROM vault_members WHERE id = $1 AND vault_id = $2 AND role <> 'owner'`,
		id, v.VaultID)
	if err != nil {
		d.internalError(w, r, err, "failed to remove member")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// listMembers returns every member of the vault, owners included.
func listMembers(ctx context.Context, d *Deps, vaultID string) ([]models.VaultMember, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT id, COALESCE(user_id::text, ''), name, email, role::text,
		       COALESCE(date_of_birth::text, ''), COALESCE(access_timing, 'now')
		FROM vault_members
		WHERE vault_id = $1
		ORDER BY (role = 'owner') DESC, created_at ASC
	`, vaultID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.VaultMember{}
	for rows.Next() {
		var m models.VaultMember
		if err := rows.Scan(&m.ID, &m.UserID, &m.Name, &m.Email, &m.Role, &m.DateOfBirth, &m.AccessTiming); err != nil {
			return nil, err
		}
		permissions, err := listMemberPermissions(ctx, d, m.ID)
		if err != nil {
			return nil, err
		}
		m.Permissions = permissions
		out = append(out, m)
	}
	return out, rows.Err()
}

func normalizeRequestedPermissions(req memberReq) []models.MemberPermission {
	if len(req.Permissions) > 0 {
		out := make([]models.MemberPermission, 0, len(req.Permissions))
		for _, permission := range req.Permissions {
			permission = normalizeMemberPermission(permission)
			if permission.DocumentType != "" && permission.PermissionRole != "" {
				out = append(out, permission)
			}
		}
		return out
	}

	documentType := "will"
	if req.Role == models.RolePOAAgent {
		documentType = "power_of_attorney"
	}
	if req.Role == models.RoleHealthCareProxy {
		documentType = "health_care_directive"
	}
	return []models.MemberPermission{normalizeMemberPermission(models.MemberPermission{
		DocumentType:   documentType,
		PermissionRole: req.Role,
		AccessTiming:   normalizeAccessTiming(req.Role, req.AccessTiming),
	})}
}

func normalizeMemberPermission(permission models.MemberPermission) models.MemberPermission {
	permission.DocumentType = strings.TrimSpace(permission.DocumentType)
	permission.PermissionRole = strings.TrimSpace(permission.PermissionRole)
	permission.AccessTiming = strings.TrimSpace(permission.AccessTiming)

	if permission.DocumentType == "will" {
		if permission.AccessTiming == models.AccessAfterDeath ||
			permission.PermissionRole == models.RoleSuccessor {
			permission.PermissionRole = models.RoleSuccessor
			permission.AccessTiming = models.AccessAfterDeath
			return permission
		}
		permission.PermissionRole = models.RoleSteward
		permission.AccessTiming = models.AccessNow
		return permission
	}

	permission.AccessTiming = normalizeAccessTiming(permission.PermissionRole, permission.AccessTiming)
	return permission
}

func primaryRoleFromPermissions(permissions []models.MemberPermission) string {
	for _, p := range permissions {
		if p.PermissionRole == models.RoleSteward {
			return p.PermissionRole
		}
	}
	for _, p := range permissions {
		if (p.PermissionRole == models.RolePOAAgent || p.PermissionRole == models.RoleHealthCareProxy) &&
			p.AccessTiming == models.AccessNow {
			return p.PermissionRole
		}
	}
	for _, p := range permissions {
		if p.PermissionRole == models.RoleSuccessor {
			return p.PermissionRole
		}
	}
	if len(permissions) > 0 {
		return permissions[0].PermissionRole
	}
	return ""
}

func primaryAccessTimingFromPermissions(role string, permissions []models.MemberPermission) string {
	for _, p := range permissions {
		if p.PermissionRole == role {
			return p.AccessTiming
		}
	}
	return ""
}

func listMemberPermissions(ctx context.Context, d *Deps, memberID string) ([]models.MemberPermission, error) {
	rows, err := d.DB.Query(ctx, `
		SELECT id, document_type, permission_role, access_timing, hidden
		FROM vault_member_permissions
		WHERE member_id = $1
		ORDER BY document_type, permission_role
	`, memberID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.MemberPermission{}
	for rows.Next() {
		var p models.MemberPermission
		if err := rows.Scan(&p.ID, &p.DocumentType, &p.PermissionRole, &p.AccessTiming, &p.Hidden); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func replaceMemberPermissions(ctx context.Context, d *Deps, memberID string, permissions []models.MemberPermission) error {
	tx, err := d.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM vault_member_permissions WHERE member_id = $1`, memberID); err != nil {
		return err
	}
	for _, p := range permissions {
		p = normalizeMemberPermission(p)
		if _, err := tx.Exec(ctx, `
			INSERT INTO vault_member_permissions (
				member_id, document_type, permission_role, access_timing, hidden
			) VALUES ($1, $2, $3, $4, $5)
		`, memberID, p.DocumentType, p.PermissionRole, p.AccessTiming, p.Hidden); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func validMemberRole(role string) bool {
	switch role {
	case models.RoleSteward, models.RoleSuccessor, models.RolePOAAgent, models.RoleHealthCareProxy:
		return true
	}
	return false
}

func normalizeAccessTiming(role, timing string) string {
	switch role {
	case models.RoleSuccessor:
		return models.AccessAfterDeath
	case models.RolePOAAgent, models.RoleHealthCareProxy:
		if timing == "" {
			return models.AccessIncapacitated
		}
		if timing == models.AccessNow || timing == models.AccessIncapacitated {
			return timing
		}
		return ""
	default:
		return models.AccessNow
	}
}

var errPlanMemberLimit = errors.New("plan member limit reached")

func (d *Deps) checkMemberLimit(ctx context.Context, vaultID, email string, maxAuthorizedPeople int) error {
	var existing int
	if err := d.DB.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM vault_members
		WHERE vault_id = $1 AND role <> 'owner' AND email <> $2
	`, vaultID, email).Scan(&existing); err != nil {
		return err
	}
	if existing >= maxAuthorizedPeople {
		return errPlanMemberLimit
	}
	return nil
}
