package auth

import "testing"

// The http-issuer escape hatch must open only for a genuine loopback host.
// The previous last-colon split accepted "localhost:8080.evil.com" and
// rejected a bare "::1".
func TestIsLoopback(t *testing.T) {
	for _, tc := range []struct {
		host string
		want bool
	}{
		{"localhost", true},
		{"localhost:3000", true},
		{"127.0.0.1", true},
		{"127.0.0.1:8080", true},
		{"127.5.4.3", true},
		{"::1", true},
		{"[::1]:8080", true},
		{"localhost:8080.evil.com", false},
		{"notlocalhost", false},
		{"tenant.us.auth0.com", false},
		{"evil.com:localhost", false},
		{"10.0.0.1", false},
		{"", false},
	} {
		if got := isLoopback(tc.host); got != tc.want {
			t.Errorf("isLoopback(%q) = %v, want %v", tc.host, got, tc.want)
		}
	}
}
