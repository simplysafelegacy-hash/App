package models

import "time"

// Role on a particular vault.
const (
	RoleOwner     = "owner"
	RoleSteward   = "steward"   // active read+download access
	RoleSuccessor = "successor" // sealed; gains read+download once vault is released
)

type User struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	Phone     *string `json:"phone,omitempty"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

// VaultMember is anyone with a relationship to a vault — owner, steward, or
// successor. UserID is empty when a member exists only as a pending invite
// (an email has been added but no account claims it yet).
type VaultMember struct {
	ID          string   `json:"id"`
	UserID      string   `json:"userId"`
	Name        string   `json:"name"`
	Email       string   `json:"email"`
	Role        string   `json:"role"`
	DocumentIDs []string `json:"documentIds"`
}

type Document struct {
	ID           string    `json:"id"`
	Type         string    `json:"type"`
	Name         string    `json:"name"`
	FileKey      *string   `json:"-"`                  // server-internal: S3 object key
	FileName     *string   `json:"fileName,omitempty"`
	HasFile      bool      `json:"hasFile"`            // true if a digital copy is on file
	LocationType string    `json:"locationType"`
	Address      string    `json:"address"`
	Description  string    `json:"description"`
	MemberIDs    []string  `json:"memberIds"`          // non-owner members with explicit access
	LastUpdated  time.Time `json:"lastUpdated"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Vault struct {
	ID                      string        `json:"id"`
	Name                    string        `json:"name"`
	OwnerID                 string        `json:"ownerId"`
	OwnerName               string        `json:"ownerName"`
	OwnerEmail              string        `json:"ownerEmail"`
	OwnerPhone              string        `json:"ownerPhone"`
	EmergencyContactName    string        `json:"emergencyContactName"`
	EmergencyContactPhone   string        `json:"emergencyContactPhone"`
	ReleasedAt              *time.Time    `json:"releasedAt,omitempty"`
	Documents               []Document    `json:"documents"`
	Members                 []VaultMember `json:"members"`
	CreatedAt               time.Time     `json:"createdAt"`
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
