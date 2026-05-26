export const INGESTION_POLICY_VERSION = "2026-05-26.2";
export const START_YEAR = 1965;
export const FINAL_HIGH_FREQUENCY_MONTHS = 12;

export const ECONOMY_ORDER = ["eu", "gb", "us", "cn", "jp", "tw", "kr", "in"];
export const CURRENT_YEAR_ROLLING_METRICS = ["cpiInflation", "nominal10yYield", "realPolicyRate", "realPolicyRateZ"];
export const HIGH_FREQUENCY_METRICS = ["cpiInflation", "nominal10yYield", "realPolicyRate", "realPolicyRateZ"];
export const LOG_SPREAD_METRICS = new Set(["tfpCtfp", "ulcProxy"]);
export const DERIVED_METRICS = new Set(["realPolicyRate", "realPolicyRateZ"]);

export const DEFAULT_AUTO_UPDATE_START_OVERRIDES = {
  fdiGdp: { in: "2025" },
  portfolioGdp: { in: "2025" },
};

export const isoDate = (date = new Date()) => date.toISOString().slice(0, 10);

export const yearRange = (start = START_YEAR, end = new Date().getFullYear()) => Array.from(
  { length: end - start + 1 },
  (_, index) => String(start + index),
);

export const isFiniteNumber = (value) => Number.isFinite(value);

export const round4 = (value) => Number(value.toFixed(4));

export function lastValueYear(years, values, maxYear = null) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (maxYear && Number(years[index]) > Number(maxYear)) continue;
    if (values[index] !== null && values[index] !== undefined) return years[index] ?? null;
  }
  return null;
}

export function archivedCutoffYear({ metric, years, values, currentYear = new Date().getFullYear() }) {
  const currentYearCap = CURRENT_YEAR_ROLLING_METRICS.includes(metric) ? String(currentYear - 1) : null;
  return lastValueYear(years, values, currentYearCap);
}

export function latestLoadedYear(years, values) {
  return lastValueYear(years, values, null);
}

export function overrideStartYear(metric, economy, overrides = DEFAULT_AUTO_UPDATE_START_OVERRIDES) {
  return overrides?.[metric]?.[economy] ?? null;
}

export function provisionalStartYear(metric, economy, provisionalLedger = null) {
  const items = provisionalLedger?.items ?? [];
  const years = items
    .filter((item) => item.metric === metric && item.economy === economy && item.status !== "finalized")
    .map((item) => Number(item.year))
    .filter(Number.isFinite);
  if (years.length === 0) return null;
  return String(Math.min(...years));
}

export function refreshStartYear({ metric, economy, years, values, currentYear = new Date().getFullYear(), overrides = DEFAULT_AUTO_UPDATE_START_OVERRIDES, provisionalLedger = null }) {
  const override = overrideStartYear(metric, economy, overrides);
  const provisionalStart = provisionalStartYear(metric, economy, provisionalLedger);
  const cutoff = archivedCutoffYear({ metric, years, values, currentYear });
  const candidates = [override, provisionalStart, cutoff ? String(Number(cutoff) + 1) : null]
    .filter((value) => value != null)
    .map((value) => Number(value))
    .filter(Number.isFinite);
  return candidates.length > 0 ? String(Math.min(...candidates)) : null;
}

export function cadenceForMetric(metric, fallback = "annual") {
  return HIGH_FREQUENCY_METRICS.includes(metric) ? "high-frequency" : fallback;
}

export function canUseObservationYear({ year, observations, currentYear = new Date().getFullYear(), cadence = "annual" }) {
  const numericYear = Number(year);
  const numericObservations = Number(observations);
  if (!Number.isFinite(numericYear) || !Number.isFinite(numericObservations)) return false;
  if (cadence === "annual") return numericObservations >= 1;
  if (numericYear === currentYear) return numericObservations > 0;
  return numericObservations >= FINAL_HIGH_FREQUENCY_MONTHS;
}

export function observationWriteStatus({ year, observations, currentYear = new Date().getFullYear(), cadence = "annual" }) {
  const numericYear = Number(year);
  const numericObservations = Number(observations);
  if (cadence === "annual") return "official-annual";
  if (numericYear === currentYear) return "rolling-current-year";
  if (numericObservations >= FINAL_HIGH_FREQUENCY_MONTHS) return "finalized-high-frequency-year";
  return "insufficient-completed-year";
}

export function writeDecision({ metric, economy, year, annualPoint, years, values, currentYear = new Date().getFullYear(), cadence = cadenceForMetric(metric), overrides = DEFAULT_AUTO_UPDATE_START_OVERRIDES, provisionalLedger = null }) {
  if (!annualPoint || !isFiniteNumber(annualPoint.value)) {
    return { allow: false, reason: "missing-or-non-numeric-source-point" };
  }
  const start = refreshStartYear({ metric, economy, years, values, currentYear, overrides, provisionalLedger });
  if (!start) return { allow: false, reason: "no-archived-cutoff-or-refresh-source", autoRefreshFrom: null };
  if (Number(year) < Number(start)) {
    return { allow: false, reason: "locked-archived-year", autoRefreshFrom: start };
  }
  if (!canUseObservationYear({ year, observations: annualPoint.observations, currentYear, cadence })) {
    return { allow: false, reason: "insufficient-observations", autoRefreshFrom: start };
  }
  return {
    allow: true,
    reason: "accepted",
    autoRefreshFrom: start,
    status: observationWriteStatus({ year, observations: annualPoint.observations, currentYear, cadence }),
  };
}

export function buildIngestionMatrix({ years, stressData, currentYear = new Date().getFullYear(), sourceRegistry = {}, overrides = DEFAULT_AUTO_UPDATE_START_OVERRIDES, provisionalLedger = null }) {
  return Object.entries(stressData).flatMap(([metric, metricData]) => ECONOMY_ORDER.map((economy) => {
    const values = metricData[economy] ?? [];
    const source = sourceRegistry?.[metric]?.[economy] ?? null;
    const archivedThrough = archivedCutoffYear({ metric, years, values, currentYear });
    const provisionalRefreshFrom = provisionalStartYear(metric, economy, provisionalLedger);
    const autoRefreshFrom = refreshStartYear({ metric, economy, years, values, currentYear, overrides, provisionalLedger });
    const latestLoaded = latestLoadedYear(years, values);
    const derived = DERIVED_METRICS.has(metric);
    const adapterStatus = source?.status ?? (derived ? "derived" : autoRefreshFrom ? "missing-adapter" : "needs-source");
    return {
      metric,
      economy,
      latestLoadedYear: latestLoaded,
      archivedThrough,
      autoRefreshFrom,
      adapterStatus,
      cadence: source?.cadence ?? cadenceForMetric(metric),
      provisionalRefreshFrom,
      source: source?.source ?? null,
      note: source?.note ?? (autoRefreshFrom ? "No automated source adapter is active yet; existing archived values are preserved." : "No loaded official source series yet."),
      rule: CURRENT_YEAR_ROLLING_METRICS.includes(metric)
        ? "Current-year rolling values can refresh; completed years are written only after 12 monthly/month-end observations or an official annual value. Archived years are locked."
        : "Only years after the archived cutoff are eligible for automated writes unless an explicit override marks a provisional year as refreshable.",
    };
  }));
}

export function nextRefreshCandidatesFromMatrix(matrix) {
  const result = {};
  for (const row of matrix) {
    if (!result[row.metric]) result[row.metric] = {};
    result[row.metric][row.economy] = row.autoRefreshFrom ?? "needs-source";
  }
  return result;
}

export function createIngestionLog({ generatedAt = new Date().toISOString(), lastUpdatedDate = isoDate(new Date()), matrix = [], changes = [], errors = [], extraPolicy = {} }) {
  return {
    generatedAt,
    lastUpdatedDate,
    policyVersion: INGESTION_POLICY_VERSION,
    policy: {
      archivedYears: "A value at or before each metric/economy archived cutoff is treated as historical and is not rewritten by automatic refresh scripts, except years explicitly tracked as provisional.",
      refreshStart: "Automatic refresh starts at the earliest of archived cutoff + 1, explicit provisional override, or tracked provisional year.",
      currentYear: "Current-year high-frequency series are rolling YTD averages and are refreshed as new observations appear.",
      acceptance: `Current-year high-frequency values may be stored as rolling YTD previews. Completed high-frequency years require ${FINAL_HIGH_FREQUENCY_MONTHS} monthly or month-end observations, or an official annual value, before they are written as historical data. Annual official points require at least one accepted annual observation.`,
      gaps: "Missing values are not interpolated, extrapolated, or filled with unofficial proxies.",
      ...extraPolicy,
    },
    changes,
    errors,
    nextRefreshCandidates: nextRefreshCandidatesFromMatrix(matrix),
    ingestionMatrix: matrix,
  };
}
