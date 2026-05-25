import fs from "node:fs";
import path from "node:path";

const economyOrder = ["eu", "gb", "us", "cn", "jp", "tw", "kr", "in"];
const economyShort = { eu: "EU", gb: "GB", us: "US", cn: "CN", jp: "JP", tw: "TW", kr: "KR", in: "IN" };

function extractConst(source, name) {
  const start = `export const ${name} = `;
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`Cannot find ${name}`);
  const valueStart = startIndex + start.length;
  const endIndex = source.indexOf(";\nexport const ", valueStart);
  const raw = source.slice(valueStart, endIndex < 0 ? source.length : endIndex).replace(/ as const(?: satisfies [\s\S]*)?;?$/, "");
  return JSON.parse(raw);
}

function loadStressModel() {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "data", "stressModel.ts"), "utf8");
  return {
    stressData: extractConst(source, "stressData"),
    stressFxData: extractConst(source, "stressFxData"),
    stressFxYears: extractConst(source, "stressFxYears"),
    stressLayers: extractConst(source, "stressLayers"),
    stressMetricMeta: extractConst(source, "stressMetricMeta"),
    stressPairComparisons: extractConst(source, "stressPairComparisons"),
    stressPairLabels: extractConst(source, "stressPairLabels"),
    stressYears: extractConst(source, "stressYears"),
  };
}

function getLayerMetrics(layer, mode, stressLayers) {
  if (layer === "productivity" && mode === "single") return ["tfpRtfpna", "ulcProxy"];
  if (layer === "productivity" && mode === "pair") return ["tfpCtfp", "ulcProxy"];
  return [...stressLayers[layer].metrics];
}

function alignSeries(sourceYears, values, targetYears) {
  const byYear = new Map(sourceYears.map((year, index) => [year, values[index] ?? null]));
  return targetYears.map((year) => byYear.get(year) ?? null);
}

function usesLogSpread(metric) {
  return metric === "tfpCtfp" || metric === "ulcProxy";
}

function logSpreadSeries(baseValues, quoteValues) {
  return baseValues.map((baseValue, index) => {
    const quoteValue = quoteValues[index];
    if (baseValue === null || quoteValue === null || baseValue <= 0 || quoteValue <= 0) return null;
    return Number((Math.log(baseValue) - Math.log(quoteValue)).toFixed(4));
  });
}

function pairMetricSeries(metric, pair, model) {
  if (!usesLogSpread(metric)) return model.stressPairComparisons[metric][pair];
  const { base, quote } = model.stressPairLabels[pair];
  return logSpreadSeries(model.stressData[metric][base], model.stressData[metric][quote]);
}

function pairDirectionLabel(pair, stressPairLabels) {
  const label = stressPairLabels[pair];
  return `${economyShort[label.base]} - ${economyShort[label.quote]}`;
}

function pairMetricLabel(metric, pair, model) {
  const suffix = usesLogSpread(metric) ? "log spread" : "spread";
  return `${model.stressMetricMeta[metric].label} ${suffix} ${pairDirectionLabel(pair, model.stressPairLabels)}`;
}

function toCsv(rows) {
  return rows.map((row) => row.map((cell) => {
    const text = cell === null || cell === undefined ? "" : String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n");
}

function currentExport(selection) {
  const model = loadStressModel();
  const { dataLayer, economy, pair, viewMode } = selection;
  if (!model.stressLayers[dataLayer]) throw new Error("Invalid data layer.");
  if (!["single", "pair"].includes(viewMode)) throw new Error("Invalid view mode.");
  const metrics = getLayerMetrics(dataLayer, viewMode, model.stressLayers);
  if (viewMode === "single") {
    if (!economyOrder.includes(economy)) throw new Error("Invalid economy.");
    const header = ["Year", ...metrics.map((metric) => model.stressMetricMeta[metric].label)];
    const rows = model.stressYears.map((year, index) => [year, ...metrics.map((metric) => model.stressData[metric][economy][index] ?? null)]);
    return { filename: `fx-stress-single-${economy}-${dataLayer}.csv`, csv: toCsv([header, ...rows]) };
  }
  if (!model.stressPairLabels[pair]) throw new Error("Invalid pair.");
  const chartYears = [...model.stressYears, "2026"];
  const fx = alignSeries(model.stressFxYears, model.stressFxData[pair], chartYears);
  const header = ["Year", model.stressPairLabels[pair].fx, ...metrics.map((metric) => pairMetricLabel(metric, pair, model))];
  const rows = chartYears.map((year, index) => [year, fx[index], ...metrics.map((metric) => alignSeries(model.stressYears, pairMetricSeries(metric, pair, model), chartYears)[index])]);
  return { filename: `fx-stress-pair-${pair}-${dataLayer}.csv`, csv: toCsv([header, ...rows]) };
}

function fullExport() {
  const model = loadStressModel();
  const rows = [["type", "key", "year", "metric", "value"]];
  Object.keys(model.stressData).forEach((metric) => {
    economyOrder.forEach((economy) => {
      model.stressYears.forEach((year, index) => rows.push(["economy", economy, year, metric, model.stressData[metric][economy][index] ?? null]));
    });
  });
  Object.keys(model.stressPairComparisons).forEach((metric) => {
    Object.keys(model.stressPairLabels).forEach((pair) => {
      const metricKey = usesLogSpread(metric) ? `${metric}_log_spread` : metric;
      const values = pairMetricSeries(metric, pair, model);
      model.stressYears.forEach((year, index) => rows.push(["pair", pair, year, metricKey, values[index] ?? null]));
    });
  });
  Object.keys(model.stressFxData).forEach((pair) => {
    model.stressFxYears.forEach((year, index) => rows.push(["fx", pair, year, "fx", model.stressFxData[pair][index] ?? null]));
  });
  return { filename: "fx-stress-model-full-data.csv", csv: toCsv(rows) };
}

function buildExport(kind, selection) {
  return kind === "full" ? fullExport() : currentExport(selection);
}

export { buildExport };
