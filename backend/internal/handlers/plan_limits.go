package handlers

import (
	"context"
	"fmt"

	"github.com/simplysafelegacy/backend/internal/models"
)

func (d *Deps) listPlanLimits(ctx context.Context, activeOnly bool) ([]models.PlanLimits, error) {
	sql := `
		SELECT plan_code, name, price_cents, cadence, display_order,
		       max_authorized_people, allow_will, allow_power_of_attorney,
		       allow_health_care_directive, allow_personal_property,
		       allow_non_probate, allow_funeral, allow_contacts, active
		FROM subscription_plan_limits
	`
	if activeOnly {
		sql += ` WHERE active = TRUE`
	}
	sql += ` ORDER BY display_order ASC, price_cents ASC`

	rows, err := d.DB.Query(ctx, sql)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.PlanLimits{}
	for rows.Next() {
		var limits models.PlanLimits
		if err := rows.Scan(
			&limits.PlanCode, &limits.Name, &limits.PriceCents, &limits.Cadence,
			&limits.DisplayOrder, &limits.MaxAuthorizedPeople, &limits.AllowWill,
			&limits.AllowPowerOfAttorney, &limits.AllowHealthCareDirective,
			&limits.AllowPersonalProperty, &limits.AllowNonProbate,
			&limits.AllowFuneral, &limits.AllowContacts, &limits.Active,
		); err != nil {
			return nil, err
		}
		out = append(out, limits)
	}
	return out, rows.Err()
}

func (d *Deps) effectivePlanLimits(ctx context.Context, userID string) (models.PlanLimits, error) {
	var status, plan *string
	if err := d.DB.QueryRow(ctx, `
		SELECT subscription_status, subscription_plan
		FROM users
		WHERE id = $1
	`, userID).Scan(&status, &plan); err != nil {
		return models.PlanLimits{}, err
	}

	planCode := models.PlanFree
	if status != nil && plan != nil && (*status == "active" || *status == "trialing") && *plan != "" {
		planCode = *plan
	}

	limits, err := d.planLimitsByCode(ctx, planCode)
	if err == nil {
		return limits, nil
	}
	if isNoRows(err) && planCode != models.PlanFree {
		return d.planLimitsByCode(ctx, models.PlanFree)
	}
	return models.PlanLimits{}, err
}

func (d *Deps) planLimitsByCode(ctx context.Context, planCode string) (models.PlanLimits, error) {
	var limits models.PlanLimits
	err := d.DB.QueryRow(ctx, `
		SELECT plan_code, name, price_cents, cadence, display_order,
		       max_authorized_people, allow_will, allow_power_of_attorney,
		       allow_health_care_directive, allow_personal_property,
		       allow_non_probate, allow_funeral, allow_contacts, active
		FROM subscription_plan_limits
		WHERE plan_code = $1
	`, planCode).Scan(
		&limits.PlanCode, &limits.Name, &limits.PriceCents, &limits.Cadence,
		&limits.DisplayOrder, &limits.MaxAuthorizedPeople, &limits.AllowWill,
		&limits.AllowPowerOfAttorney, &limits.AllowHealthCareDirective,
		&limits.AllowPersonalProperty, &limits.AllowNonProbate,
		&limits.AllowFuneral, &limits.AllowContacts, &limits.Active,
	)
	return limits, err
}

func documentAllowedByPlan(limits models.PlanLimits, documentType string) bool {
	switch documentType {
	case models.SectionWill:
		return limits.AllowWill
	case models.SectionPowerOfAttorney:
		return limits.AllowPowerOfAttorney
	case models.SectionHealthCareDirective:
		return limits.AllowHealthCareDirective
	case models.SectionPersonalProperty:
		return limits.AllowPersonalProperty
	case models.SectionNonProbate:
		return limits.AllowNonProbate
	case models.SectionFuneral:
		return limits.AllowFuneral
	case models.SectionContacts:
		return limits.AllowContacts
	default:
		return false
	}
}

func documentPlanError(documentType string) string {
	switch documentType {
	case "power_of_attorney":
		return "your current plan does not include power of attorney documents"
	case "health_care_directive":
		return "your current plan does not include health care directive documents"
	case "will":
		return "your current plan does not include will documents"
	default:
		return fmt.Sprintf("your current plan does not include %s documents", documentType)
	}
}
