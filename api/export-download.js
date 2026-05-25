import { buildExport } from "./_exportCsv.js";
import { getPaidExport } from "./_supabase.js";

function sendError(res, error) {
  res.status(error.statusCode ?? 500).json({ error: error.message ?? "Request failed." });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const id = String(req.query.id ?? "").trim();
    const email = String(req.query.email ?? "").trim().toLowerCase();
    if (!id || !email) {
      res.status(400).json({ error: "Request id and email are required." });
      return;
    }
    const request = await getPaidExport(id, email);
    if (!request) {
      res.status(404).json({ error: "Payment request not found." });
      return;
    }
    if (request.status !== "approved") {
      res.status(202).json({ status: request.status, error: "Payment has not been approved yet." });
      return;
    }
    const output = buildExport(request.kind, request.selection ?? {});
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${output.filename}"`);
    res.status(200).send(output.csv);
  } catch (error) {
    sendError(res, error);
  }
}
