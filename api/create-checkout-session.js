import { createPaidExport, updatePaidExport } from "./_supabase.js";
import { getPrice } from "./_pricing.js";

function readBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  return {};
}

function sendError(res, error) {
  res.status(error.statusCode ?? 500).json({ error: error.message ?? "Request failed." });
}

function getOrigin(req) {
  const configuredOrigin = process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configuredOrigin) return configuredOrigin.startsWith("http") ? configuredOrigin : `https://${configuredOrigin}`;
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${protocol}://${host}`;
}

async function createStripeSession(params) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    const error = new Error("Stripe is not configured.");
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.error?.message ?? "Stripe Checkout failed.");
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const body = readBody(req);
    const price = getPrice(body.kind, body.currency);
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Valid email is required.");
    const row = await createPaidExport({
      email,
      kind: price.kind,
      expected_amount: price.amount,
      expected_currency: price.currency,
      payment_method: "stripe",
      payment_reference: "",
      selection: body.selection ?? {},
      status: "pending",
    });
    const origin = getOrigin(req);
    const checkoutParams = new URLSearchParams({
      mode: "payment",
      "automatic_payment_methods[enabled]": "true",
      customer_email: email,
      success_url: `${origin}/?export_request=${row.id}&export_email=${encodeURIComponent(email)}&export_kind=${price.kind}&checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
      client_reference_id: row.id,
      "metadata[paid_export_id]": row.id,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": price.stripeCurrency,
      "line_items[0][price_data][unit_amount]": String(price.stripeAmount),
      "line_items[0][price_data][product_data][name]": price.kind === "full" ? "FX Stress Model full data export" : "FX Stress Model current table export",
    });
    const session = await createStripeSession(checkoutParams);
    await updatePaidExport(row.id, { stripe_session_id: session.id, payment_reference: session.id });
    res.status(200).json({ id: row.id, url: session.url, stripeSessionId: session.id });
  } catch (error) {
    sendError(res, error);
  }
}
