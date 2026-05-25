import crypto from "node:crypto";
import { getPaidExportByStripeSession, updatePaidExport } from "./_supabase.js";

function sendError(res, error) {
  res.status(error.statusCode ?? 500).json({ error: error.message ?? "Request failed." });
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  if (!parts.t || !parts.v1) return false;
  const signedPayload = `${parts.t}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(parts.v1, "hex");
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(503).json({ error: "Stripe webhook secret is not configured." });
      return;
    }
    const rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];
    if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
      res.status(400).json({ error: "Invalid Stripe signature." });
      return;
    }
    const event = JSON.parse(rawBody);
    if (event.type === "checkout.session.completed") {
      const session = event.data?.object;
      if (session?.payment_status === "paid") {
        const paidExportId = session.metadata?.paid_export_id ?? session.client_reference_id;
        const existing = session.id ? await getPaidExportByStripeSession(session.id) : null;
        const id = existing?.id ?? paidExportId;
        if (id) {
          await updatePaidExport(id, {
            status: "approved",
            approved_at: new Date().toISOString(),
            stripe_session_id: session.id,
            payment_reference: session.payment_intent ?? session.id,
          });
        }
      }
    }
    res.status(200).json({ received: true });
  } catch (error) {
    sendError(res, error);
  }
}
