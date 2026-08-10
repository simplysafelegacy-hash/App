package handlers

import (
	"testing"

	"github.com/simplysafelegacy/backend/internal/models"
)

func TestHiddenWillPermissionCannotReadVaultBeforeRelease(t *testing.T) {
	vault := CtxVault{
		Role: models.RoleSuccessor,
		Permissions: []models.MemberPermission{
			{
				DocumentType:   "will",
				PermissionRole: models.RoleSuccessor,
				AccessTiming:   models.AccessAfterDeath,
				Hidden:         true,
			},
		},
		ReleasedDocument: map[string]bool{},
		RecordedDocument: map[string]bool{"will": true},
	}

	if vault.CanRead() {
		t.Fatal("expected hidden unreleased will permission to be unable to read the vault")
	}
	if vault.CanReadDocument("will") {
		t.Fatal("expected hidden unreleased will permission to be unable to read will details")
	}
	if !vault.CanSubmitReleaseRequest("will") {
		t.Fatal("expected hidden unreleased will permission to allow release request")
	}

	vault.ReleasedDocument = map[string]bool{"will": true}
	if vault.CanReadDocument("will") {
		t.Fatal("did not expect hidden will permission to read will details after release")
	}
}

func TestVisibleWillPermissionCanSubmitReleaseRequestBeforeRelease(t *testing.T) {
	vault := CtxVault{
		Role: models.RoleSuccessor,
		Permissions: []models.MemberPermission{
			{
				DocumentType:   "will",
				PermissionRole: models.RoleSuccessor,
				AccessTiming:   models.AccessAfterDeath,
				Hidden:         false,
			},
		},
		ReleasedDocument: map[string]bool{},
		RecordedDocument: map[string]bool{"will": true},
	}

	if vault.CanReadDocument("will") {
		t.Fatal("expected unreleased will successor to be unable to read will details")
	}
	if !vault.CanSubmitReleaseRequest("will") {
		t.Fatal("expected visible will successor permission to allow release request")
	}

	vault.ReleasedDocument = map[string]bool{"will": true}
	if !vault.CanReadDocument("will") {
		t.Fatal("expected visible will successor permission to read will details after release")
	}
}

// A document copy (vault_attachments) is gated by CanReadDocument(section):
// a sealed successor must not be able to read a will copy before release, and
// must gain access once the will is released.
func TestSuccessorAttachmentAccessFollowsRelease(t *testing.T) {
	vault := CtxVault{
		Role: models.RoleSuccessor,
		Permissions: []models.MemberPermission{
			{
				DocumentType:   models.SectionWill,
				PermissionRole: models.RoleSuccessor,
				AccessTiming:   models.AccessAfterDeath,
				Hidden:         false,
			},
		},
		ReleasedDocument: map[string]bool{},
		RecordedDocument: map[string]bool{"will": true},
	}

	if vault.CanReadDocument(models.SectionWill) {
		t.Fatal("expected unreleased successor to be unable to read a will copy")
	}

	vault.ReleasedDocument = map[string]bool{"will": true}
	if !vault.CanReadDocument(models.SectionWill) {
		t.Fatal("expected successor to read the will copy after release")
	}
	// Access to the will must not spill over to other sections.
	if vault.CanReadDocument(models.SectionPowerOfAttorney) {
		t.Fatal("did not expect will release to grant power-of-attorney access")
	}
}

// A steward permitted "now" reads their section's copy immediately; the same
// permission on a list section reads that section, not others.
func TestStewardNowReadsSectionImmediately(t *testing.T) {
	vault := CtxVault{
		Role: models.RoleSteward,
		Permissions: []models.MemberPermission{
			{
				DocumentType:   models.SectionWill,
				PermissionRole: models.RoleSteward,
				AccessTiming:   models.AccessNow,
			},
		},
		ReleasedDocument: map[string]bool{},
		RecordedDocument: map[string]bool{"will": true},
	}
	if !vault.CanReadDocument(models.SectionWill) {
		t.Fatal("expected will steward to read the will now")
	}
	if vault.CanReadDocument(models.SectionNonProbate) {
		t.Fatal("did not expect a will-only steward to read the non-probate section")
	}
}

// A member permitted to a list section as a successor cannot read that
// section's entries before release, and can after — the same model as the will.
func TestListSectionSuccessorAccessFollowsRelease(t *testing.T) {
	vault := CtxVault{
		Role: models.RoleSuccessor,
		Permissions: []models.MemberPermission{
			{
				DocumentType:   models.SectionNonProbate,
				PermissionRole: models.RoleSuccessor,
				AccessTiming:   models.AccessAfterDeath,
			},
		},
		ReleasedDocument: map[string]bool{},
		RecordedDocument: map[string]bool{},
	}
	if vault.CanReadDocument(models.SectionNonProbate) {
		t.Fatal("expected unreleased successor to be unable to read non-probate list")
	}
	vault.ReleasedDocument = map[string]bool{models.SectionNonProbate: true}
	if !vault.CanReadDocument(models.SectionNonProbate) {
		t.Fatal("expected successor to read non-probate list after release")
	}
	if vault.CanReadDocument(models.SectionPersonalProperty) {
		t.Fatal("releasing one list section must not grant another")
	}
}

// A steward permitted "now" on personal property reads it immediately.
func TestListSectionStewardReadsNow(t *testing.T) {
	vault := CtxVault{
		Role: models.RoleSteward,
		Permissions: []models.MemberPermission{
			{
				DocumentType:   models.SectionPersonalProperty,
				PermissionRole: models.RoleSteward,
				AccessTiming:   models.AccessNow,
			},
		},
		ReleasedDocument: map[string]bool{},
		RecordedDocument: map[string]bool{},
	}
	if !vault.CanReadDocument(models.SectionPersonalProperty) {
		t.Fatal("expected personal-property steward to read the list now")
	}
	if vault.CanReadDocument(models.SectionWill) {
		t.Fatal("a personal-property steward must not read the will")
	}
}

// Funeral and contacts sections gate like the will: a steward reads now, a
// successor reads only after release, and access does not spill across sections.
func TestFuneralAndContactsGating(t *testing.T) {
	// Contacts steward, available now.
	steward := CtxVault{
		Role: models.RoleSteward,
		Permissions: []models.MemberPermission{
			{DocumentType: models.SectionContacts, PermissionRole: models.RoleSteward, AccessTiming: models.AccessNow},
		},
		ReleasedDocument: map[string]bool{},
		RecordedDocument: map[string]bool{},
	}
	if !steward.CanReadDocument(models.SectionContacts) {
		t.Fatal("expected contacts steward to read contacts now")
	}
	if steward.CanReadDocument(models.SectionFuneral) {
		t.Fatal("contacts steward must not read funeral wishes")
	}

	// Funeral successor, sealed until release.
	successor := CtxVault{
		Role: models.RoleSuccessor,
		Permissions: []models.MemberPermission{
			{DocumentType: models.SectionFuneral, PermissionRole: models.RoleSuccessor, AccessTiming: models.AccessAfterDeath},
		},
		ReleasedDocument: map[string]bool{},
		RecordedDocument: map[string]bool{},
	}
	if successor.CanReadDocument(models.SectionFuneral) {
		t.Fatal("expected unreleased funeral successor to be sealed")
	}
	successor.ReleasedDocument = map[string]bool{models.SectionFuneral: true}
	if !successor.CanReadDocument(models.SectionFuneral) {
		t.Fatal("expected funeral successor to read after release")
	}
}

func TestValidateMemberPermissionsForListSections(t *testing.T) {
	// Valid: steward-now on personal property, successor-after-death on non-probate.
	valid := []models.MemberPermission{
		{DocumentType: models.SectionPersonalProperty, PermissionRole: models.RoleSteward, AccessTiming: models.AccessNow},
		{DocumentType: models.SectionNonProbate, PermissionRole: models.RoleSuccessor, AccessTiming: models.AccessAfterDeath},
	}
	if msg := validateMemberPermissions(valid); msg != "" {
		t.Fatalf("expected list-section steward/successor to be valid, got %q", msg)
	}

	// Invalid: a POA-agent role cannot target a list section.
	invalid := []models.MemberPermission{
		{DocumentType: models.SectionPersonalProperty, PermissionRole: models.RolePOAAgent, AccessTiming: models.AccessNow},
	}
	if msg := validateMemberPermissions(invalid); msg == "" {
		t.Fatal("expected a POA role on a list section to be rejected")
	}

	// Invalid: both steward and successor for the same section.
	both := []models.MemberPermission{
		{DocumentType: models.SectionPersonalProperty, PermissionRole: models.RoleSteward, AccessTiming: models.AccessNow},
		{DocumentType: models.SectionPersonalProperty, PermissionRole: models.RoleSuccessor, AccessTiming: models.AccessAfterDeath},
	}
	if msg := validateMemberPermissions(both); msg == "" {
		t.Fatal("expected steward+successor on the same section to be rejected")
	}
}

func TestAnyVaultMemberCanSubmitReleaseRequestForRecordedDocuments(t *testing.T) {
	vault := CtxVault{
		Role:             models.RoleSteward,
		ReleasedDocument: map[string]bool{},
		RecordedDocument: map[string]bool{
			"will":              true,
			"power_of_attorney": true,
		},
	}

	if !vault.CanSubmitReleaseRequest("will") {
		t.Fatal("expected vault member to submit proof for recorded will")
	}
	if !vault.CanSubmitReleaseRequest("power_of_attorney") {
		t.Fatal("expected vault member to submit proof for recorded power of attorney")
	}
	if vault.CanSubmitReleaseRequest("health_care_directive") {
		t.Fatal("did not expect release request for unrecorded health care directive")
	}

	vault.ReleasedDocument["will"] = true
	if vault.CanSubmitReleaseRequest("will") {
		t.Fatal("did not expect release request for already released will")
	}
}
