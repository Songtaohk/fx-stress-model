import { approvePaidExport } from "./_supabase.js";

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
    const adminToken = process.env.EXPORT_ADMIN_TOKEN;
    if (!adminToken) {
      res.status(503).json({ error: "Admin approval token is not configured." });
      return;
    }
    if (req.headers["x-admin-token"] !== adminToken) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const body = readBody(req);
    const id = String(body.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "Request id is required." });
      return;
    }
    const row = await approvePaidExport(id);
    if (!row) {
      res.status(404).json({ error: "Payment request not found." });
      return;
    }
    res.status(200).json({ id: row.id, status: row.status, approvedAt: row.approved_at });
  } catch (error) {
    sendError(res, error);
  }
}
