package handlers

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/sealed/backend/internal/auth"
	"github.com/sealed/backend/internal/models"
)

func (d *Deps) ListNotifications(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(w, r)
	if !ok {
		return
	}
	rows, err := d.DB.Query(r.Context(), `
		SELECT id, type, message, read, created_at, vault_id
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 50
	`, u.ID)
	if err != nil {
		d.internalError(w, r, err, "failed to list notifications")
		return
	}
	defer rows.Close()

	out := []models.Notification{}
	for rows.Next() {
		var n models.Notification
		if err := rows.Scan(&n.ID, &n.Type, &n.Message, &n.Read, &n.Timestamp, &n.VaultID); err != nil {
			d.internalError(w, r, err, "scan error")
			return
		}
		out = append(out, n)
	}
	writeJSON(w, http.StatusOK, out)
}

func (d *Deps) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	_, err := d.DB.Exec(r.Context(),
		`UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`, id, u.ID)
	if err != nil {
		d.internalError(w, r, err, "failed to mark as read")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// pushNotification inserts a new notification for a user. Errors are logged
// but never returned to callers — a failed feed insert should never fail the
// user-facing action that triggered it.
func pushNotification(ctx context.Context, d *Deps, userID string, vaultID *string, typ, msg string) error {
	_, err := d.DB.Exec(ctx, `
		INSERT INTO notifications (user_id, vault_id, type, message)
		VALUES ($1, $2, $3, $4)
	`, userID, vaultID, typ, msg)
	if err != nil {
		d.Logger.Warn("notification insert failed", "err", err, "user_id", userID)
	}
	return err
}

// currentUserID is a convenience for handlers that already required auth
// elsewhere — returns "" if no user is in context, which the caller can
// treat as a no-op for fire-and-forget operations like notifications.
func currentUserID(r *http.Request) string {
	if u, ok := auth.UserFrom(r.Context()); ok {
		return u.ID
	}
	return ""
}
