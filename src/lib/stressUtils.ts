import {
  stressLayers,
  stressPairLabels,
  type StressLayerKey,
  type StressMetricKey,
  type StressPairKey,
  type StressValue,
} from "../data/stressModel";

export type ViewMode = "single" | "pair";
export type ScaleMode = "raw" | "zscore";

const economyShort = {
  eu: "EU",
  gb: "GB",
  us: "US",
  cn: "CN",
  jp: "JP",
  tw: "TW",
  kr: "KR",
  in: "IN",
} as const;

export function getLayerMetrics(layer: StressLayerKey, mode: ViewMode): StressMetricKey[] {
  if (layer === "monetary") {
    return ["realPolicyRate", "nominal10yYield", "cpiInflation"];
  }
  if (layer === "productivity" && mode === "single") {
    return ["tfpRtfpna", "ulcProxy"];
  }
  if (layer === "productivity" && mode === "pair") {
    return ["tfpCtfp", "ulcProxy"];
  }
  return [...stressLayers[layer].metrics] as StressMetricKey[];
}

export function zScoreSeries(values: readonly StressValue[]): StressValue[] {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length < 2) {
    return values.map((value) => (value === null ? null : 0));
  }
  const avg = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const variance = numbers.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (numbers.length - 1);
  const std = Math.sqrt(variance);
  if (!std) {
    return values.map((value) => (value === null ? null : 0));
  }
  return values.map((value) => (value === null ? null : Number(((value - avg) / std).toFixed(4))));
}

export function alignSeries(sourceYears: readonly string[], values: readonly StressValue[], targetYears: readonly string[]): StressValue[] {
  const byYear = new Map(sourceYears.map((year, index) => [year, values[index] ?? null]));
  return targetYears.map((year) => byYear.get(year) ?? null);
}

export function logSpreadSeries(baseValues: readonly StressValue[], quoteValues: readonly StressValue[], digits = 4): StressValue[] {
  return baseValues.map((baseValue, index) => {
    const quoteValue = quoteValues[index];
    if (baseValue === null || quoteValue === null || baseValue <= 0 || quoteValue <= 0) return null;
    return Number((Math.log(baseValue) - Math.log(quoteValue)).toFixed(digits));
  });
}

export function pairDirectionLabel(pair: StressPairKey): string {
  const label = stressPairLabels[pair];
  return `${economyShort[label.base]} - ${economyShort[label.quote]}`;
}

export function numericRange(values: readonly StressValue[]): number {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length < 2) return 0;
  return Math.max(...numbers) - Math.min(...numbers);
}

export function numericMeanMagnitude(values: readonly StressValue[]): number {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + Math.abs(value), 0) / numbers.length;
}

function numericExtent(values: readonly StressValue[]) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  return { min, max, mean, range: max - min };
}

function dominantBy(values: readonly number[], threshold: number): number | null {
  const ranked = values.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value);
  if (ranked.length < 2 || ranked[0].value === 0 || ranked[1].value === 0) return null;
  return ranked[0].value / ranked[1].value >= threshold ? ranked[0].index : null;
}

export function dominantSeriesIndex(series: readonly (readonly StressValue[])[], threshold = 3): number | null {
  const ranges = series.map(numericRange);
  const means = series.map(numericMeanMagnitude);
  const rangeDominant = dominantBy(ranges, threshold);
  const meanDominant = dominantBy(means, threshold);
  if (rangeDominant === null) return meanDominant;
  if (meanDominant === null || meanDominant === rangeDominant) return rangeDominant;
  const rangeRatio = ranges[rangeDominant] / Math.max(ranges[meanDominant], Number.EPSILON);
  const meanRatio = means[meanDominant] / Math.max(means[rangeDominant], Number.EPSILON);
  return rangeRatio >= meanRatio ? rangeDominant : meanDominant;
}

export function splitRightAxisIndexes(series: readonly (readonly StressValue[])[], threshold = 3): Set<number> {
  const means = series.map(numericMeanMagnitude);
  const ranges = series.map(numericRange);
  const scale = series.map((_, index) => Math.max(means[index], ranges[index]));
  const ratioScore = (values: readonly number[], indexes: readonly number[]) => {
    const positives = indexes.map((index) => values[index]).filter((value) => value > 0);
    if (positives.length < 2) return 1;
    return Math.max(...positives) / Math.max(Math.min(...positives), Number.EPSILON);
  };
  const splitScore = (rightIndexes: Set<number>) => {
    const left = series.map((_, index) => index).filter((index) => !rightIndexes.has(index));
    const right = series.map((_, index) => index).filter((index) => rightIndexes.has(index));
    return Math.max(
      ratioScore(means, left),
      ratioScore(ranges, left),
      ratioScore(means, right),
      ratioScore(ranges, right),
    );
  };
  const allIndexes = series.map((_, index) => index);
  const baselineScore = Math.max(ratioScore(means, allIndexes), ratioScore(ranges, allIndexes));
  if (series.length === 2) return baselineScore <= 1.5 ? new Set() : new Set([1]);
  if (baselineScore < threshold || series.length < 2) return new Set();

  const positiveScaleIndexes = scale.map((value, index) => ({ value, index })).filter(({ value }) => value > 0);
  if (positiveScaleIndexes.length < 2) return new Set();
  const largestScaleIndex = positiveScaleIndexes.reduce((largest, item) => (item.value > largest.value ? item : largest)).index;
  const smallestScaleIndex = positiveScaleIndexes.reduce((smallest, item) => (item.value < smallest.value ? item : smallest)).index;

  let bestIndexes = new Set<number>([largestScaleIndex]);
  let bestScore = splitScore(bestIndexes);
  const candidateIndexes = allIndexes.filter((index) => index !== largestScaleIndex && index !== smallestScaleIndex);
  const maxMask = 1 << candidateIndexes.length;
  for (let mask = 0; mask < maxMask; mask += 1) {
    const candidate = new Set<number>([largestScaleIndex]);
    for (let bit = 0; bit < candidateIndexes.length; bit += 1) {
      if ((mask & (1 << bit)) !== 0) candidate.add(candidateIndexes[bit]);
    }
    const score = splitScore(candidate);
    if (score < bestScore || (score === bestScore && candidate.size < bestIndexes.size)) {
      bestScore = score;
      bestIndexes = candidate;
    }
  }
  return bestIndexes;
}

export function splitRightAxisIndexesAnchoredLeft(
  series: readonly (readonly StressValue[])[],
  leftAnchorIndex = 0,
  threshold = 3,
): Set<number> {
  const extents = series.map(numericExtent);
  const anchor = extents[leftAnchorIndex];
  if (!anchor) return new Set();
  const ratioDistance = (a: number, b: number) => {
    const larger = Math.max(a, b);
    const smaller = Math.min(a, b);
    if (larger === 0) return 1;
    return larger / Math.max(smaller, Number.EPSILON);
  };
  const distanceFromAnchor = (index: number) => {
    const extent = extents[index];
    if (!extent) return 1;
    const combinedRange = Math.max(anchor.max, extent.max) - Math.min(anchor.min, extent.min);
    const ownRange = Math.max(anchor.range, extent.range);
    const rangeDistance = ownRange > 0 ? combinedRange / ownRange : Math.abs(anchor.mean - extent.mean) > 0 ? Number.POSITIVE_INFINITY : 1;
    const meanDistance = ratioDistance(Math.abs(anchor.mean), Math.abs(extent.mean));
    const scaleDistance = ratioDistance(Math.max(Math.abs(anchor.mean), anchor.range), Math.max(Math.abs(extent.mean), extent.range));
    return Math.max(rangeDistance, meanDistance, scaleDistance);
  };
  const rightIndexes = new Set<number>();
  series.forEach((_, index) => {
    const splitThreshold = series.length === 2 ? 1.5 : threshold;
    if (index !== leftAnchorIndex && distanceFromAnchor(index) >= splitThreshold) rightIndexes.add(index);
  });
  if (rightIndexes.size === series.length - 1) return rightIndexes;
  if (rightIndexes.size > 0) return rightIndexes;
  return new Set();
}

export function firstNonNullYear(years: readonly string[], values: readonly StressValue[]): string | null {
  const index = values.findIndex((value) => value !== null && value !== undefined);
  return index >= 0 ? years[index] : null;
}

export function lastNonNullYear(years: readonly string[], values: readonly StressValue[]): string | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null && values[index] !== undefined) return years[index];
  }
  return null;
}

export function formatValue(value: StressValue): string {
  if (value === null || value === undefined) return "";
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return rows.map((row) => row.map((cell) => {
    const text = cell === null || cell === undefined ? "" : String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n");
}
