package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all runtime configuration resolved from the environment.
type Config struct {
	Env            string
	Port           string
	DatabaseURL    string
	JWTSecret      string
	JWTExpiry      time.Duration
	AllowedOrigins []string

	// RunMigrations controls whether embedded migrations are applied at
	// boot. Default true. Set RUN_MIGRATIONS=false on an app VM that must
	// not touch the schema — e.g. a second replica, or when the database
	// lives on its own VM and you'd rather migrate deliberately from one
	// place.
	RunMigrations bool

	// Google OAuth — required alongside email/password auth.
	GoogleClientID     string
	GoogleClientSecret string

	// Stripe — required for billing. Test keys are fine in development.
	StripeSecretKey        string
	StripeWebhookSecret    string
	StripePublishableKey   string
	StripePriceIndividual  string
	StripePriceFamily      string
	StripePriceSafekeeping string
	StripeTrialDays        int

	// Amazon S3 — vault documents and release proof uploads.
	// Keys are {vault_id}/attachments/... and
	// {vault_id}/release-requests/{request_id}/...
	//
	// Credentials are NOT configured here: the AWS SDK's default chain
	// resolves them from the EC2 instance profile in production (short-lived
	// and auto-rotating), or from ~/.aws / AWS_ACCESS_KEY_ID locally.
	S3Bucket    string
	AWSRegion   string
	S3KMSKeyID  string
	S3Endpoint  string
	S3PathStyle bool

	// PublicAppURL is the externally-reachable origin for the SPA, used
	// by Stripe Checkout success/cancel URLs and any other absolute links
	// the backend builds. e.g. https://dev.simplysafelegacy.com
	PublicAppURL string

	// Support email — used by the in-app support ticket form.
	SupportEmailTo string
	SMTPHost       string
	SMTPPort       string
	SMTPUsername   string
	SMTPPassword   string
	SMTPFrom       string
}

func Load() (*Config, error) {
	c := &Config{
		Env:                getenv("APP_ENV", "development"),
		Port:               getenv("PORT", "8080"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		JWTSecret:          os.Getenv("JWT_SECRET"),
		JWTExpiry:          parseDuration(getenv("JWT_EXPIRY", "168h")), // 7d
		AllowedOrigins:     splitCSV(getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:8000")),
		RunMigrations:      getenvBool("RUN_MIGRATIONS", true),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),

		StripeSecretKey:        os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret:    os.Getenv("STRIPE_WEBHOOK_SECRET"),
		StripePublishableKey:   os.Getenv("STRIPE_PUBLISHABLE_KEY"),
		StripePriceIndividual:  os.Getenv("STRIPE_PRICE_INDIVIDUAL"),
		StripePriceFamily:      os.Getenv("STRIPE_PRICE_FAMILY"),
		StripePriceSafekeeping: os.Getenv("STRIPE_PRICE_SAFEKEEPING"),
		StripeTrialDays:        getenvInt("STRIPE_TRIAL_DAYS", 14),
		S3Bucket:               os.Getenv("S3_BUCKET"),
		AWSRegion:              os.Getenv("AWS_REGION"),
		S3KMSKeyID:             os.Getenv("S3_KMS_KEY_ID"),
		S3Endpoint:             os.Getenv("S3_ENDPOINT"),
		S3PathStyle:            getenvBool("S3_PATH_STYLE", false),

		PublicAppURL: getenv("PUBLIC_APP_URL", "http://localhost:8000"),

		SupportEmailTo: getenv("SUPPORT_EMAIL_TO", "simplysafelegacy@gmail.com"),
		SMTPHost:       os.Getenv("SMTP_HOST"),
		SMTPPort:       getenv("SMTP_PORT", "587"),
		SMTPUsername:   os.Getenv("SMTP_USERNAME"),
		SMTPPassword:   os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:       os.Getenv("SMTP_FROM"),
	}

	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if c.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	if len(c.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}
	if c.GoogleClientID == "" || c.GoogleClientSecret == "" {
		return nil, fmt.Errorf("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required")
	}
	// Document storage is required in production — a vault that silently
	// cannot store documents is worse than one that refuses to start.
	// Development may run without it; upload endpoints then return a clear
	// configuration error instead of a 500.
	if c.Env != "development" {
		if c.S3Bucket == "" {
			return nil, fmt.Errorf("S3_BUCKET is required when APP_ENV=%s", c.Env)
		}
		if c.AWSRegion == "" {
			return nil, fmt.Errorf("AWS_REGION is required when APP_ENV=%s", c.Env)
		}
	}

	// Stripe is loaded but not strictly required at boot — endpoints
	// will return a clear error if a key is missing when invoked. This
	// lets the dev start the backend without billing wired up.
	return c, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getenvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

// getenvBool reads a boolean env var. Anything strconv.ParseBool accepts
// works ("1"/"0", "true"/"false", "t"/"f"); an unset or unparseable value
// falls back so a typo can't silently flip behaviour off.
func getenvBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return 168 * time.Hour
	}
	return d
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	out := []string{}
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			if i > start {
				out = append(out, s[start:i])
			}
			start = i + 1
		}
	}
	return out
}
