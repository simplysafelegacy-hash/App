package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/smtp"
	"strings"
)

type supportTicketRequest struct {
	Subject string `json:"subject"`
	Message string `json:"message"`
}

func (d *Deps) CreateSupportTicket(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(w, r)
	if !ok {
		return
	}

	var req supportTicketRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Subject = strings.TrimSpace(req.Subject)
	req.Message = strings.TrimSpace(req.Message)
	if req.Subject == "" || req.Message == "" {
		writeError(w, http.StatusBadRequest, "subject and message are required")
		return
	}
	if len(req.Subject) > 180 {
		writeError(w, http.StatusBadRequest, "subject is too long")
		return
	}
	if len(req.Message) > 5000 {
		writeError(w, http.StatusBadRequest, "message is too long")
		return
	}

	name := d.supportTicketUserName(r.Context(), u.ID)
	if name == "" {
		name = u.Email
	}

	if err := d.sendSupportTicket(r.Context(), name, u.Email, req.Subject, req.Message); err != nil {
		d.internalError(w, r, err, "failed to open support ticket")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"status": "sent"})
}

func (d *Deps) supportTicketUserName(ctx context.Context, userID string) string {
	var name string
	err := d.DB.QueryRow(ctx, `SELECT COALESCE(name, '') FROM users WHERE id = $1`, userID).Scan(&name)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(name)
}

func (d *Deps) sendSupportTicket(ctx context.Context, name, email, subject, message string) error {
	to := strings.TrimSpace(d.Support.EmailTo)
	if to == "" {
		to = "simplysafelegacy@gmail.com"
	}

	body := fmt.Sprintf(
		"New support ticket\n\nFrom: %s <%s>\nSubject: %s\n\n%s\n",
		name,
		email,
		subject,
		message,
	)

	if strings.TrimSpace(d.Support.SMTPHost) == "" {
		if d.Dev {
			d.Logger.InfoContext(ctx, "support ticket email skipped; SMTP is not configured",
				slog.String("to", to),
				slog.String("from", email),
				slog.String("subject", subject),
				slog.String("message", message),
			)
			return nil
		}
		return fmt.Errorf("SMTP_HOST is required to send support tickets")
	}

	from := strings.TrimSpace(d.Support.SMTPFrom)
	if from == "" {
		from = strings.TrimSpace(d.Support.SMTPUsername)
	}
	if from == "" {
		from = to
	}

	headers := []string{
		"To: " + to,
		"From: " + from,
		"Reply-To: " + email,
		"Subject: [Simply Safe Legacy] " + sanitizeEmailHeader(subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
	}
	msg := strings.Join(headers, "\r\n") + "\r\n\r\n" + body

	addr := d.Support.SMTPHost + ":" + d.Support.SMTPPort
	var auth smtp.Auth
	if d.Support.SMTPUsername != "" || d.Support.SMTPPassword != "" {
		auth = smtp.PlainAuth("", d.Support.SMTPUsername, d.Support.SMTPPassword, d.Support.SMTPHost)
	}
	return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg))
}

func sanitizeEmailHeader(s string) string {
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	return strings.TrimSpace(s)
}
