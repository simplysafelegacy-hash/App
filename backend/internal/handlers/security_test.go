package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/simplysafelegacy/backend/internal/models"
	"github.com/stripe/stripe-go/v82"
)

func TestMissingPermissionsDenyEveryNonOwner(t *testing.T) {
	for _, role := range []string{models.RoleSteward, models.RoleSuccessor, models.RolePOAAgent, models.RoleHealthCareProxy, "unknown"} {
		for _, released := range []bool{false, true} {
			v := CtxVault{Role: role, Released: released, AccessTiming: models.AccessNow}
			if v.CanRead() || !v.ShouldMaskVaultIdentity() {
				t.Fatalf("missing permissions disclosed vault for %s released=%v", role, released)
			}
			for _, section := range append(deathOperativeSections(), models.SectionPowerOfAttorney, models.SectionHealthCareDirective) {
				if v.CanReadDocument(section) {
					t.Fatalf("missing permission disclosed %s to %s", section, role)
				}
			}
		}
	}
	if !(CtxVault{Role: models.RoleOwner}).CanReadDocument(models.SectionWill) {
		t.Fatal("owner access must remain available")
	}
}

func TestOwnerOnlyHandlersRejectNonOwnersBeforeReadingData(t *testing.T) {
	d := &Deps{} // Any database/storage use would panic.
	endpoints := map[string]http.HandlerFunc{
		"will": d.UpdateWill, "document": d.UpdateDocument, "release": d.ReleaseVault,
		"reseal": d.ResealDocumentRelease, "create attachment": d.CreateAttachment,
		"delete attachment": d.DeleteAttachment, "create entry": d.CreateEntry,
		"update entry": d.UpdateEntry, "delete entry": d.DeleteEntry,
		"funeral": d.UpdateFuneralWishes, "create member": d.CreateMember,
		"update member": d.UpdateMember, "delete member": d.DeleteMember,
	}
	for name, handler := range endpoints {
		t.Run(name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{}"))
			r = r.WithContext(context.WithValue(r.Context(), vaultCtxKey, CtxVault{
				VaultID: "another-vault", Role: models.RoleSteward, Released: true,
			}))
			w := httptest.NewRecorder()
			handler(w, r)
			if w.Code != http.StatusForbidden {
				t.Fatalf("status=%d, want 403", w.Code)
			}
		})
	}
}

func TestDecodeBodyRejectsAmbiguousAndOversizedRequests(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		valid      bool
	}{
		{"valid", `{"name":"ok"}`, true},
		{"whitespace", "  {\"name\":\"ok\"} \n", true},
		{"second object", `{"name":"ok"}{}`, false},
		{"trailing garbage", `{"name":"ok"}garbage`, false},
		{"null", "null", false},
		{"unknown field", `{"admin":true}`, false},
		{"empty", "", false},
		{"oversized suffix", `{"name":"ok"}` + strings.Repeat(" ", maxJSONBodyBytes), false},
		{"oversized value", `{"name":"` + strings.Repeat("x", maxJSONBodyBytes) + `"}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var dst struct {
				Name string `json:"name"`
			}
			err := decodeBody(httptest.NewRequest("POST", "/", strings.NewReader(tc.body)), &dst)
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v err=%v", tc.valid, err)
			}
		})
	}
}

func TestBillingPlanUsesCurrentPriceAfterPortalDowngrade(t *testing.T) {
	d := &Deps{Stripe: StripeConfig{PriceIndividual: "price_individual", PriceFamily: "price_family"}}
	sub := &stripe.Subscription{
		Metadata: map[string]string{"plan": models.PlanFamily},
		Items: &stripe.SubscriptionItemList{Data: []*stripe.SubscriptionItem{
			{Price: &stripe.Price{ID: "price_individual"}},
		}},
	}
	if got := d.planFromSubscription(sub); got != models.PlanIndividual {
		t.Fatalf("stale metadata granted %q after downgrade", got)
	}
	sub.Items.Data[0].Price.ID = "unrecognized"
	if got := d.planFromSubscription(sub); got != "" {
		t.Fatalf("unknown price must fail closed, got %q", got)
	}
	sub.Items.Data[0].Price.ID = ""
	if got := (&Deps{}).planFromSubscription(sub); got != "" {
		t.Fatalf("empty configured prices must not match, got %q", got)
	}
}

func TestDownloadsCannotServeActiveContentOrCacheSecrets(t *testing.T) {
	for _, contentType := range []string{"text/html", "image/svg+xml", "application/javascript"} {
		w := httptest.NewRecorder()
		writeDownloadHeaders(w, "bad\r\nInjected: yes.html", contentType)
		if w.Header().Get("Content-Type") != "application/octet-stream" {
			t.Fatalf("active type allowed: %s", contentType)
		}
		if !strings.Contains(w.Header().Get("Content-Disposition"), "attachment;") ||
			strings.ContainsAny(w.Header().Get("Content-Disposition"), "\r\n") {
			t.Fatal("unsafe download disposition")
		}
		if w.Header().Get("Cache-Control") != "private, no-store" ||
			w.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal("download protections missing")
		}
	}
}

func TestIndividualResealCannotPretendToOverrideGlobalRelease(t *testing.T) {
	r := httptest.NewRequest(http.MethodDelete, "/", nil)
	r = r.WithContext(context.WithValue(r.Context(), vaultCtxKey, CtxVault{
		Role: models.RoleOwner, Released: true,
	}))
	w := httptest.NewRecorder()
	(&Deps{}).ResealDocumentRelease(w, r)
	if w.Code != http.StatusConflict {
		t.Fatalf("reseal status=%d, want 409 while global release remains", w.Code)
	}
}

func TestClientIPDoesNotTrustUnselectedForwardingHeaders(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "192.0.2.10:1234"
	r.Header.Set("True-Client-IP", "198.51.100.1")
	r.Header.Set("X-Forwarded-For", "198.51.100.2")
	r.Header.Set("X-Real-IP", "198.51.100.3")
	if got := clientIP(r); got != "192.0.2.10" {
		t.Fatalf("untrusted forwarding header became consent IP: %s", got)
	}
}
