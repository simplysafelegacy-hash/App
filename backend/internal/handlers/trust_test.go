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

// Regression guard for the sealed-successor blind spot.
//
// The person who submits proof of death is, by definition, someone who cannot
// yet read the vault — CanRead is false and CanSubmitReleaseRequest is true at
// the same time. ListReleaseRequests was gated on requireRead, so it answered
// 403 to exactly the caller who had just uploaded proof: their submission
// disappeared from the UI and the card offered a fresh upload as though
// nothing had been sent.
//
// If these two predicates ever stop diverging, or if that handler goes back to
// requireRead, this test is the note explaining why it must not.
func TestSealedSubmitterCannotReadButCanSubmit(t *testing.T) {
	for _, section := range []string{models.SectionWill, models.SectionTrust} {
		sealed := CtxVault{
			Role:             models.RoleSuccessor,
			MemberID:         "member-1",
			ReleasedDocument: map[string]bool{},
			RecordedDocument: map[string]bool{section: true},
			Permissions: []models.MemberPermission{{
				DocumentType:   section,
				PermissionRole: models.RoleSuccessor,
				AccessTiming:   models.AccessAfterDeath,
			}},
		}
		if sealed.CanRead() {
			t.Fatalf("%s: a sealed successor must not be able to read the vault", section)
		}
		if !sealed.CanSubmitReleaseRequest(section) {
			t.Fatalf("%s: a sealed successor must be able to submit proof", section)
		}
		// Therefore the release-request list cannot require read access, or the
		// submitter is locked out of their own submissions.
		if sealed.CanRead() == sealed.CanSubmitReleaseRequest(section) {
			t.Fatalf("%s: the two predicates must diverge for a sealed successor", section)
		}
	}
}

// The owner sees every submission against their vault; a member is scoped to
// their own, which is the unit the per-member cap counts. CanModify is the
// discriminator ListReleaseRequests uses.
func TestOnlyOwnerSeesAllReleaseRequests(t *testing.T) {
	owner := CtxVault{Role: models.RoleOwner}
	if !owner.CanModify() {
		t.Fatal("the owner must be the unscoped reader of release requests")
	}
	for _, role := range []string{
		models.RoleSteward, models.RoleSuccessor,
		models.RolePOAAgent, models.RoleHealthCareProxy,
	} {
		if (CtxVault{Role: role}).CanModify() {
			t.Errorf("%s must be scoped to their own release requests", role)
		}
	}
}

// One proof packet covers every document the same evidence establishes. The
// pairings must match what the UI groups, or a submission is rejected as an
// "invalid release request type".
func TestProofPacketsShareOneReason(t *testing.T) {
	for _, tc := range []struct {
		reason    string
		documents []string
	}{
		{"death", []string{models.SectionWill, models.SectionTrust}},
		{"incapacitated", []string{models.SectionPowerOfAttorney, models.SectionHealthCareDirective}},
	} {
		for _, documentType := range tc.documents {
			if !validReleaseRequest(documentType, tc.reason) {
				t.Errorf("%s must be provable by %q", documentType, tc.reason)
			}
			if defaultReleaseReason(documentType) != tc.reason {
				t.Errorf("%s default reason = %q, want %q",
					documentType, defaultReleaseReason(documentType), tc.reason)
			}
		}
	}
	// The two packets must not overlap: death proof cannot release an
	// incapacity document, or a death certificate would open a POA.
	for _, documentType := range []string{models.SectionPowerOfAttorney, models.SectionHealthCareDirective} {
		if validReleaseRequest(documentType, "death") {
			t.Errorf("%s must not be releasable on proof of death", documentType)
		}
	}
	for _, documentType := range []string{models.SectionWill, models.SectionTrust} {
		if validReleaseRequest(documentType, "incapacitated") {
			t.Errorf("%s must not be releasable on proof of incapacity", documentType)
		}
	}
}

func TestDedupeStrings(t *testing.T) {
	got := dedupeStrings([]string{" will ", "will", "", "  ", "trust", "will"})
	want := []string{"will", "trust"}
	if len(got) != len(want) {
		t.Fatalf("dedupeStrings = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("dedupeStrings = %v, want %v (order must hold)", got, want)
		}
	}
	if len(dedupeStrings(nil)) != 0 {
		t.Fatal("dedupeStrings(nil) must be empty, so the handler rejects it")
	}
}

// Every section that can be GRANTED after death must also be RELEASABLE on
// proof of death. They diverged once: eight sections were grantable in the
// member picker but only four could ever be released, so an after-death grant
// on the lists, funeral wishes or contacts was permanently unreachable — the
// owner is the only other releaser, and they cannot act once dead.
func TestEveryAfterDeathGrantIsReleasable(t *testing.T) {
	grantable := []string{
		models.SectionWill, models.SectionTrust,
		models.SectionPersonalProperty, models.SectionNonProbate,
		models.SectionFuneral, models.SectionContacts,
	}
	releasable := map[string]bool{}
	for _, s := range deathOperativeSections() {
		releasable[s] = true
	}
	for _, section := range grantable {
		if !stewardSuccessorSection(section) {
			t.Errorf("%s should use the steward/successor model", section)
		}
		if !releasable[section] {
			t.Errorf("%s can be granted after death but never released", section)
		}
		if !validReleaseRequest(section, "death") {
			t.Errorf("%s must accept proof of death", section)
		}
	}
	if len(deathOperativeSections()) != len(grantable) {
		t.Errorf("death-operative set = %v, want exactly %v",
			deathOperativeSections(), grantable)
	}
	// The incapacity pair must stay out of it: a death certificate must never
	// open a power of attorney.
	for _, section := range []string{models.SectionPowerOfAttorney, models.SectionHealthCareDirective} {
		if releasable[section] {
			t.Errorf("%s must not be released by proof of death", section)
		}
	}
}

// An approved death release opens every after-death section; an approved
// incapacity release opens only the documents its packet covered.
func TestIncapacityReleaseStaysNarrow(t *testing.T) {
	death := deathOperativeSections()
	if len(death) < 6 {
		t.Fatalf("expected death to open all six after-death sections, got %v", death)
	}
	for _, section := range death {
		if validReleaseRequest(section, "incapacitated") {
			t.Errorf("%s must not be releasable on incapacity", section)
		}
	}
	// And a successor gate really is per-section, so releasing the will alone
	// leaves the contacts list sealed.
	v := CtxVault{
		Role:             models.RoleSuccessor,
		ReleasedDocument: map[string]bool{models.SectionWill: true},
		Permissions: []models.MemberPermission{
			{DocumentType: models.SectionWill, PermissionRole: models.RoleSuccessor, AccessTiming: models.AccessAfterDeath},
			{DocumentType: models.SectionContacts, PermissionRole: models.RoleSuccessor, AccessTiming: models.AccessAfterDeath},
		},
	}
	if !v.CanReadDocument(models.SectionWill) {
		t.Fatal("the released will must be readable")
	}
	if v.CanReadDocument(models.SectionContacts) {
		t.Fatal("contacts must stay sealed until released — this is the bug that hid four sections")
	}
}

// End-to-end over the real chain: what an approved death release writes, fed
// into the predicate GetVault filters every section with. Every one of the six
// after-death sections must come back readable — personal property included,
// which is the one that was reported still sealed.
func TestApprovedDeathReleaseOpensEverySection(t *testing.T) {
	// 1. What sectionsToRelease produces for a death approval.
	released := map[string]bool{}
	for _, section := range deathOperativeSections() {
		released[section] = true
	}

	// 2. A member the owner granted every after-death section.
	permissions := []models.MemberPermission{}
	for _, section := range deathOperativeSections() {
		permissions = append(permissions, models.MemberPermission{
			DocumentType:   section,
			PermissionRole: models.RoleSuccessor,
			AccessTiming:   models.AccessAfterDeath,
		})
	}
	v := CtxVault{
		Role:             models.RoleSuccessor,
		ReleasedDocument: released,
		Permissions:      permissions,
	}

	// 3. The predicate filterDocumentsForAccess uses for documents, entries,
	//    attachments and the funeral record.
	for _, section := range []string{
		models.SectionWill, models.SectionTrust,
		models.SectionPersonalProperty, models.SectionNonProbate,
		models.SectionFuneral, models.SectionContacts,
	} {
		if !v.CanReadDocument(section) {
			t.Errorf("%s must be readable after an approved death release", section)
		}
	}
	if !v.CanRead() {
		t.Error("the vault must not still present as sealed")
	}
	// The incapacity pair is untouched by a death release.
	for _, section := range []string{models.SectionPowerOfAttorney, models.SectionHealthCareDirective} {
		if v.CanReadDocument(section) {
			t.Errorf("%s must stay sealed after a death release", section)
		}
	}
}

// Before the fix, only will and trust were written. This pins the exact
// failure the user saw, so a regression reproduces it rather than passing.
func TestLegacyWillOnlyReleaseLeavesListsSealed(t *testing.T) {
	v := CtxVault{
		Role: models.RoleSuccessor,
		// What a pre-fix approval wrote.
		ReleasedDocument: map[string]bool{
			models.SectionWill: true, models.SectionTrust: true,
		},
		Permissions: []models.MemberPermission{
			{DocumentType: models.SectionWill, PermissionRole: models.RoleSuccessor, AccessTiming: models.AccessAfterDeath},
			{DocumentType: models.SectionPersonalProperty, PermissionRole: models.RoleSuccessor, AccessTiming: models.AccessAfterDeath},
		},
	}
	if !v.CanReadDocument(models.SectionWill) {
		t.Fatal("the will was released, so it must read")
	}
	if v.CanReadDocument(models.SectionPersonalProperty) {
		t.Fatal("personal property was never released by a pre-fix approval — " +
			"migration 020 backfills these rows")
	}
}
