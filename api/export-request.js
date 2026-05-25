import { createPaidExport } from "./_supabase.js";
import { getPrice } from "./_pricing.js";

function readBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  return {};
}

function sendError(res, error) {
  res.status(error.statusCode ?? 500).json({ error: error.message ?? "Request failed." });
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
    const paymentMethod = String(body.paymentMethod ?? "").trim();
    if (!["alipay_hk", "alipay_cn", "zelle"].includes(paymentMethod)) throw new Error("Valid payment method is required.");
    const row = await createPaidExport({
      email,
      kind: price.kind,
      expected_amount: price.amount,
      expected_currency: price.currency,
      payment_method: paymentMethod,
      payment_reference: String(body.paymentReference ?? "").trim(),
      selection: body.selection ?? {},
      status: "pending",
    });
    res.status(200).json({
      id: row.id,
      status: row.status,
      expectedAmount: row.expected_amount,
      expectedCurrency: row.expected_currency,
    });
  } catch (error) {
    sendError(res, error);
  }
}
