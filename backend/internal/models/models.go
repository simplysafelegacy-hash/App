package models

import "time"

// Role on a particular vault.
const (
	RoleOwner     = "owner"
	RoleSteward   = "steward"   // active read access
	RoleSuccessor = "successor" // sealed; gains read once vault is released
)

// Subscription plan codes — must match the keys used by the billing handler
// when looking up Stripe price IDs from config.
const (
	PlanIndividual  = "individual"
	PlanFamily      = "family"
	PlanSafekeeping = "safekeeping"
)

type User struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	Phone     *string `json:"phone,omitempty"`
	AvatarURL *string `json:"avatarUrl,omitempty"`

	// Subscription state. Hydrated on /auth/me so the UI can show the
	// current plan and gate paid features later. All nullable until the
	// user picks a plan and Stripe confirms.
	SubscriptionStatus *string    `json:"subscriptionStatus,omitempty"`
	SubscriptionPlan   *string    `json:"subscriptionPlan,omitempty"`
	CurrentPeriodEnd   *time.Time `json:"currentPeriodEnd,omitempty"`
	TrialEnd           *time.Time `json:"trialEnd,omitempty"`
}

// VaultMember is anyone with a relationship to a vault — owner, steward, or
// successor. UserID is empty when a member exists only as a pending invite
// (an email has been added but no account claims it yet).
type VaultMember struct {
	ID     string `json:"id"`
	UserID string `json:"userId"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	Role   string `json:"role"`
}

// Will is the single record of "I have a will, and here's where it is."
// Inlined onto Vault — at this stage we deliberately don't model multiple
// documents.
type Will struct {
	HasWill             bool       `json:"hasWill"`
	LocationType        string     `json:"locationType"`        // "home_safe" / "bank_safety_deposit" / "attorney_office" / "other"
	LocationAddress     string     `json:"locationAddress"`     // street, branch, firm name
	LocationDescription string     `json:"locationDescription"` // free-text precise location
	UpdatedAt           *time.Time `json:"updatedAt,omitempty"`
}

type Vault struct {
	ID                    string        `json:"id"`
	Name                  string        `json:"name"`
	OwnerID               string        `json:"ownerId"`
	OwnerName             string        `json:"ownerName"`
	OwnerEmail            string        `json:"ownerEmail"`
	OwnerPhone            string        `json:"ownerPhone"`
	EmergencyContactName  string        `json:"emergencyContactName"`
	EmergencyContactPhone string        `json:"emergencyContactPhone"`
	ReleasedAt            *time.Time    `json:"releasedAt,omitempty"`
	Will                  Will          `json:"will"`
	Members               []VaultMember `json:"members"`
	CreatedAt             time.Time     `json:"createdAt"`
}

// VaultSummary is the trimmed view returned by GET /api/me/vaults — enough to
// populate the vault switcher without leaking any vault contents.
type VaultSummary struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	OwnerName  string     `json:"ownerName"`
	OwnerEmail string     `json:"ownerEmail"`
	Role       string     `json:"role"`
	ReleasedAt *time.Time `json:"releasedAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
}

type Notification struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
	Read      bool      `json:"read"`
	VaultID   *string   `json:"vaultId,omitempty"`
}
