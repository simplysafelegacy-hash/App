package handlers

import (
	"testing"

	"github.com/simplysafelegacy/backend/internal/models"
)

// freeLimits mirrors migration 017: the free plan records a will and nothing
// else, and carries no authorized people.
func freeLimits() models.PlanLimits {
	return models.PlanLimits{
		PlanCode:            models.PlanFree,
		Name:                "Free",
		MaxAuthorizedPeople: 0,
		AllowWill:           true,
	}
}

func paidLimits(people int) models.PlanLimits {
	return models.PlanLimits{
		PlanCode:                 models.PlanIndividual,
		Name:                     "Individual",
		MaxAuthorizedPeople:      people,
		AllowWill:                true,
		AllowPowerOfAttorney:     true,
		AllowHealthCareDirective: true,
		AllowPersonalProperty:    true,
		AllowNonProbate:          true,
		AllowFuneral:             true,
		AllowContacts:            true,
	}
}

func TestFreePlanAllowsOnlyTheWill(t *testing.T) {
	limits := freeLimits()
	if !documentAllowedByPlan(limits, models.SectionWill) {
		t.Fatal("free plan must include the will")
	}
	for _, section := range []string{
		models.SectionPowerOfAttorney, models.SectionHealthCareDirective,
		models.SectionPersonalProperty, models.SectionNonProbate,
		models.SectionFuneral, models.SectionContacts,
	} {
		if documentAllowedByPlan(limits, section) {
			t.Errorf("free plan must not include %q", section)
		}
	}
}

// A section nobody has heard of is denied rather than defaulting open.
func TestUnknownSectionIsDenied(t *testing.T) {
	if documentAllowedByPlan(paidLimits(4), "crypto_wallet") {
		t.Fatal("unknown sections must be denied by every plan")
	}
}

// Zero authorized people means no permission is grantable at all, whatever
// the section — the free plan cannot share the will it is allowed to record.
func TestFreePlanGrantsNoPermissions(t *testing.T) {
	willSteward := models.MemberPermission{
		DocumentType:   models.SectionWill,
		PermissionRole: models.RoleSteward,
		AccessTiming:   models.AccessNow,
	}
	if memberPermissionAllowedByPlan(freeLimits(), willSteward) {
		t.Fatal("free plan allows no authorized people, so no permission either")
	}
	if !memberPermissionAllowedByPlan(paidLimits(4), willSteward) {
		t.Fatal("a paid plan must allow a will steward")
	}
}

// The two paid plans differ only in how many people they allow.
func TestPaidPlansDifferOnlyInPeopleCount(t *testing.T) {
	individual, family := paidLimits(4), paidLimits(15)
	for _, section := range []string{
		models.SectionWill, models.SectionPowerOfAttorney,
		models.SectionHealthCareDirective, models.SectionPersonalProperty,
		models.SectionNonProbate, models.SectionFuneral, models.SectionContacts,
	} {
		if documentAllowedByPlan(individual, section) != documentAllowedByPlan(family, section) {
			t.Errorf("paid plans must agree on section %q", section)
		}
	}
}
