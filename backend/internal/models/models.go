package models

import "time"

// Role on a particular vault.
const (
	RoleOwner           = "owner"
	RoleSteward         = "steward"           // active read access
	RoleSuccessor       = "successor"         // sees the will after release
	RolePOAAgent        = "poa_agent"         // sees POA now or after incapacity
	RoleHealthCareProxy = "health_care_proxy" // sees directive now or after incapacity
	AccessNow           = "now"
	AccessAfterDeath    = "after_death"
	AccessIncapacitated = "incapacitated"
)

// Subscription plan codes — must match the keys used by the billing handler
// when looking up Stripe price IDs from config.
const (
	PlanFree        = "free"
	PlanIndividual  = "individual"
	PlanFamily      = "family"
	PlanSafekeeping = "safekeeping"
)

// Vault sections. Each is a "document type" the permission engine can gate.
// The first three are singular documents inlined onto the vaults row; the
// list/record sections below are backed by vault_entries (or a dedicated
// record) and share the same access model.
const (
	SectionWill                = "will"
	SectionPowerOfAttorney     = "power_of_attorney"
	SectionHealthCareDirective = "health_care_directive"
	SectionPersonalProperty    = "personal_property"
	SectionNonProbate          = "non_probate"
	SectionFuneral             = "funeral"
	SectionContacts            = "contacts"
)

type PlanLimits struct {
	PlanCode                 string `json:"planCode"`
	Name                     string `json:"name"`
	PriceCents               int    `json:"priceCents"`
	Cadence                  string `json:"cadence"`
	DisplayOrder             int    `json:"displayOrder"`
	MaxAuthorizedPeople      int    `json:"maxAuthorizedPeople"`
	AllowWill                bool   `json:"allowWill"`
	AllowPowerOfAttorney     bool   `json:"allowPowerOfAttorney"`
	AllowHealthCareDirective bool   `json:"allowHealthCareDirective"`
	AllowPersonalProperty    bool   `json:"allowPersonalProperty"`
	AllowNonProbate          bool   `json:"allowNonProbate"`
	AllowFuneral             bool   `json:"allowFuneral"`
	AllowContacts            bool   `json:"allowContacts"`
	Active                   bool   `json:"active"`
}

type User struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	Phone     *string `json:"phone,omitempty"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
	IsAdmin   bool    `json:"isAdmin"`

	// Subscription state. Hydrated on /auth/me so the UI can show the
	// current plan and gate paid features later. All nullable until the
	// user picks a plan and Stripe confirms.
	SubscriptionStatus *string     `json:"subscriptionStatus,omitempty"`
	SubscriptionPlan   *string     `json:"subscriptionPlan,omitempty"`
	CurrentPeriodEnd   *time.Time  `json:"currentPeriodEnd,omitempty"`
	TrialEnd           *time.Time  `json:"trialEnd,omitempty"`
	PlanLimits         *PlanLimits `json:"planLimits,omitempty"`
}

// VaultMember is anyone with a relationship to a vault — owner, steward, or
// successor. UserID is empty when a member exists only as a pending invite
// (an email has been added but no account claims it yet).
type VaultMember struct {
	ID           string             `json:"id"`
	UserID       string             `json:"userId"`
	Name         string             `json:"name"`
	Email        string             `json:"email"`
	Role         string             `json:"role"`
	DateOfBirth  string             `json:"dateOfBirth,omitempty"`
	AccessTiming string             `json:"accessTiming,omitempty"`
	Permissions  []MemberPermission `json:"permissions,omitempty"`
}

type MemberPermission struct {
	ID             string `json:"id,omitempty"`
	DocumentType   string `json:"documentType"`
	PermissionRole string `json:"permissionRole"`
	AccessTiming   string `json:"accessTiming"`
	Hidden         bool   `json:"hidden"`
}

// VaultEntry is one item in a list-style section (personal property or a
// non-probate asset). The section-specific fields live in Details as free-form
// JSON so new list sections need no schema change. Beneficiaries are the
// people who should receive the item; they are visible only to callers who may
// read the entry's section.
type VaultEntry struct {
	ID            string                 `json:"id"`
	Section       string                 `json:"section"`
	Title         string                 `json:"title"`
	Details       map[string]any         `json:"details"`
	SortOrder     int                    `json:"sortOrder"`
	Beneficiaries []VaultEntryBeneficiary `json:"beneficiaries"`
	CreatedAt     time.Time              `json:"createdAt"`
	UpdatedAt     time.Time              `json:"updatedAt"`
}

type VaultEntryBeneficiary struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Relationship string  `json:"relationship"`
	Share        string  `json:"share"`
	Note         string  `json:"note"`
	MemberID     *string `json:"memberId,omitempty"`
	SortOrder    int     `json:"sortOrder"`
}

// FuneralWishes is the owner's funeral & burial instructions — one record per
// vault, gated as the 'funeral' section. HasFuneral mirrors Will.HasWill: it
// records whether the owner has entered anything.
type FuneralWishes struct {
	HasFuneral      bool       `json:"hasFuneral"`
	Disposition     string     `json:"disposition"`
	ServiceWishes   string     `json:"serviceWishes"`
	ServiceLocation string     `json:"serviceLocation"`
	Officiant       string     `json:"officiant"`
	ReadingsMusic   string     `json:"readingsMusic"`
	PrepaidProvider string     `json:"prepaidProvider"`
	Notes           string     `json:"notes"`
	UpdatedAt       *time.Time `json:"updatedAt,omitempty"`
}

// VaultAttachment is an uploaded file copy stored in GCS and attached to a
// vault section (and optionally a specific list entry). It is returned to a
// caller only when they may read that section; the file itself is streamed
// through a permission-checked download handler, never a public URL.
type VaultAttachment struct {
	ID          string    `json:"id"`
	Section     string    `json:"section"`
	EntryID     *string   `json:"entryId,omitempty"`
	FileName    string    `json:"fileName"`
	ContentType string    `json:"contentType"`
	FileSize    int64     `json:"fileSize"`
	CreatedAt   time.Time `json:"createdAt"`
}

type ReleaseRequestFile struct {
	ID          string `json:"id"`
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
	FileSize    int64  `json:"fileSize"`
	GCSObject   string `json:"gcsObject"`
}

type ReleaseRequest struct {
	ID            string               `json:"id"`
	VaultID       string               `json:"vaultId"`
	RequesterID   string               `json:"requesterId"`
	DocumentType  string               `json:"documentType"`
	ReleaseReason string               `json:"releaseReason"`
	Status        string               `json:"status"`
	Note          string               `json:"note"`
	Files         []ReleaseRequestFile `json:"files"`
	CreatedAt     time.Time            `json:"createdAt"`
}

// Will is kept for compatibility with older clients. New code should prefer
// Vault.Documents, which includes the will plus newer document types.
type Will struct {
	HasWill             bool       `json:"hasWill"`
	LocationType        string     `json:"locationType"`        // "home_safe" / "bank_safety_deposit" / "attorney_office" / "other"
	LocationAddress     string     `json:"locationAddress"`     // street, branch, firm name
	LocationDescription string     `json:"locationDescription"` // free-text precise location
	UpdatedAt           *time.Time `json:"updatedAt,omitempty"`
}

type VaultDocument struct {
	Type                string     `json:"type"`
	HasDocument         bool       `json:"hasDocument"`
	LocationType        string     `json:"locationType"`
	LocationAddress     string     `json:"locationAddress"`
	LocationDescription string     `json:"locationDescription"`
	UpdatedAt           *time.Time `json:"updatedAt,omitempty"`
}

type Vault struct {
	ID                    string          `json:"id"`
	Name                  string          `json:"name"`
	OwnerID               string          `json:"ownerId"`
	OwnerName             string          `json:"ownerName"`
	OwnerEmail            string          `json:"ownerEmail"`
	OwnerPhone            string          `json:"ownerPhone"`
	EmergencyContactName  string          `json:"emergencyContactName"`
	EmergencyContactPhone string          `json:"emergencyContactPhone"`
	ReleasedAt            *time.Time        `json:"releasedAt,omitempty"`
	Will                  Will              `json:"will"`
	Documents             []VaultDocument   `json:"documents"`
	Attachments           []VaultAttachment `json:"attachments"`
	Entries               []VaultEntry      `json:"entries"`
	Funeral               FuneralWishes     `json:"funeral"`
	Members               []VaultMember     `json:"members"`
	CreatedAt             time.Time         `json:"createdAt"`
}

// VaultSummary is the trimmed view returned by GET /api/me/vaults — enough to
// populate the vault switcher without leaking any vault contents.
type VaultSummary struct {
	ID           string             `json:"id"`
	Name         string             `json:"name"`
	OwnerName    string             `json:"ownerName"`
	OwnerEmail   string             `json:"ownerEmail"`
	Role         string             `json:"role"`
	AccessTiming string             `json:"accessTiming,omitempty"`
	Permissions  []MemberPermission `json:"permissions,omitempty"`
	ReleasedAt   *time.Time         `json:"releasedAt,omitempty"`
	ReleasedDocs []string           `json:"releasedDocuments,omitempty"`
	RecordedDocs []string           `json:"recordedDocuments,omitempty"`
	CreatedAt    time.Time          `json:"createdAt"`
}

type Notification struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
	Read      bool      `json:"read"`
	VaultID   *string   `json:"vaultId,omitempty"`
}
