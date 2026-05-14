package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stripe/stripe-go/v82"
	billingportal "github.com/stripe/stripe-go/v82/billingportal/session"
	checkoutsession "github.com/stripe/stripe-go/v82/checkout/session"
	"github.com/stripe/stripe-go/v82/customer"
	"github.com/stripe/stripe-go/v82/webhook"

	"github.com/simplysafelegacy/backend/internal/models"
)

// CreateCheckout starts a Stripe Checkout session for the requested plan
// and returns the redirect URL. The frontend does
// `window.location = data.url` from the response.
//
// We resolve / create the Stripe Customer up-front so the customer id is
// stable from the first checkout — that way the webhook can match
// customer-scoped events back to our user even before the subscription
// row is finalized.
func (d *Deps) CreateCheckout(w http.ResponseWriter, r *http.Request) {
	if d.Stripe.SecretKey == "" {
		writeError(w, http.StatusServiceUnavailable, "billing is not configured")
		return
	}
	stripe.Key = d.Stripe.SecretKey

	u, ok := currentUser(w, r)
	if !ok {
		return
	}

	var req struct {
		Plan string `json:"plan"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	priceID, err := d.priceForPlan(req.Plan)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	customerID, err := d.ensureStripeCustomer(r, u.ID, u.Email)
	if err != nil {
		d.internalError(w, r, err, "failed to provision Stripe customer")
		return
	}

	successURL := d.Stripe.PublicAppURL + "/dashboard?subscription=success&session_id={CHECKOUT_SESSION_ID}"
	cancelURL := d.Stripe.PublicAppURL + "/plans?subscription=canceled"

	params := &stripe.CheckoutSessionParams{
		Mode:       stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		Customer:   stripe.String(customerID),
		SuccessURL: stripe.String(successURL),
		CancelURL:  stripe.String(cancelURL),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{Price: stripe.String(priceID), Quantity: stripe.Int64(1)},
		},
		AllowPromotionCodes: stripe.Bool(true),
		ClientReferenceID:   stripe.String(u.ID),
		Metadata: map[string]string{
			"user_id": u.ID,
			"plan":    req.Plan,
		},
	}
	if d.Stripe.TrialDays > 0 {
		params.SubscriptionData = &stripe.CheckoutSessionSubscriptionDataParams{
			TrialPeriodDays: stripe.Int64(int64(d.Stripe.TrialDays)),
			Metadata: map[string]string{
				"user_id": u.ID,
				"plan":    req.Plan,
			},
		}
	}

	sess, err := checkoutsession.New(params)
	if err != nil {
		d.internalError(w, r, err, "failed to create checkout session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": sess.URL})
}

// CustomerPortal opens a Stripe-hosted customer portal session so the
// user can manage their subscription, payment method, and invoices
// without us building any of that UI.
func (d *Deps) CustomerPortal(w http.ResponseWriter, r *http.Request) {
	if d.Stripe.SecretKey == "" {
		writeError(w, http.StatusServiceUnavailable, "billing is not configured")
		return
	}
	stripe.Key = d.Stripe.SecretKey

	u, ok := currentUser(w, r)
	if !ok {
		return
	}

	var customerID *string
	if err := d.DB.QueryRow(r.Context(),
		`SELECT stripe_customer_id FROM users WHERE id = $1`, u.ID).Scan(&customerID); err != nil {
		d.internalError(w, r, err, "failed to look up customer")
		return
	}
	if customerID == nil || *customerID == "" {
		writeError(w, http.StatusBadRequest, "no Stripe customer on file — subscribe to a plan first")
		return
	}

	sess, err := billingportal.New(&stripe.BillingPortalSessionParams{
		Customer:  stripe.String(*customerID),
		ReturnURL: stripe.String(d.Stripe.PublicAppURL + "/dashboard"),
	})
	if err != nil {
		d.internalError(w, r, err, "failed to open customer portal")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": sess.URL})
}

// Webhook accepts events from Stripe. The signature is verified against
// STRIPE_WEBHOOK_SECRET; events are deduped by event.id in
// stripe_processed_events so retries are safe.
//
// Handled:
//   - checkout.session.completed       — bind subscription to user
//   - customer.subscription.created    — refresh state
//   - customer.subscription.updated    — refresh state
//   - customer.subscription.deleted    — mark canceled
//   - invoice.payment_failed           — mark past_due
func (d *Deps) Webhook(w http.ResponseWriter, r *http.Request) {
	if d.Stripe.WebhookSecret == "" {
		writeError(w, http.StatusServiceUnavailable, "webhook secret not configured")
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not read body")
		return
	}
	// IgnoreAPIVersionMismatch: stripe-go pins to one API version per
	// release (basil at the time of writing) and rejects events whose
	// API version differs. Our Stripe account is on a newer default
	// (dahlia), so without this flag every event fails before we even
	// look at the type. We only read a stable subset of fields — type,
	// id, and a handful of well-known fields on Subscription / Session /
	// Invoice — so the skew is acceptable. Revisit if upgrading stripe-go.
	event, err := webhook.ConstructEventWithOptions(
		body,
		r.Header.Get("Stripe-Signature"),
		d.Stripe.WebhookSecret,
		webhook.ConstructEventOptions{IgnoreAPIVersionMismatch: true},
	)
	if err != nil {
		d.Logger.Warn("stripe webhook rejected", "err", err)
		writeError(w, http.StatusBadRequest, "could not verify webhook")
		return
	}

	// Idempotency: skip if we've already processed this event id.
	var existing string
	err = d.DB.QueryRow(r.Context(),
		`SELECT event_id FROM stripe_processed_events WHERE event_id = $1`, event.ID,
	).Scan(&existing)
	if err == nil {
		w.WriteHeader(http.StatusOK)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		d.internalError(w, r, err, "failed to check event idempotency")
		return
	}

	if err := d.handleStripeEvent(r, &event); err != nil {
		d.internalError(w, r, err, "failed to process event")
		return
	}

	if _, err := d.DB.Exec(r.Context(),
		`INSERT INTO stripe_processed_events(event_id) VALUES ($1) ON CONFLICT DO NOTHING`,
		event.ID,
	); err != nil {
		d.Logger.Warn("failed to record processed event", "err", err, "event_id", event.ID)
	}
	w.WriteHeader(http.StatusOK)
}

func (d *Deps) handleStripeEvent(r *http.Request, e *stripe.Event) error {
	stripe.Key = d.Stripe.SecretKey
	ctx := r.Context()

	switch e.Type {
	case "checkout.session.completed":
		// e.Data.Object is a checkout.Session — but rather than
		// decoding it manually, fall through to a customer lookup
		// and let the next subscription event populate full state.
		// We just need to ensure the user row holds the subscription
		// id (so customer-portal works immediately).
		var sess stripe.CheckoutSession
		if err := unmarshalEvent(e, &sess); err != nil {
			return err
		}
		userID := sess.ClientReferenceID
		if userID == "" && sess.Metadata != nil {
			userID = sess.Metadata["user_id"]
		}
		if userID == "" {
			return fmt.Errorf("checkout session missing user_id")
		}
		var subID, custID string
		if sess.Subscription != nil {
			subID = sess.Subscription.ID
		}
		if sess.Customer != nil {
			custID = sess.Customer.ID
		}
		_, err := d.DB.Exec(ctx, `
			UPDATE users SET
				stripe_customer_id     = COALESCE(NULLIF($1,''), stripe_customer_id),
				stripe_subscription_id = COALESCE(NULLIF($2,''), stripe_subscription_id)
			WHERE id = $3
		`, custID, subID, userID)
		return err

	case "customer.subscription.created",
		"customer.subscription.updated",
		"customer.subscription.deleted":
		var sub stripe.Subscription
		if err := unmarshalEvent(e, &sub); err != nil {
			return err
		}
		return d.applySubscription(ctx, &sub)

	case "invoice.payment_failed":
		var inv stripe.Invoice
		if err := unmarshalEvent(e, &inv); err != nil {
			return err
		}
		if inv.Customer == nil {
			return nil
		}
		_, err := d.DB.Exec(ctx,
			`UPDATE users SET subscription_status = 'past_due' WHERE stripe_customer_id = $1`,
			inv.Customer.ID,
		)
		return err
	}
	// Unhandled event types are a no-op — Stripe sends many we don't care about.
	return nil
}

// applySubscription writes the latest state of a subscription onto the
// owning user row, identified by stripe_customer_id.
func (d *Deps) applySubscription(ctx context.Context, sub *stripe.Subscription) error {
	if sub.Customer == nil {
		return fmt.Errorf("subscription missing customer")
	}
	plan := d.planFromSubscription(sub)
	status := string(sub.Status)
	// Stripe v82 moved current_period_end onto the line item. Single-item
	// subscriptions are the norm here — take the first item's value.
	var periodEnd *time.Time
	if sub.Items != nil && len(sub.Items.Data) > 0 && sub.Items.Data[0] != nil {
		periodEnd = timeFromUnix(sub.Items.Data[0].CurrentPeriodEnd)
	}
	trialEnd := timeFromUnix(sub.TrialEnd)

	_, err := d.DB.Exec(ctx, `
		UPDATE users SET
			stripe_subscription_id = $1,
			subscription_status    = $2,
			subscription_plan      = $3,
			current_period_end     = $4,
			trial_end              = $5
		WHERE stripe_customer_id = $6
	`, sub.ID, status, plan, periodEnd, trialEnd, sub.Customer.ID)
	return err
}

// ensureStripeCustomer returns the user's existing stripe_customer_id,
// creating one with Stripe if the row doesn't have one yet. Idempotent.
func (d *Deps) ensureStripeCustomer(r *http.Request, userID, email string) (string, error) {
	var existing *string
	if err := d.DB.QueryRow(r.Context(),
		`SELECT stripe_customer_id FROM users WHERE id = $1`, userID,
	).Scan(&existing); err != nil {
		return "", err
	}
	if existing != nil && *existing != "" {
		return *existing, nil
	}

	cust, err := customer.New(&stripe.CustomerParams{
		Email: stripe.String(email),
		Metadata: map[string]string{
			"user_id": userID,
		},
	})
	if err != nil {
		return "", err
	}
	if _, err := d.DB.Exec(r.Context(),
		`UPDATE users SET stripe_customer_id = $1 WHERE id = $2`, cust.ID, userID,
	); err != nil {
		return "", err
	}
	return cust.ID, nil
}

func (d *Deps) priceForPlan(plan string) (string, error) {
	switch plan {
	case models.PlanIndividual:
		if d.Stripe.PriceIndividual == "" {
			return "", fmt.Errorf("individual plan is not configured")
		}
		return d.Stripe.PriceIndividual, nil
	case models.PlanFamily:
		if d.Stripe.PriceFamily == "" {
			return "", fmt.Errorf("family plan is not configured")
		}
		return d.Stripe.PriceFamily, nil
	case models.PlanSafekeeping:
		if d.Stripe.PriceSafekeeping == "" {
			return "", fmt.Errorf("safekeeping plan is not configured")
		}
		return d.Stripe.PriceSafekeeping, nil
	default:
		return "", fmt.Errorf("unknown plan %q", plan)
	}
}

// planFromSubscription pulls the plan code we set in metadata back off
// the subscription. Falls back to inspecting the price id against
// configured values so a portal-driven plan change (which doesn't carry
// our metadata) still resolves to a known plan code.
func (d *Deps) planFromSubscription(sub *stripe.Subscription) string {
	if sub.Metadata != nil {
		if p := sub.Metadata["plan"]; p != "" {
			return p
		}
	}
	if sub.Items != nil {
		for _, item := range sub.Items.Data {
			if item == nil || item.Price == nil {
				continue
			}
			switch item.Price.ID {
			case d.Stripe.PriceIndividual:
				return models.PlanIndividual
			case d.Stripe.PriceFamily:
				return models.PlanFamily
			case d.Stripe.PriceSafekeeping:
				return models.PlanSafekeeping
			}
		}
	}
	return ""
}

func timeFromUnix(ts int64) *time.Time {
	if ts == 0 {
		return nil
	}
	t := time.Unix(ts, 0)
	return &t
}

// unmarshalEvent extracts the typed object out of a Stripe event's raw
// payload. stripe-go exposes the JSON bytes on event.Data.Raw — we
// decode into the concrete struct the caller expects.
func unmarshalEvent(e *stripe.Event, into any) error {
	if len(e.Data.Raw) == 0 {
		return fmt.Errorf("empty event payload")
	}
	return json.Unmarshal(e.Data.Raw, into)
}
