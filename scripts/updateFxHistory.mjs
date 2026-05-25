import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const stressModelPath = path.join(root, "src", "data", "stressModel.ts");
const fxDbPath = path.join(dataDir, "Fx_Stress_Model_Data_v3.json");
const legacyFxDbPath = path.join(dataDir, "fx-history.json");
const FX_ARCHIVE_THROUGH_YEAR = 2025;

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").trim();
  }
};

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(path.dirname(root), "New project", ".env.local"));

const fredApiKey = process.env.FRED_API_KEY;
if (!fredApiKey) throw new Error("FRED_API_KEY is missing. Put it in .env.local before running FX refresh.");

const years = Array.from({ length: 62 }, (_, index) => String(1965 + index));
const currencies = ["eur", "gbp", "usd", "cny", "jpy", "twd", "krw", "inr"];
const DEM_PER_EUR = 1.95583;
const fredUsdValueSeries = {
  eurActual: { id: "DEXUSEU", transform: (value) => value, note: "FRED USD per EUR daily observations; used to extend EUR after the latest World Bank annual value." },
  gbp: { id: "DEXUSUK", transform: (value) => value, note: "FRED USD per GBP daily observations; used for recent-year extension." },
  cny: { id: "DEXCHUS", transform: (value) => 1 / value, note: "FRED gives CNY per USD; transformed to USD per CNY for recent-year extension." },
  jpy: { id: "DEXJPUS", transform: (value) => 1 / value, note: "FRED gives JPY per USD; transformed to USD per JPY for recent-year extension." },
  twd: { id: "DEXTAUS", transform: (value) => 1 / value, note: "FRED gives TWD per USD; transformed to USD per TWD." },
  krw: { id: "DEXKOUS", transform: (value) => 1 / value, note: "FRED gives KRW per USD; transformed to USD per KRW for recent-year extension." },
  inr: { id: "DEXINUS", transform: (value) => 1 / value, note: "FRED gives INR per USD; transformed to USD per INR for recent-year extension." },
};

const worldBankLcuPerUsdSeries = {
  dem: { country: "DEU", note: "World Bank PA.NUS.FCRF Germany official exchange rate, LCU per USD; used as Deutsche Mark proxy before 1999." },
  eurActual: { country: "EMU", note: "World Bank PA.NUS.FCRF Euro Area official exchange rate, EUR per USD; used from 1999 onward." },
  gbp: { country: "GBR", note: "World Bank PA.NUS.FCRF United Kingdom official exchange rate, GBP per USD." },
  cny: { country: "CHN", note: "World Bank PA.NUS.FCRF China official exchange rate, CNY per USD." },
  jpy: { country: "JPN", note: "World Bank PA.NUS.FCRF Japan official exchange rate, JPY per USD." },
  krw: { country: "KOR", note: "World Bank PA.NUS.FCRF Korea official exchange rate, KRW per USD." },
  inr: { country: "IND", note: "World Bank PA.NUS.FCRF India official exchange rate, INR per USD." },
};

const pairEconomies = {
  eurgbp: ["eur", "gbp"], eurusd: ["eur", "usd"], eurcny: ["eur", "cny"], eurjpy: ["eur", "jpy"], eurtwd: ["eur", "twd"], eurkrw: ["eur", "krw"], eurinr: ["eur", "inr"],
  gbpusd: ["gbp", "usd"], gbpcny: ["gbp", "cny"], gbpjpy: ["gbp", "jpy"], gbptwd: ["gbp", "twd"], gbpkrw: ["gbp", "krw"], gbpinr: ["gbp", "inr"],
  usdcny: ["usd", "cny"], usdjpy: ["usd", "jpy"], usdtwd: ["usd", "twd"], usdkrw: ["usd", "krw"], usdinr: ["usd", "inr"],
  cnyjpy: ["cny", "jpy"], cnytwd: ["cny", "twd"], cnykrw: ["cny", "krw"], cnyinr: ["cny", "inr"],
  jpytwd: ["jpy", "twd"], jpykrw: ["jpy", "krw"], jpyinr: ["jpy", "inr"],
  twdkrw: ["twd", "krw"], twdinr: ["twd", "inr"], krwinr: ["krw", "inr"],
};

const fetchFredObservations = async (seriesId) => {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", fredApiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", "1965-01-01");
  url.searchParams.set("observation_end", "2026-12-31");
  const response = await fetch(url, { headers: { "user-agent": "fx-stress-model-data-refresh/1.0" } });
  if (!response.ok) throw new Error(`${seriesId}: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  return payload.observations ?? [];
};

const fetchWorldBankAnnual = async (country) => {
  const url = new URL(`https://api.worldbank.org/v2/country/${country}/indicator/PA.NUS.FCRF`);
  url.searchParams.set("format", "json");
  url.searchParams.set("per_page", "20000");
  const response = await fetch(url, { headers: { "user-agent": "fx-stress-model-data-refresh/1.0" } });
  if (!response.ok) throw new Error(`World Bank ${country}: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  return payload[1] ?? [];
};

const annualAverage = (observations, transform) => {
  const buckets = new Map();
  for (const observation of observations) {
    const raw = observation.value;
    if (!raw || raw === ".") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const year = observation.date.slice(0, 4);
    if (!years.includes(year)) continue;
    const transformed = transform(value);
    if (!Number.isFinite(transformed)) continue;
    const bucket = buckets.get(year) ?? { sum: 0, count: 0 };
    bucket.sum += transformed;
    bucket.count += 1;
    buckets.set(year, bucket);
  }
  return Object.fromEntries([...buckets.entries()].map(([year, bucket]) => [year, Number((bucket.sum / bucket.count).toFixed(8))]));
};

const toSeries = (byYear) => years.map((year) => byYear[year] ?? null);
const rounded = (value) => (value === null ? null : Number(value.toFixed(4)));
const extractConstJson = (source, name, trailer) => {
  const startToken = `export const ${name} = `;
  const start = source.indexOf(startToken);
  if (start < 0) return null;
  const valueStart = start + startToken.length;
  const end = source.indexOf(trailer, valueStart);
  if (end < 0) return null;
  return JSON.parse(source.slice(valueStart, end).trim());
};
const mergeArchivedSeries = (freshValues, existingYears, existingValues = []) => years.map((year, index) => {
  if (Number(year) > FX_ARCHIVE_THROUGH_YEAR) return freshValues[index] ?? null;
  const existingIndex = existingYears.indexOf(year);
  const existingValue = existingIndex >= 0 ? existingValues[existingIndex] : null;
  return existingValue ?? freshValues[index] ?? null;
});
const mergeAnnual = (...seriesList) => {
  const merged = {};
  for (const series of seriesList) {
    for (const [year, value] of Object.entries(series)) {
      if (merged[year] == null && Number.isFinite(value)) merged[year] = value;
    }
  }
  return merged;
};

const availableYearsFor = (series) => Object.keys(series).filter((year) => years.includes(year) && Number.isFinite(series[year])).sort();

const main = async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  const source = fs.readFileSync(stressModelPath, "utf8");
  const existingFxYears = extractConstJson(source, "stressFxYears", ";") ?? [];
  const existingFxData = extractConstJson(source, "stressFxData", " as const satisfies Record<StressPairKey, StressValue[]>;") ?? {};
  const existingFxDb = fs.existsSync(fxDbPath) ? JSON.parse(fs.readFileSync(fxDbPath, "utf8")) : null;

  const usdValueByCurrency = { usd: Object.fromEntries(years.map((year) => [year, 1])) };
  const sourceCoverage = { usd: { source: "Identity", firstYear: "1965", lastYear: "2026", observations: years.length, note: "USD base." } };

  const worldBankUsdValueByCurrency = {};
  const worldBankCoverage = {};
  for (const [currency, config] of Object.entries(worldBankLcuPerUsdSeries)) {
    const observations = await fetchWorldBankAnnual(config.country);
    const annual = {};
    for (const observation of observations) {
      const year = observation.date;
      const lcuPerUsd = Number(observation.value);
      if (!years.includes(year) || !Number.isFinite(lcuPerUsd) || lcuPerUsd === 0) continue;
      annual[year] = Number((1 / lcuPerUsd).toFixed(8));
    }
    worldBankUsdValueByCurrency[currency] = annual;
    const availableYears = availableYearsFor(annual);
    worldBankCoverage[currency] = {
      source: `World Bank PA.NUS.FCRF ${config.country}`,
      firstYear: availableYears[0] ?? null,
      lastYear: availableYears.at(-1) ?? null,
      observations: availableYears.length,
      note: config.note,
    };
  }

  const fredUsdValueByCurrency = {};
  const fredCoverage = {};
  for (const [currency, config] of Object.entries(fredUsdValueSeries)) {
    const observations = await fetchFredObservations(config.id);
    const annual = annualAverage(observations, config.transform);
    fredUsdValueByCurrency[currency] = annual;
    const availableYears = availableYearsFor(annual);
    fredCoverage[currency] = {
      source: `FRED ${config.id}`,
      firstYear: availableYears[0] ?? null,
      lastYear: availableYears.at(-1) ?? null,
      observations: availableYears.length,
      note: config.note,
    };
  }

  const syntheticEur = {};
  const demAnnual = mergeAnnual(worldBankUsdValueByCurrency.dem ?? {});
  const eurActualAnnual = mergeAnnual(worldBankUsdValueByCurrency.eurActual ?? {}, fredUsdValueByCurrency.eurActual ?? {});
  for (const year of years) {
    if (Number(year) < 1999) {
      const demUsd = demAnnual[year];
      if (Number.isFinite(demUsd)) syntheticEur[year] = Number((demUsd * DEM_PER_EUR).toFixed(8));
    } else if (Number.isFinite(eurActualAnnual[year])) {
      syntheticEur[year] = eurActualAnnual[year];
    }
  }
  usdValueByCurrency.eur = syntheticEur;
  for (const currency of ["gbp", "cny", "jpy", "krw", "inr"]) {
    usdValueByCurrency[currency] = mergeAnnual(worldBankUsdValueByCurrency[currency] ?? {}, fredUsdValueByCurrency[currency] ?? {});
    const availableYears = availableYearsFor(usdValueByCurrency[currency]);
    sourceCoverage[currency] = {
      source: `${worldBankCoverage[currency]?.source}; ${fredCoverage[currency]?.source} for years not yet available in World Bank`,
      firstYear: availableYears[0] ?? null,
      lastYear: availableYears.at(-1) ?? null,
      observations: availableYears.length,
      note: `${worldBankCoverage[currency]?.note ?? ""} Recent years, where World Bank annual values are not yet published, are filled from FRED annual arithmetic averages of observed daily rates.`,
    };
  }
  usdValueByCurrency.twd = fredUsdValueByCurrency.twd ?? {};
  const twdYears = availableYearsFor(usdValueByCurrency.twd);
  sourceCoverage.twd = {
    source: fredCoverage.twd?.source ?? "FRED DEXTAUS",
    firstYear: twdYears[0] ?? null,
    lastYear: twdYears.at(-1) ?? null,
    observations: twdYears.length,
    note: "Taiwan is not available in World Bank PA.NUS.FCRF; FRED TWD per USD is transformed to USD per TWD.",
  };

  const eurYears = availableYearsFor(syntheticEur);
  sourceCoverage.eur = {
    source: "World Bank Germany PA.NUS.FCRF before 1999 via official DEM/EUR conversion; World Bank Euro Area PA.NUS.FCRF from 1999, extended with FRED DEXUSEU for recent years",
    firstYear: eurYears[0] ?? null,
    lastYear: eurYears.at(-1) ?? null,
    observations: eurYears.length,
    note: "EUR proxy before 1999 uses Deutsche Mark because DE/EA macro data before 1999 uses Germany proxy. Official fixed conversion: 1 EUR = 1.95583 DEM. 2025-2026 values are FRED observed-rate annual/YTD averages until World Bank annual values are published.",
  };

  const pairs = {};
  for (const [pair, [base, quote]] of Object.entries(pairEconomies)) {
    pairs[pair] = years.map((year) => {
      const baseUsd = usdValueByCurrency[base]?.[year];
      const quoteUsd = usdValueByCurrency[quote]?.[year];
      return Number.isFinite(baseUsd) && Number.isFinite(quoteUsd) ? rounded(baseUsd / quoteUsd) : null;
    });
  }

  const archivedPairs = Object.fromEntries(Object.entries(pairs).map(([pair, values]) => [
    pair,
    mergeArchivedSeries(values, existingFxYears, existingFxData[pair]),
  ]));
  const archivedUsdValuePerCurrency = Object.fromEntries(currencies.map((currency) => [
    currency,
    mergeArchivedSeries(toSeries(usdValueByCurrency[currency] ?? {}), existingFxDb?.years ?? [], existingFxDb?.usdValuePerCurrency?.[currency]),
  ]));

  const database = {
    generatedAt: new Date().toISOString(),
    source: "World Bank PA.NUS.FCRF annual official exchange rates are the primary source; FRED observed-rate annual averages extend recent unpublished World Bank years and Taiwan. Cross rates are derived through USD-per-currency values. EUR before 1999 is synthesized from Deutsche Mark using 1 EUR = 1.95583 DEM.",
    version: "Fx_Stress_Model_Data_v3",
    archivedThroughYear: String(FX_ARCHIVE_THROUGH_YEAR),
    autoRefreshYears: years.filter((year) => Number(year) > FX_ARCHIVE_THROUGH_YEAR),
    euroProxyRule: "Before 1999, EUR is proxied by Deutsche Mark because pre-1999 DE/EA macro data uses Germany; USD per EUR proxy = USD per DEM × 1.95583.",
    years,
    sourceCoverage,
    usdValuePerCurrency: archivedUsdValuePerCurrency,
    pairs: archivedPairs,
  };
  fs.writeFileSync(fxDbPath, `${JSON.stringify(database, null, 2)}\n`);
  fs.writeFileSync(legacyFxDbPath, `${JSON.stringify(database, null, 2)}\n`);

  let next = source.replace(/export const stressFxYears = [\s\S]*?;/, `export const stressFxYears = ${JSON.stringify(years)};`);
  next = next.replace(/export const stressFxData = [\s\S]*? as const satisfies Record<StressPairKey, StressValue\[]>;/, `export const stressFxData = ${JSON.stringify(archivedPairs)} as const satisfies Record<StressPairKey, StressValue[]>;`);
  next = next.replace(/export const stressDataLastUpdated = ".*?";/, `export const stressDataLastUpdated = "${new Date().toISOString().slice(0, 7)}";`);
  fs.writeFileSync(stressModelPath, next);

  console.log(JSON.stringify({
    fxDbPath,
    updatedStressModel: stressModelPath,
    coverage: sourceCoverage,
  }, null, 2));
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
