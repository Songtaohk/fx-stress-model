const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error("Payment database is not configured.");
    error.statusCode = 503;
    throw error;
  }
}

async function supabaseRequest(path, options = {}) {
  requireSupabase();
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message ?? response.statusText);
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

async function createPaidExport(row) {
  const data = await supabaseRequest("paid_exports", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return data?.[0];
}

async function getPaidExport(id, email) {
  const emailFilter = email ? `&email=eq.${encodeURIComponent(email)}` : "";
  const data = await supabaseRequest(`paid_exports?id=eq.${encodeURIComponent(id)}${emailFilter}&select=*`, {
    method: "GET",
  });
  return data?.[0] ?? null;
}

async function getPaidExportByStripeSession(stripeSessionId) {
  const data = await supabaseRequest(`paid_exports?stripe_session_id=eq.${encodeURIComponent(stripeSessionId)}&select=*`, {
    method: "GET",
  });
  return data?.[0] ?? null;
}

async function updatePaidExport(id, patch) {
  const data = await supabaseRequest(`paid_exports?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return data?.[0] ?? null;
}

async function approvePaidExport(id) {
  return updatePaidExport(id, { status: "approved", approved_at: new Date().toISOString() });
}

export { approvePaidExport, createPaidExport, getPaidExport, getPaidExportByStripeSession, updatePaidExport };
