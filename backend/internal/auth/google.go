package auth

import (
	"context"
	"errors"
	"fmt"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/idtoken"
)

// GoogleProfile is the slice of an ID-token's claims we actually use.
type GoogleProfile struct {
	Sub           string // stable, unique-per-user Google subject id
	Email         string
	EmailVerified bool
	Name          string
	Picture       string
}

// GoogleService exchanges authorization codes for tokens and verifies the
// resulting ID token. It is tied to one OAuth client (the Web Application
// client created in Google Cloud Console).
type GoogleService struct {
	cfg *oauth2.Config
}

func NewGoogleService(clientID, clientSecret string) *GoogleService {
	return &GoogleService{
		cfg: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			// 'postmessage' is the magic redirect URI that pairs with
			// @react-oauth/google's popup flow — Google posts the code
			// back through window.postMessage rather than a redirect.
			RedirectURL: "postmessage",
			Scopes:      []string{"openid", "email", "profile"},
			Endpoint:    google.Endpoint,
		},
	}
}

// ExchangeCode swaps an authorization code for tokens and returns the
// verified Google profile from the ID token. The ID token is checked
// against Google's public keys before its claims are trusted.
func (g *GoogleService) ExchangeCode(ctx context.Context, code string) (*GoogleProfile, error) {
	tok, err := g.cfg.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}
	rawID, ok := tok.Extra("id_token").(string)
	if !ok || rawID == "" {
		return nil, errors.New("google response missing id_token")
	}
	payload, err := idtoken.Validate(ctx, rawID, g.cfg.ClientID)
	if err != nil {
		return nil, fmt.Errorf("validate id token: %w", err)
	}

	get := func(key string) string {
		if v, ok := payload.Claims[key].(string); ok {
			return v
		}
		return ""
	}

	verified := false
	switch v := payload.Claims["email_verified"].(type) {
	case bool:
		verified = v
	case string:
		verified = v == "true"
	}

	return &GoogleProfile{
		Sub:           payload.Subject,
		Email:         get("email"),
		EmailVerified: verified,
		Name:          get("name"),
		Picture:       get("picture"),
	}, nil
}
