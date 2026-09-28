package handlers

import (
	"testing"

	"github.com/simplysafelegacy/backend/internal/models"
)

// A trust is death-operative, so it uses the will's steward(now) /
// successor(after-death) model rather than the POA/directive roles.
func TestTrustUsesStewardSuccessorModel(t *testing.T) {
	if !stewardSuccessorSection(models.SectionTrust) {
		t.Fatal("trust must use the steward/successor access model")
	}
	for _, role := range []string{models.RoleSteward, models.RoleSuccessor} {
		timing := models.AccessNow
		if role == models.RoleSuccessor {
			timing = models.AccessAfterDeath
		}
		msg := validateMemberPermissions([]models.MemberPermission{{
			DocumentType:   models.SectionTrust,
			PermissionRole: role,
			AccessTiming:   timing,
		}})
		if msg != "" {
			t.Errorf("trust %s permission rejected: %s", role, msg)
		}
	}
}

// The POA and health-care roles are bound to their own documents and must not
// be grantable over a trust.
func TestTrustRejectsIncapacityRoles(t *testing.T) {
	for _, role := range []string{models.RolePOAAgent, models.RoleHealthCareProxy} {
		msg := validateMemberPermissions([]models.MemberPermission{{
			DocumentType:   models.SectionTrust,
			PermissionRole: role,
			AccessTiming:   models.AccessIncapacitated,
		}})
		if msg == "" {
			t.Errorf("expected %s on a trust to be rejected", role)
		}
	}
}

// Steward and successor are mutually exclusive per section, trust included.
func TestTrustRejectsBothStewardAndSuccessor(t *testing.T) {
	msg := validateMemberPermissions([]models.MemberPermission{
		{DocumentType: models.SectionTrust, PermissionRole: models.RoleSteward, AccessTiming: models.AccessNow},
		{DocumentType: models.SectionTrust, PermissionRole: models.RoleSuccessor, AccessTiming: models.AccessAfterDeath},
	})
	if msg == "" {
		t.Fatal("expected steward+successor on the trust to be rejected")
	}
}

// Release proof: a trust takes a death certificate like a will, never the
// incapacity proof the POA and directive take.
func TestTrustReleasesOnProofOfDeath(t *testing.T) {
	if got := defaultReleaseReason(models.SectionTrust); got != "death" {
		t.Fatalf("default trust release reason = %q, want death", got)
	}
	if !validReleaseRequest(models.SectionTrust, "death") {
		t.Fatal("a trust must be releasable on proof of death")
	}
	if validReleaseRequest(models.SectionTrust, "incapacitated") {
		t.Fatal("a trust must not be releasable on proof of incapacity")
	}
}

// A steward with a trust permission reads it now; a successor waits for the
// trust specifically to be released, and a release of some other document
// does not leak it.
func TestTrustPermissionFollowsTiming(t *testing.T) {
	steward := CtxVault{
		Role:             models.RoleSteward,
		ReleasedDocument: map[string]bool{},
		Permissions: []models.MemberPermission{{
			DocumentType:   models.SectionTrust,
			PermissionRole: models.RoleSteward,
			AccessTiming:   models.AccessNow,
		}},
	}
	if !steward.CanReadDocument(models.SectionTrust) {
		t.Fatal("a trust steward reads the trust now")
	}
	if steward.CanReadDocument(models.SectionWill) {
		t.Fatal("a trust permission must not grant the will")
	}

	successor := CtxVault{
		Role:             models.RoleSuccessor,
		ReleasedDocument: map[string]bool{},
		Permissions: []models.MemberPermission{{
			DocumentType:   models.SectionTrust,
			PermissionRole: models.RoleSuccessor,
			AccessTiming:   models.AccessAfterDeath,
		}},
	}
	if successor.CanReadDocument(models.SectionTrust) {
		t.Fatal("a trust successor must not read before release")
	}
	successor.ReleasedDocument[models.SectionWill] = true
	if successor.CanReadDocument(models.SectionTrust) {
		t.Fatal("releasing the will must not release the trust")
	}
	successor.ReleasedDocument[models.SectionTrust] = true
	if !successor.CanReadDocument(models.SectionTrust) {
		t.Fatal("a trust successor reads the trust once it is released")
	}
}

// A hidden trust permission stays unreadable before release and masks the
// vault's identity, exactly as a hidden will permission does.
func TestHiddenTrustPermissionStaysDark(t *testing.T) {
	vault := CtxVault{
		Role:             models.RoleSuccessor,
		ReleasedDocument: map[string]bool{},
		RecordedDocument: map[string]bool{models.SectionTrust: true},
		Permissions: []models.MemberPermission{{
			DocumentType:   models.SectionTrust,
			PermissionRole: models.RoleSuccessor,
			AccessTiming:   models.AccessAfterDeath,
			Hidden:         true,
		}},
	}
	if vault.CanRead() {
		t.Fatal("a hidden trust permission must not grant read access")
	}
	if !vault.ShouldMaskVaultIdentity() {
		t.Fatal("an all-hidden member must see a masked vault")
	}
	if !vault.CanSubmitReleaseRequest(models.SectionTrust) {
		t.Fatal("a hidden successor must still be able to submit proof")
	}
}

// The trust accepts document copies; the list sections still do not.
func TestTrustAcceptsAttachments(t *testing.T) {
	if !attachmentSectionAllowed(models.SectionTrust) {
		t.Fatal("a trust must accept document copies")
	}
	if attachmentSectionAllowed(models.SectionContacts) {
		t.Fatal("contacts must not accept document copies")
	}
}

// The trust is a paid-plan document: the free plan records a will only.
func TestTrustIsPaidOnly(t *testing.T) {
	if documentAllowedByPlan(freeLimits(), models.SectionTrust) {
		t.Fatal("the free plan must not include a trust")
	}
	if !documentAllowedByPlan(paidLimits(4), models.SectionTrust) {
		t.Fatal("a paid plan must include a trust")
	}
}
