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
