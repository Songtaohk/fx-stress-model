# Payment Restore Notes

Current public UI shows only the manual QR confirmation flow for paid exports.

The previous automatic payment implementation is intentionally kept in code so it can be restored later:

- Frontend checkout handler: `src/App.tsx`, `startAutomaticCheckout`
- Stripe return handler: `src/App.tsx`, checkout-success `useEffect`
- Checkout API endpoint: `api/create-checkout-session.js`
- Manual request and approved download endpoints remain active:
  - `api/export-request.js`
  - `api/export-download.js`

To restore automatic payment in the UI, add the automatic checkout section back into `renderPaymentModal` and make sure Vercel environment variables for Stripe and Supabase are configured.
