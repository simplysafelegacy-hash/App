package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/simplysafelegacy/backend/internal/models"
)

type updateFuneralReq struct {
	HasFuneral      bool   `json:"hasFuneral"`
	Disposition     string `json:"disposition"`
	ServiceWishes   string `json:"serviceWishes"`
	ServiceLocation string `json:"serviceLocation"`
	Officiant       string `json:"officiant"`
	ReadingsMusic   string `json:"readingsMusic"`
	PrepaidProvider string `json:"prepaidProvider"`
	Notes           string `json:"notes"`
}

var validDispositions = map[string]bool{
	"burial": true, "cremation": true, "donation": true, "undecided": true,
}

// UpdateFuneralWishes records (or clears) the funeral & burial wishes for the
// active vault. Owner-only and plan-gated. hasFuneral=false clears the fields.
func (d *Deps) UpdateFuneralWishes(w http.ResponseWriter, r *http.Request) {
	v, ok := requireOwner(w, r)
	if !ok {
		return
	}
	var req updateFuneralReq
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	limits, err := d.effectivePlanLimits(r.Context(), currentUserID(r))
	if err != nil {
		d.internalError(w, r, err, "failed to load plan limits")
		return
	}
	if req.HasFuneral && !documentAllowedByPlan(limits, models.SectionFuneral) {
		writeError(w, http.StatusForbidden, documentPlanError(models.SectionFuneral))
		return
	}

	wishes := models.FuneralWishes{HasFuneral: req.HasFuneral}
	if req.HasFuneral {
		wishes.Disposition = strings.TrimSpace(req.Disposition)
		if wishes.Disposition != "" && !validDispositions[wishes.Disposition] {
			writeError(w, http.StatusBadRequest, "invalid disposition")
			return
		}
		wishes.ServiceWishes = strings.TrimSpace(req.ServiceWishes)
		wishes.ServiceLocation = strings.TrimSpace(req.ServiceLocation)
		wishes.Officiant = strings.TrimSpace(req.Officiant)
		wishes.ReadingsMusic = strings.TrimSpace(req.ReadingsMusic)
		wishes.PrepaidProvider = strings.TrimSpace(req.PrepaidProvider)
		wishes.Notes = strings.TrimSpace(req.Notes)
		now := time.Now()
		wishes.UpdatedAt = &now
	}

	if _, err := d.DB.Exec(r.Context(), `
		INSERT INTO vault_funeral_wishes (
			vault_id, has_funeral, disposition, service_wishes, service_location,
			officiant, readings_music, prepaid_provider, notes, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (vault_id) DO UPDATE SET
			has_funeral = EXCLUDED.has_funeral,
			disposition = EXCLUDED.disposition,
			service_wishes = EXCLUDED.service_wishes,
			service_location = EXCLUDED.service_location,
			officiant = EXCLUDED.officiant,
			readings_music = EXCLUDED.readings_music,
			prepaid_provider = EXCLUDED.prepaid_provider,
			notes = EXCLUDED.notes,
			updated_at = EXCLUDED.updated_at
	`, v.VaultID, wishes.HasFuneral, wishes.Disposition, wishes.ServiceWishes,
		wishes.ServiceLocation, wishes.Officiant, wishes.ReadingsMusic,
		wishes.PrepaidProvider, wishes.Notes, wishes.UpdatedAt); err != nil {
		d.internalError(w, r, err, "failed to update funeral wishes")
		return
	}

	_ = pushNotification(r.Context(), d, currentUserID(r), &v.VaultID, "document_updated", "Funeral wishes updated")
	writeJSON(w, http.StatusOK, wishes)
}

// loadFuneralWishes returns the funeral record for a vault, or a zero-value
// (has_funeral=false) record when none exists yet.
func loadFuneralWishes(ctx context.Context, d *Deps, vaultID string) (models.FuneralWishes, error) {
	var f models.FuneralWishes
	err := d.DB.QueryRow(ctx, `
		SELECT has_funeral, disposition, service_wishes, service_location,
		       officiant, readings_music, prepaid_provider, notes, updated_at
		FROM vault_funeral_wishes
		WHERE vault_id = $1
	`, vaultID).Scan(
		&f.HasFuneral, &f.Disposition, &f.ServiceWishes, &f.ServiceLocation,
		&f.Officiant, &f.ReadingsMusic, &f.PrepaidProvider, &f.Notes, &f.UpdatedAt,
	)
	if err != nil {
		if isNoRows(err) {
			return models.FuneralWishes{}, nil
		}
		return models.FuneralWishes{}, err
	}
	return f, nil
}
