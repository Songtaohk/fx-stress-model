import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_AUTO_UPDATE_START_OVERRIDES,
  ECONOMY_ORDER as economyOrder,
  LOG_SPREAD_METRICS as logSpreadMetrics,
  buildIngestionMatrix,
  createIngestionLog,
  isFiniteNumber,
  isoDate,
  refreshStartYear,
  round4,
  writeDecision,
} from "./ingestionPolicy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const stressModelPath = path.join(root, "src", "data", "stressModel.ts");
const updateLogPath = path.join(dataDir, "recent-update-log.json");
const ingestionPolicyLogPath = path.join(dataDir, "ingestion-policy-log.json");
const currentYear = new Date().getFullYear();
const currentDate = isoDate(new Date());

const pairEconomies = {
  eurgbp: ["eu", "gb"], eurusd: ["eu", "us"], eurcny: ["eu", "cn"], eurjpy: ["eu", "jp"], eurtwd: ["eu", "tw"], eurkrw: ["eu", "kr"], eurinr: ["eu", "in"],
  gbpusd: ["gb", "us"], gbpcny: ["gb", "cn"], gbpjpy: ["gb", "jp"], gbptwd: ["gb", "tw"], gbpkrw: ["gb", "kr"], gbpinr: ["gb", "in"],
  usdcny: ["us", "cn"], usdjpy: ["us", "jp"], usdtwd: ["us", "tw"], usdkrw: ["us", "kr"], usdinr: ["us", "in"],
  cnyjpy: ["cn", "jp"], cnytwd: ["cn", "tw"], cnykrw: ["cn", "kr"], cnyinr: ["cn", "in"],
  jpytwd: ["jp", "tw"], jpykrw: ["jp", "kr"], jpyinr: ["jp", "in"],
  twdkrw: ["tw", "kr"], twdinr: ["tw", "in"], krwinr: ["kr", "in"],
};

const fredSeries = {
  cpiInflation: {
    eu: { id: "CP0000EZ19M086NEST", kind: "cpiIndex", source: "FRED / Eurostat HICP all-items index" },
    us: { id: "CPIAUCNS", kind: "cpiIndex", source: "FRED / BLS headline CPI index, NSA" },
  },
  nominal10yYield: {
    eu: { id: "IRLTLT01EZM156N", kind: "levelMonthly", source: "FRED / OECD long-term government bond yield" },
    gb: { id: "IRLTLT01GBM156N", kind: "levelMonthly", source: "FRED / OECD long-term government bond yield" },
    us: { id: "DGS10", kind: "levelMonthEnd", source: "FRED / U.S. Treasury 10Y daily yield, month-end sampled" },
    cn: { id: "IRLTLT01CNM156N", kind: "levelMonthly", source: "FRED / OECD long-term government bond yield" },
    jp: { id: "IRLTLT01JPM156N", kind: "levelMonthly", source: "FRED / OECD long-term government bond yield" },
    kr: { id: "IRLTLT01KRM156N", kind: "levelMonthly", source: "FRED / OECD long-term government bond yield" },
    in: { id: "IRLTLT01INM156N", kind: "levelMonthly", source: "FRED / OECD long-term government bond yield" },
  },
  policyRateNominal: {
    eu: { id: "ECBMRRFR", kind: "levelMonthEnd", source: "FRED / ECB main refinancing operations rate" },
    gb: { id: "INTDSRGBM193N", kind: "levelMonthly", source: "FRED / discount or policy-rate type series" },
    us: { id: "FEDFUNDS", kind: "levelMonthly", source: "FRED / effective federal funds rate" },
    cn: { id: "INTDSRCNM193N", kind: "levelMonthly", source: "FRED / discount or policy-rate type series" },
    jp: { id: "INTDSRJPM193N", kind: "levelMonthly", source: "FRED / discount or policy-rate type series" },
    kr: { id: "INTDSRKRM193N", kind: "levelMonthly", source: "FRED / discount or policy-rate type series" },
    in: { id: "INTDSRINM193N", kind: "levelMonthly", source: "FRED / discount or policy-rate type series" },
  },
};

const officialCpiSources = {
  gb: {
    kind: "onsAnnualInflation",
    url: "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23/data",
    source: "ONS MM23 D7G7 CPI annual inflation and monthly 12-month rate",
  },
  cn: {
    kind: "fixedAnnual",
    source: "National Bureau of Statistics of China, Consumer Price Index in December 2025",
    entries: [{ year: "2025", value: 0.0, observations: 12, lastDate: "2025-12-01" }],
  },
  jp: {
    kind: "fixedAnnual",
    source: "Statistics Bureau of Japan, 2025 yearly average CPI report",
    entries: [{ year: "2025", value: 3.2, observations: 12, lastDate: "2025-12-01" }],
  },
  kr: {
    kind: "fixedAnnual",
    source: "Ministry of Data and Statistics Korea, Consumer Price Index in December 2025",
    entries: [{ year: "2025", value: 2.1, observations: 12, lastDate: "2025-12-01" }],
  },
  in: {
    kind: "monthlyIndexAnnualYoy",
    source: "India PIB / MoSPI CPI December 2025 press release, Annexure VII monthly All-India CPI index",
    entries: [
      ["2024-01-01", 185.5],
      ["2024-02-01", 185.8],
      ["2024-03-01", 185.8],
      ["2024-04-01", 186.7],
      ["2024-05-01", 187.7],
      ["2024-06-01", 190.2],
      ["2024-07-01", 193.0],
      ["2024-08-01", 193.0],
      ["2024-09-01", 194.2],
      ["2024-10-01", 196.8],
      ["2024-11-01", 196.5],
      ["2024-12-01", 195.4],
      ["2025-01-01", 193.4],
      ["2025-02-01", 192.5],
      ["2025-03-01", 192.0],
      ["2025-04-01", 192.6],
      ["2025-05-01", 193.0],
      ["2025-06-01", 194.2],
      ["2025-07-01", 196.1],
      ["2025-08-01", 197.0],
      ["2025-09-01", 197.0],
      ["2025-10-01", 197.3],
      ["2025-11-01", 197.9],
      ["2025-12-01", 198.0],
    ],
  },
};

const policyRateAnnualOverrides = {
  eu: {
    source: "Fx_Stress_Model_Data_v4 Policy_Rate_Nominal archived official annual average",
    entries: [{ year: "2025", value: 2.2292, observations: 12, lastDate: "2025-12-01" }],
  },
  gb: {
    source: "Fx_Stress_Model_Data_v4 Policy_Rate_Nominal archived official annual average",
    entries: [{ year: "2025", value: 4.2292, observations: 12, lastDate: "2025-12-01" }],
  },
  us: {
    source: "Fx_Stress_Model_Data_v4 Policy_Rate_Nominal archived official annual average",
    entries: [{ year: "2025", value: 4.2083, observations: 12, lastDate: "2025-12-01" }],
  },
  cn: {
    source: "Fx_Stress_Model_Data_v4 Policy_Rate_Nominal archived official annual average",
    entries: [{ year: "2025", value: 3.0333, observations: 12, lastDate: "2025-12-01" }],
  },
  jp: {
    source: "Fx_Stress_Model_Data_v4 Policy_Rate_Nominal archived official annual average",
    entries: [{ year: "2025", value: 0.5208, observations: 12, lastDate: "2025-12-01" }],
  },
  tw: {
    source: "Fx_Stress_Model_Data_v4 Policy_Rate_Nominal archived official annual average",
    entries: [{ year: "2025", value: 2.0, observations: 12, lastDate: "2025-12-01" }],
  },
  kr: {
    source: "Fx_Stress_Model_Data_v4 Policy_Rate_Nominal archived official annual average",
    entries: [{ year: "2025", value: 2.6042, observations: 12, lastDate: "2025-12-01" }],
  },
  in: {
    source: "Fx_Stress_Model_Data_v4 Policy_Rate_Nominal archived official annual average",
    entries: [{ year: "2025", value: 5.7708, observations: 12, lastDate: "2025-12-01" }],
  },
};

const currentAccountGdpOverrides = {
  gb: {
    source: "IMF WEO 2025-04 via DB.NOMICS, BCA_NGDPD percent of GDP",
    entries: [{ year: "2025", value: -3.684, observations: 1, lastDate: "2025-12-31" }],
  },
  us: {
    source: "IMF WEO 2025-04 via DB.NOMICS, BCA_NGDPD percent of GDP",
    entries: [{ year: "2025", value: -3.729, observations: 1, lastDate: "2025-12-31" }],
  },
  cn: {
    source: "IMF WEO 2025-04 via DB.NOMICS, BCA_NGDPD percent of GDP",
    entries: [{ year: "2025", value: 1.886, observations: 1, lastDate: "2025-12-31" }],
  },
  jp: {
    source: "IMF WEO 2025-04 via DB.NOMICS, BCA_NGDPD percent of GDP",
    entries: [{ year: "2025", value: 3.39, observations: 1, lastDate: "2025-12-31" }],
  },
  kr: {
    source: "IMF WEO 2025-04 via DB.NOMICS, BCA_NGDPD percent of GDP",
    entries: [{ year: "2025", value: 3.5, observations: 1, lastDate: "2025-12-31" }],
  },
  in: {
    source: "IMF WEO 2025-04 via DB.NOMICS, BCA_NGDPD percent of GDP",
    entries: [{ year: "2025", value: -0.946, observations: 1, lastDate: "2025-12-31" }],
  },
};

const automatedSourceRegistry = {
  cpiInflation: {
    eu: { status: "active", cadence: "high-frequency", source: `${fredSeries.cpiInflation.eu.source} (${fredSeries.cpiInflation.eu.id})` },
    us: { status: "active", cadence: "high-frequency", source: `${fredSeries.cpiInflation.us.source} (${fredSeries.cpiInflation.us.id})` },
    gb: { status: "active", cadence: "high-frequency", source: officialCpiSources.gb.source },
    cn: { status: "manual-fixed-official", cadence: "annual", source: officialCpiSources.cn.source },
    jp: { status: "manual-fixed-official", cadence: "annual", source: officialCpiSources.jp.source },
    kr: { status: "manual-fixed-official", cadence: "annual", source: officialCpiSources.kr.source },
    in: { status: "active", cadence: "high-frequency", source: officialCpiSources.in.source },
  },
  nominal10yYield: Object.fromEntries(Object.entries(fredSeries.nominal10yYield).map(([economy, config]) => [
    economy,
    { status: "active", cadence: "high-frequency", source: `${config.source} (${config.id})` },
  ])),
  caGdp: Object.fromEntries(Object.entries(currentAccountGdpOverrides).map(([economy, config]) => [
    economy,
    { status: "manual-fixed-official", cadence: "annual", source: config.source },
  ])),
  realPolicyRate: Object.fromEntries(economyOrder.map((economy) => [
    economy,
    { status: "derived", cadence: "high-frequency", source: "Nominal policy rate minus headline CPI inflation." },
  ])),
  realPolicyRateZ: Object.fromEntries(economyOrder.map((economy) => [
    economy,
    { status: "derived", cadence: "high-frequency", source: "Standardized real policy rate." },
  ])),
};

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").trim().replace(/^["']|["']$/g, "");
  }
};

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(path.dirname(root), "New project", ".env.local"));

const extractConstJson = (source, name, trailer) => {
  const startToken = `export const ${name} = `;
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`Cannot find ${name}`);
  const valueStart = start + startToken.length;
  const end = source.indexOf(trailer, valueStart);
  if (end < 0) throw new Error(`Cannot find trailer for ${name}`);
  return JSON.parse(source.slice(valueStart, end).trim());
};

const replaceConst = (source, name, trailerRegex, valueText) => source.replace(
  new RegExp(`export const ${name} = [\\s\\S]*?${trailerRegex}`),
  `export const ${name} = ${valueText}`,
);

const valueByDate = (observations) => observations
  .map((observation) => ({
    date: observation.date,
    value: Number(observation.value),
  }))
  .filter((entry) => entry.date && isFiniteNumber(entry.value));

const fetchFredObservations = async (apiKey, seriesId) => {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", `${START_YEAR - 1}-01-01`);
  url.searchParams.set("observation_end", `${currentYear}-12-31`);
  const response = await fetch(url, { headers: { "user-agent": "fx-stress-model-recent-refresh/1.0" } });
  if (!response.ok) throw new Error(`${seriesId}: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  return valueByDate(payload.observations ?? []);
};

const annualAverageFromMonthly = (entries) => {
  const buckets = new Map();
  for (const { date, value } of entries) {
    const year = date.slice(0, 4);
    const bucket = buckets.get(year) ?? { sum: 0, count: 0, lastDate: null };
    bucket.sum += value;
    bucket.count += 1;
    bucket.lastDate = date;
    buckets.set(year, bucket);
  }
  return Object.fromEntries([...buckets.entries()].map(([year, bucket]) => [
    year,
    { value: round4(bucket.sum / bucket.count), observations: bucket.count, lastDate: bucket.lastDate },
  ]));
};

const annualAverageFromMonthEnd = (entries) => {
  const byMonth = new Map();
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const prior = byMonth.get(month);
    if (!prior || entry.date > prior.date) byMonth.set(month, entry);
  }
  return annualAverageFromMonthly([...byMonth.values()]);
};

const annualCpiYoyAverage = (entries) => {
  const byMonth = new Map(entries.map((entry) => [entry.date.slice(0, 7), entry.value]));
  const yoyEntries = [];
  for (const [month, value] of byMonth.entries()) {
    const [year, monthNumber] = month.split("-").map(Number);
    const priorMonth = `${year - 1}-${String(monthNumber).padStart(2, "0")}`;
    const prior = byMonth.get(priorMonth);
    if (!isFiniteNumber(prior) || prior === 0) continue;
    yoyEntries.push({ date: `${month}-01`, value: ((value / prior) - 1) * 100 });
  }
  return annualAverageFromMonthly(yoyEntries);
};

const seriesFromFred = async (apiKey, config) => {
  const observations = await fetchFredObservations(apiKey, config.id);
  if (config.kind === "cpiIndex") return annualCpiYoyAverage(observations);
  if (config.kind === "levelMonthEnd") return annualAverageFromMonthEnd(observations);
  return annualAverageFromMonthly(observations);
};

const fixedAnnualSeries = (entries) => Object.fromEntries(entries.map((entry) => [
  entry.year,
  { value: round4(entry.value), observations: entry.observations, lastDate: entry.lastDate },
]));

const previewPoint = ({ metric, economy, year, annualPoint, source, status }) => ({
  metric,
  economy,
  year,
  value: annualPoint.value,
  status,
  observations: annualPoint.observations,
  latestObservation: annualPoint.lastDate,
  source,
});

const shouldPreviewPoint = ({ year, annualPoint, autoRefreshFrom, cadence }) => {
  if (!autoRefreshFrom || !annualPoint || !isFiniteNumber(annualPoint.value)) return false;
  if (Number(year) < Number(autoRefreshFrom)) return false;
  if (cadence !== "high-frequency") return false;
  return Number(annualPoint.observations) > 0;
};

const monthlyYoySeries = (entries) => annualAverageFromMonthly(entries.map(([date, value]) => ({ date, value })));

const monthlyIndexAnnualYoySeries = (entries) => {
  const annualIndex = annualAverageFromMonthly(entries.map(([date, value]) => ({ date, value })));
  const annual = {};
  for (const [year, point] of Object.entries(annualIndex)) {
    const prior = annualIndex[String(Number(year) - 1)];
    if (!prior || !isFiniteNumber(prior.value) || prior.value === 0) continue;
    annual[year] = {
      value: round4(((point.value / prior.value) - 1) * 100),
      observations: Math.min(point.observations, prior.observations),
      lastDate: point.lastDate,
    };
  }
  return annual;
};

const fetchOnsAnnualInflation = async (config) => {
  const response = await fetch(config.url, { headers: { "user-agent": "fx-stress-model-recent-refresh/1.0" } });
  if (!response.ok) throw new Error(`${config.url}: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  const annual = {};
  for (const entry of payload.years ?? []) {
    const value = Number(entry.value);
    if (!entry.year || !isFiniteNumber(value)) continue;
    annual[String(entry.year)] = { value: round4(value), observations: 12, lastDate: `${entry.year}-12-01` };
  }
  const currentYearEntries = (payload.months ?? [])
    .map((entry) => ({
      date: `${entry.year}-${String([
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ].indexOf(entry.month) + 1).padStart(2, "0")}-01`,
      value: Number(entry.value),
    }))
    .filter((entry) => entry.date.startsWith(`${currentYear}-`) && isFiniteNumber(entry.value));
  if (currentYearEntries.length > 0) annual[String(currentYear)] = annualAverageFromMonthly(currentYearEntries)[String(currentYear)];
  return annual;
};

const fetchDbnomicsAnnualIndexYoy = async (config) => {
  const response = await fetch(config.url, { headers: { "user-agent": "fx-stress-model-recent-refresh/1.0" } });
  if (!response.ok) throw new Error(`${config.url}: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  const doc = payload.series?.docs?.[0];
  if (!doc?.period || !doc?.value) throw new Error(`${config.url}: unexpected DB.NOMICS payload`);
  const indexEntries = doc.period.map((period, index) => ({ date: `${period}-01-01`, value: Number(doc.value[index]) })).filter((entry) => isFiniteNumber(entry.value));
  const byYear = new Map(indexEntries.map((entry) => [entry.date.slice(0, 4), entry.value]));
  const annual = {};
  for (const { date, value } of indexEntries) {
    const year = date.slice(0, 4);
    const prior = byYear.get(String(Number(year) - 1));
    if (!isFiniteNumber(prior) || prior === 0) continue;
    annual[year] = { value: round4(((value / prior) - 1) * 100), observations: 12, lastDate: date };
  }
  return annual;
};

const seriesFromOfficialCpi = async (config) => {
  if (config.kind === "fixedAnnual") return fixedAnnualSeries(config.entries);
  if (config.kind === "monthlyYoy") return monthlyYoySeries(config.entries);
  if (config.kind === "monthlyIndexAnnualYoy") return monthlyIndexAnnualYoySeries(config.entries);
  if (config.kind === "onsAnnualInflation") return fetchOnsAnnualInflation(config);
  if (config.kind === "dbnomicsAnnualIndexYoy") return fetchDbnomicsAnnualIndexYoy(config);
  throw new Error(`Unsupported official CPI adapter: ${config.kind}`);
};

const ensureYear = (years, stressData, year) => {
  if (years.includes(year)) return;
  years.push(year);
  for (const metricData of Object.values(stressData)) {
    for (const economy of economyOrder) {
      metricData[economy].push(null);
    }
  }
};

const setSeriesValues = ({ years, stressData, metric, economy, annual, source, changes, errors, previewPoints, cadence }) => {
  const values = stressData[metric][economy];
  const autoRefreshFrom = refreshStartYear({
    metric,
    economy,
    years,
    values,
    currentYear,
    overrides: DEFAULT_AUTO_UPDATE_START_OVERRIDES,
  });
  let sawEligibleSourcePoint = false;
  for (let index = 0; index < years.length; index += 1) {
    const year = years[index];
    const yearNumber = Number(year);
    const annualPoint = annual[year];
    const decision = writeDecision({
      metric,
      economy,
      year,
      annualPoint,
      years,
      values,
      currentYear,
      cadence,
      overrides: DEFAULT_AUTO_UPDATE_START_OVERRIDES,
    });
    if (autoRefreshFrom && yearNumber >= Number(autoRefreshFrom) && annualPoint) sawEligibleSourcePoint = true;
    if (!decision.allow) {
      if (decision.reason === "insufficient-observations" && shouldPreviewPoint({ year, annualPoint, autoRefreshFrom, cadence })) {
        previewPoints.push(previewPoint({
          metric,
          economy,
          year,
          annualPoint,
          source,
          status: "provisional-completed-year",
        }));
        if (values[index] !== null) {
          changes.push({
            metric,
            economy,
            year,
            oldValue: values[index],
            newValue: null,
            source,
            status: "moved-from-historical-to-preview",
            autoRefreshFrom,
          });
          values[index] = null;
        }
      }
      continue;
    }
    const nextValue = annualPoint.value;
    if (!isFiniteNumber(nextValue)) continue;
    if (decision.status === "rolling-current-year") {
      previewPoints.push(previewPoint({
        metric,
        economy,
        year,
        annualPoint,
        source,
        status: "rolling-current-year",
      }));
      if (values[index] !== null) {
        changes.push({
          metric,
          economy,
          year,
          oldValue: values[index],
          newValue: null,
          source,
          status: "moved-from-historical-to-preview",
          autoRefreshFrom: decision.autoRefreshFrom,
        });
        values[index] = null;
      }
      continue;
    }
    const oldValue = values[index];
    if (oldValue !== nextValue) {
      values[index] = nextValue;
      changes.push({
        metric,
        economy,
        year,
        oldValue,
        newValue: nextValue,
        source,
        observations: annualPoint.observations,
        latestObservation: annualPoint.lastDate,
        status: decision.status,
        autoRefreshFrom: decision.autoRefreshFrom,
      });
    }
  }
  if (autoRefreshFrom && !sawEligibleSourcePoint) {
    errors.push({ metric, economy, source, autoRefreshFrom, message: `No usable observations found at or after auto-refresh start year ${autoRefreshFrom}.` });
  }
};

const recomputeRealPolicyRate = (years, stressData, policyRateAnnual, changes, previewPoints) => {
  for (const economy of economyOrder) {
    const policyByYear = policyRateAnnual[economy] ?? {};
    const values = stressData.realPolicyRate[economy];
    for (let index = 0; index < years.length; index += 1) {
      const year = years[index];
      const policyPoint = policyByYear[year];
      const cpiValue = stressData.cpiInflation[economy][index];
      const derivedPoint = policyPoint && isFiniteNumber(cpiValue)
        ? { ...policyPoint, value: round4(policyPoint.value - cpiValue) }
        : null;
      const decision = writeDecision({
        metric: "realPolicyRate",
        economy,
        year,
        annualPoint: derivedPoint,
        years,
        values,
        currentYear,
        cadence: "high-frequency",
        overrides: DEFAULT_AUTO_UPDATE_START_OVERRIDES,
      });
      if (!derivedPoint) continue;
      if (!decision.allow) {
        const autoRefreshFrom = refreshStartYear({
          metric: "realPolicyRate",
          economy,
          years,
          values,
          currentYear,
          overrides: DEFAULT_AUTO_UPDATE_START_OVERRIDES,
        });
        if (decision.reason === "insufficient-observations" && shouldPreviewPoint({ year, annualPoint: derivedPoint, autoRefreshFrom, cadence: "high-frequency" })) {
          previewPoints.push(previewPoint({
            metric: "realPolicyRate",
            economy,
            year,
            annualPoint: derivedPoint,
            source: policyPoint.source
              ? `Derived from ${policyPoint.source} minus headline CPI annual/YTD average.`
              : "Derived from nominal policy-rate annual/YTD average minus headline CPI annual/YTD average.",
            status: "provisional-completed-year",
          }));
          if (stressData.realPolicyRate[economy][index] !== null) {
            changes.push({
              metric: "realPolicyRate",
              economy,
              year,
              oldValue: stressData.realPolicyRate[economy][index],
              newValue: null,
              source: "Moved provisional real policy rate out of historical data.",
              status: "moved-from-historical-to-preview",
              autoRefreshFrom,
            });
            stressData.realPolicyRate[economy][index] = null;
          }
        }
        continue;
      }
      const nextValue = derivedPoint.value;
      if (decision.status === "rolling-current-year") {
        previewPoints.push(previewPoint({
          metric: "realPolicyRate",
          economy,
          year,
          annualPoint: derivedPoint,
          source: policyPoint.source
            ? `Derived from ${policyPoint.source} minus headline CPI annual/YTD average.`
            : "Derived from nominal policy-rate annual/YTD average minus headline CPI annual/YTD average.",
          status: "rolling-current-year",
        }));
        if (stressData.realPolicyRate[economy][index] !== null) {
          changes.push({
            metric: "realPolicyRate",
            economy,
            year,
            oldValue: stressData.realPolicyRate[economy][index],
            newValue: null,
            source: "Moved rolling real policy rate out of historical data.",
            status: "moved-from-historical-to-preview",
            autoRefreshFrom: decision.autoRefreshFrom,
          });
          stressData.realPolicyRate[economy][index] = null;
        }
        continue;
      }
      const oldValue = stressData.realPolicyRate[economy][index];
      if (oldValue !== nextValue) {
        stressData.realPolicyRate[economy][index] = nextValue;
        changes.push({
          metric: "realPolicyRate",
          economy,
          year,
          oldValue,
          newValue: nextValue,
          source: policyPoint.source
            ? `Derived from ${policyPoint.source} minus headline CPI annual/YTD average.`
            : "Derived from nominal policy-rate annual/YTD average minus headline CPI annual/YTD average.",
          observations: policyPoint.observations,
          latestObservation: policyPoint.lastDate,
          status: decision.status === "rolling-current-year" ? "rolling-current-year" : "derived-high-frequency-annualized",
          autoRefreshFrom: decision.autoRefreshFrom,
        });
      }
    }
  }
};

const recomputeRealPolicyRateZ = (years, stressData, changes) => {
  for (const economy of economyOrder) {
    const values = stressData.realPolicyRate[economy];
    const sample = values.filter(isFiniteNumber);
    if (sample.length < 2) continue;
    const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
    const variance = sample.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (sample.length - 1);
    const stdev = Math.sqrt(variance);
    if (!isFiniteNumber(stdev) || stdev === 0) continue;
    for (let index = 0; index < years.length; index += 1) {
      const raw = values[index];
      const nextValue = isFiniteNumber(raw) ? round4((raw - mean) / stdev) : null;
      const decision = writeDecision({
        metric: "realPolicyRateZ",
        economy,
        year: years[index],
        annualPoint: nextValue === null ? null : { value: nextValue, observations: Number(years[index]) === currentYear ? 1 : 12, lastDate: `${years[index]}-12-31` },
        years,
        values: stressData.realPolicyRateZ[economy],
        currentYear,
        cadence: "high-frequency",
        overrides: DEFAULT_AUTO_UPDATE_START_OVERRIDES,
      });
      if (!decision.allow) continue;
      const oldValue = stressData.realPolicyRateZ[economy][index];
      if (oldValue !== nextValue) {
        stressData.realPolicyRateZ[economy][index] = nextValue;
        changes.push({
          metric: "realPolicyRateZ",
          economy,
          year: years[index],
          oldValue,
          newValue: nextValue,
          source: "Derived from the current real-policy-rate sample; archived Z-score years are not rewritten by automatic refresh.",
          status: Number(years[index]) === currentYear ? "rolling-current-year" : "derived-standardized",
          autoRefreshFrom: decision.autoRefreshFrom,
        });
      }
    }
  }
};

const recomputePairComparisons = (stressData) => {
  const comparisons = {};
  for (const [metric, metricData] of Object.entries(stressData)) {
    comparisons[metric] = {};
    for (const [pair, [base, quote]] of Object.entries(pairEconomies)) {
      comparisons[metric][pair] = metricData[base].map((baseValue, index) => {
        const quoteValue = metricData[quote][index];
        if (!isFiniteNumber(baseValue) || !isFiniteNumber(quoteValue)) return null;
        if (logSpreadMetrics.has(metric)) {
          if (baseValue <= 0 || quoteValue <= 0) return null;
          return round4(Math.log(baseValue) - Math.log(quoteValue));
        }
        return round4(baseValue - quoteValue);
      });
    }
  }
  return comparisons;
};

const main = async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    const source = fs.readFileSync(stressModelPath, "utf8");
    const years = extractConstJson(source, "stressYears", ";");
    const stressData = extractConstJson(source, "stressData", " as const satisfies Record<StressMetricKey, Record<StressEconomyKey, StressValue[]>>;");
    const matrix = buildIngestionMatrix({
      years,
      stressData,
      currentYear,
      sourceRegistry: automatedSourceRegistry,
      overrides: DEFAULT_AUTO_UPDATE_START_OVERRIDES,
    });
    const log = createIngestionLog({
      lastUpdatedDate: currentDate,
      matrix,
      changes: [],
      errors: [{ source: "FRED", message: "FRED_API_KEY is missing. High-frequency CPI, 10Y yield, and policy-rate refresh was skipped; no local data constants were changed." }],
    });
    fs.writeFileSync(updateLogPath, `${JSON.stringify(log, null, 2)}\n`);
    fs.writeFileSync(ingestionPolicyLogPath, `${JSON.stringify(log, null, 2)}\n`);
    console.log(JSON.stringify({ updatedStressModel: false, changes: 0, errors: 1, updateLogPath }, null, 2));
    return;
  }

  const source = fs.readFileSync(stressModelPath, "utf8");
  const years = extractConstJson(source, "stressYears", ";");
  const stressData = extractConstJson(source, "stressData", " as const satisfies Record<StressMetricKey, Record<StressEconomyKey, StressValue[]>>;");
  const existingPreviewData = extractConstJson(source, "stressPreviewData", " as const satisfies StressPreviewPoint[];") ?? [];
  ensureYear(years, stressData, String(currentYear));

  const changes = [];
  const errors = [];
  const previewPoints = [];
  const policyRateAnnual = {};

  for (const [metric, economies] of Object.entries(fredSeries)) {
    for (const [economy, config] of Object.entries(economies)) {
      try {
        const annual = await seriesFromFred(apiKey, config);
        if (metric === "policyRateNominal") {
          policyRateAnnual[economy] = annual;
        } else {
          setSeriesValues({ years, stressData, metric, economy, annual, source: `${config.source} (${config.id})`, changes, errors, previewPoints });
        }
      } catch (error) {
        errors.push({ metric, economy, source: `${config.source} (${config.id})`, message: error.message });
      }
    }
  }

  for (const [economy, config] of Object.entries(officialCpiSources)) {
    try {
      const annual = await seriesFromOfficialCpi(config);
      setSeriesValues({ years, stressData, metric: "cpiInflation", economy, annual, source: config.source, changes, errors, previewPoints });
    } catch (error) {
      errors.push({ metric: "cpiInflation", economy, source: config.source, message: error.message });
    }
  }

  for (const [economy, config] of Object.entries(policyRateAnnualOverrides)) {
    const overrideAnnual = fixedAnnualSeries(config.entries);
    policyRateAnnual[economy] = {
      ...(policyRateAnnual[economy] ?? {}),
      ...Object.fromEntries(Object.entries(overrideAnnual).map(([year, point]) => [
        year,
        { ...point, source: config.source },
      ])),
    };
  }

  for (const [economy, config] of Object.entries(currentAccountGdpOverrides)) {
    try {
      const annual = fixedAnnualSeries(config.entries);
      setSeriesValues({ years, stressData, metric: "caGdp", economy, annual, source: config.source, changes, errors, previewPoints });
    } catch (error) {
      errors.push({ metric: "caGdp", economy, source: config.source, message: error.message });
    }
  }

  recomputeRealPolicyRate(years, stressData, policyRateAnnual, changes, previewPoints);
  recomputeRealPolicyRateZ(years, stressData, changes);
  const stressPairComparisons = recomputePairComparisons(stressData);
  const sortedPreviewPoints = previewPoints
    .sort((a, b) => `${a.metric}:${a.economy}:${a.year}`.localeCompare(`${b.metric}:${b.economy}:${b.year}`));
  const previewChanged = JSON.stringify(existingPreviewData) !== JSON.stringify(sortedPreviewPoints);

  const ingestionMatrix = buildIngestionMatrix({
    years,
    stressData,
    currentYear,
    sourceRegistry: automatedSourceRegistry,
    overrides: DEFAULT_AUTO_UPDATE_START_OVERRIDES,
  });
  const log = createIngestionLog({
    lastUpdatedDate: currentDate,
    matrix: ingestionMatrix,
    changes,
    errors,
    extraPolicy: {
      scope: "Refreshes only years at or after each metric/economy auto-refresh start year. Historical archived years are preserved.",
      cpi: "Monthly CPI index observations are converted to monthly YoY inflation rates; annual/current-year value is the average of available monthly YoY rates.",
      nominal10yYield: "Daily 10Y yields use month-end observations; monthly series use monthly observations. Annual/current-year value is the average of available monthly points.",
      realPolicyRate: "Nominal policy-rate annual/YTD average minus headline CPI annual/YTD average.",
      realPolicyRateZ: "Stored Z-score values are refreshed only for eligible years; archived Z-score snapshots are not automatically rewritten.",
    },
  });
  log.previewData = sortedPreviewPoints;
  fs.writeFileSync(updateLogPath, `${JSON.stringify(log, null, 2)}\n`);
  fs.writeFileSync(ingestionPolicyLogPath, `${JSON.stringify(log, null, 2)}\n`);

  if (changes.length === 0 && !previewChanged) {
    console.log(JSON.stringify({
      updatedStressModel: false,
      changes: 0,
      errors: errors.length,
      updateLogPath,
    }, null, 2));
    return;
  }

  let next = source;
  next = replaceConst(next, "stressYears", ";", `${JSON.stringify(years)};`);
  next = replaceConst(next, "stressPreviewData", " as const satisfies StressPreviewPoint\\[\\];", `${JSON.stringify(sortedPreviewPoints)} as const satisfies StressPreviewPoint[];`);
  next = replaceConst(next, "stressData", " as const satisfies Record<StressMetricKey, Record<StressEconomyKey, StressValue\\[\\]>>;", `${JSON.stringify(stressData)} as const satisfies Record<StressMetricKey, Record<StressEconomyKey, StressValue[]>>;`);
  next = replaceConst(next, "stressPairComparisons", " as const satisfies Record<StressMetricKey, Record<StressPairKey, StressValue\\[\\]>>;", `${JSON.stringify(stressPairComparisons)} as const satisfies Record<StressMetricKey, Record<StressPairKey, StressValue[]>>;`);
  if (changes.length > 0 || previewChanged) {
    next = next.replace(/export const stressDataLastUpdated = ".*?";/, `export const stressDataLastUpdated = "${currentDate}";`);
  }
  fs.writeFileSync(stressModelPath, next);

  console.log(JSON.stringify({
    updatedStressModel: changes.length > 0,
    changes: changes.length,
    errors: errors.length,
    updateLogPath,
  }, null, 2));
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
