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

	// PublicAppURL is the externally-reachable origin for the SPA, used
	// by Stripe Checkout success/cancel URLs and any other absolute links
	// the backend builds. e.g. https://dev.simplysafelegacy.com
	PublicAppURL string
}

func Load() (*Config, error) {
	c := &Config{
		Env:                getenv("APP_ENV", "development"),
		Port:               getenv("PORT", "8080"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		JWTSecret:          os.Getenv("JWT_SECRET"),
		JWTExpiry:          parseDuration(getenv("JWT_EXPIRY", "168h")), // 7d
		AllowedOrigins:     splitCSV(getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:8000")),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),

		StripeSecretKey:        os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret:    os.Getenv("STRIPE_WEBHOOK_SECRET"),
		StripePublishableKey:   os.Getenv("STRIPE_PUBLISHABLE_KEY"),
		StripePriceIndividual:  os.Getenv("STRIPE_PRICE_INDIVIDUAL"),
		StripePriceFamily:      os.Getenv("STRIPE_PRICE_FAMILY"),
		StripePriceSafekeeping: os.Getenv("STRIPE_PRICE_SAFEKEEPING"),
		StripeTrialDays:        getenvInt("STRIPE_TRIAL_DAYS", 14),

		PublicAppURL: getenv("PUBLIC_APP_URL", "http://localhost:8000"),
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
