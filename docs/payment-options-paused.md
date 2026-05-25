# Payment Options - Paused Notes

Payment work is paused for now. Keep these options as the restart checklist.

## Option A: Stripe Checkout + Supabase entitlement

Use when the site needs automatic payment confirmation and dynamic CSV downloads.

- Frontend calls `/api/create-checkout-session`.
- Stripe Checkout collects payment.
- Stripe calls `/api/stripe-webhook` on `checkout.session.completed`.
- The webhook marks the Supabase `paid_exports` row as `approved`.
- `/api/export-download` returns CSV only when the row is approved.

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EXPORT_ADMIN_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SITE_URL`

Operational notes:

- Execute `docs/supabase-paid-exports.sql` in Supabase before enabling.
- In Stripe Dashboard, add webhook endpoint `https://<domain>/api/stripe-webhook`.
- Select event `checkout.session.completed`.
- For local testing, use `vercel dev` plus Stripe CLI webhook forwarding.

## Option B: Manual QR fallback

Use when AlipayHK, Alipay China, or Citi Zelle are used without automatic webhook support.

- Buyer scans QR code and pays.
- Buyer submits email, payment method, and payment reference.
- Admin checks receipt manually.
- Admin approves the request through `/api/admin-approve`.
- Buyer downloads with request id and email.

## Option C: Gumroad / Lemon Squeezy digital product

Use when the fastest launch is more important than dynamic current-table export.

- Upload the full data file as a digital product.
- Website buttons link to the product checkout page.
- Platform handles payment, receipt email, and download link.

Tradeoff: simpler operations, but downloads are fixed uploaded files rather than the current on-page selection.

## Option D: Apple App Store / Google Play

Use only if this becomes a mobile app or subscription product.

- Requires native or wrapped app release.
- Uses in-app purchases.
- Store review, policies, fees, and subscription rules apply.

This is not recommended for the current web-first version.
