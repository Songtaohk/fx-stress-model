import { describe, expect, it } from "vitest";
import { stressData, stressFxData, stressFxYears, stressLayers, stressPairGroups, stressPairLabels, stressYears, type StressMetricKey, type StressValue } from "../data/stressModel";
import { alignSeries, dominantSeriesIndex, firstNonNullYear, getLayerMetrics, lastNonNullYear, logSpreadSeries, pairDirectionLabel, splitRightAxisIndexes, splitRightAxisIndexesAnchoredLeft, toCsv, zScoreSeries } from "../lib/stressUtils";

const chartYears = [...stressYears];
const allPairs = Object.values(stressPairGroups).flat();

function groupedWindows(years: string[]) {
  const firstYear = Number(years[0]);
  const currentYear = Number(years[years.length - 1]);
  const windows: { start: number; end: number }[] = [];
  let end = currentYear;
  while (end - 10 > firstYear) {
    windows.push({ start: end - 10, end });
    end -= 10;
  }
  const remainder = { start: firstYear, end };
  if (windows.length > 0 && remainder.end - remainder.start + 1 < 5) {
    const last = windows[windows.length - 1];
    windows[windows.length - 1] = { start: remainder.start, end: last.end };
  } else {
    windows.push(remainder);
  }
  return windows;
}

function valuesForWindow(values: StressValue[], years: string[], window: { start: number; end: number }) {
  return values.filter((_, index) => Number(years[index]) >= window.start && Number(years[index]) <= window.end);
}

function meanMagnitude(values: readonly StressValue[]) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + Math.abs(value), 0) / numbers.length;
}

function rangeMagnitude(values: readonly StressValue[]) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length < 2) return 0;
  return Math.max(...numbers) - Math.min(...numbers);
}

function extent(values: readonly StressValue[]) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  return { min, max, mean, range: max - min };
}

function pairAxisDistance(anchorValues: readonly StressValue[], metricValues: readonly StressValue[]) {
  const anchor = extent(anchorValues);
  const metric = extent(metricValues);
  if (!anchor || !metric) return 1;
  const ratioDistance = (a: number, b: number) => {
    const larger = Math.max(a, b);
    const smaller = Math.min(a, b);
    if (larger === 0) return 1;
    return larger / Math.max(smaller, Number.EPSILON);
  };
  const combinedRange = Math.max(anchor.max, metric.max) - Math.min(anchor.min, metric.min);
  const ownRange = Math.max(anchor.range, metric.range);
  const rangeDistance = ownRange > 0 ? combinedRange / ownRange : Math.abs(anchor.mean - metric.mean) > 0 ? Number.POSITIVE_INFINITY : 1;
  const meanDistance = ratioDistance(Math.abs(anchor.mean), Math.abs(metric.mean));
  const scaleDistance = ratioDistance(Math.max(Math.abs(anchor.mean), anchor.range), Math.max(Math.abs(metric.mean), metric.range));
  return Math.max(rangeDistance, meanDistance, scaleDistance);
}

function ratioScore(values: readonly number[], indexes: readonly number[]) {
  const positives = indexes.map((index) => values[index]).filter((value) => value > 0);
  if (positives.length < 2) return 1;
  return Math.max(...positives) / Math.max(Math.min(...positives), Number.EPSILON);
}

function axisSplitScore(series: readonly (readonly StressValue[])[], rightIndexes: Set<number>) {
  const means = series.map(meanMagnitude);
  const ranges = series.map(rangeMagnitude);
  const left = series.map((_, index) => index).filter((index) => !rightIndexes.has(index));
  const right = series.map((_, index) => index).filter((index) => rightIndexes.has(index));
  return Math.max(ratioScore(means, left), ratioScore(ranges, left), ratioScore(means, right), ratioScore(ranges, right));
}

function usesLogSpread(metric: StressMetricKey) {
  return metric === "tfpCtfp" || metric === "ulcProxy";
}

function pairMetricValues(metric: StressMetricKey, pair: (typeof allPairs)[number]) {
  if (!usesLogSpread(metric)) return stressData[metric][stressPairLabels[pair].base].map((baseValue, index) => {
    const quoteValue = stressData[metric][stressPairLabels[pair].quote][index];
    if (baseValue === null || quoteValue === null) return null;
    return Number((baseValue - quoteValue).toFixed(4));
  });
  const { base, quote } = stressPairLabels[pair];
  return logSpreadSeries(stressData[metric][base], stressData[metric][quote]);
}

describe("stress utils", () => {
  it("uses RTFPNA for single productivity and CTFP for pair productivity", () => {
    expect(getLayerMetrics("productivity", "single")).toContain("tfpRtfpna");
    expect(getLayerMetrics("productivity", "single")).not.toContain("tfpCtfp");
    expect(getLayerMetrics("productivity", "pair")).toContain("tfpCtfp");
    expect(getLayerMetrics("productivity", "pair")).not.toContain("tfpRtfpna");
  });

  it("does not mix precomputed monetary Z-score into raw monetary charts", () => {
    expect(getLayerMetrics("monetary", "single")).toEqual(["realPolicyRate", "nominal10yYield", "cpiInflation"]);
    expect(getLayerMetrics("monetary", "pair")).toEqual(["realPolicyRate", "nominal10yYield", "cpiInflation"]);
  });

  it("keeps pair labels in base-minus-quote direction", () => {
    expect(pairDirectionLabel("usdjpy")).toBe("US - JP");
    expect(pairDirectionLabel("twdkrw")).toBe("TW - KR");
    expect(pairDirectionLabel("eurgbp")).toBe("EU - GB");
  });

  it("normalizes non-null values and preserves gaps", () => {
    const result = zScoreSeries([1, null, 2, 3]);
    expect(result[1]).toBeNull();
    expect(result[0]).toBeCloseTo(-1, 4);
    expect(result[2]).toBeCloseTo(0, 4);
    expect(result[3]).toBeCloseTo(1, 4);
  });

  it("computes log spreads for positive ratio-style pair metrics", () => {
    const result = logSpreadSeries([2, 4, null, 3, -1], [1, 2, 1, null, 1]);
    expect(result).toEqual([0.6931, 0.6931, null, null, null]);
    expect(zScoreSeries(result).filter((value) => value !== null)).toEqual([0, 0]);
  });

  it("detects a dominant raw series for split axes", () => {
    expect(dominantSeriesIndex([[0, 1, 2], [-100, 0, 100], [0, 1, null]])).toBe(1);
    expect(dominantSeriesIndex([[0, 1, 2], [0, 2, 4]])).toBeNull();
    expect(dominantSeriesIndex([[10, 11, 12], [1, 1.1, 0.9]])).toBe(0);
  });

  it("groups multiple large raw series onto the right axis", () => {
    const rightIndexes = splitRightAxisIndexes([[40, 70, 120], [50, 80, 100], [-5, 0, 8]]);
    expect([...rightIndexes]).toEqual([0, 1]);
    expect(splitRightAxisIndexes([[1, 2, 3], [2, 3, 4]]).size).toBe(0);
    expect(splitRightAxisIndexes([[0.16, 0.25, 0.37], [-0.31, -0.22, -0.15]]).size).toBe(0);
    expect([...splitRightAxisIndexes([[-0.7, -0.5, 0.04], [1.5, 1.7, 1.85]])]).toEqual([1]);
    expect([...splitRightAxisIndexes([[0.16, 0.25, 0.37], [-40, -10, 20]])]).toEqual([1]);
    expect([...splitRightAxisIndexes([[20, 31, 46], [-10, 0, 8], [-1, 1, 3]])]).toEqual([0]);
    expect([...splitRightAxisIndexes([[100, 101, 102], [90, 110, 130], [95, 96, 97]])]).toEqual([1]);
  });

  it("keeps the largest and smallest scales away from each other in every grouped 10-year single-economy raw chart", () => {
    const windows = groupedWindows(chartYears);
    for (const layer of Object.keys(stressLayers) as (keyof typeof stressLayers)[]) {
      const singleMetrics = getLayerMetrics(layer, "single");
      for (const economy of Object.keys(stressData.caGdp) as (keyof typeof stressData.caGdp)[]) {
        const allSeries = singleMetrics.map((metric) => [...stressData[metric][economy], null]);
        for (const window of windows) {
          const series = allSeries.map((values) => valuesForWindow(values, chartYears, window));
          const means = series.map(meanMagnitude);
          const ranges = series.map(rangeMagnitude);
          const scales = series.map((_, index) => Math.max(means[index], ranges[index]));
          const positive = scales.map((value, index) => ({ value, index })).filter(({ value }) => value > 0);
          const right = splitRightAxisIndexes(series);
          if (positive.length >= 2 && Math.max(...positive.map(({ value }) => value)) / Math.min(...positive.map(({ value }) => value)) >= 3) {
            const largest = positive.reduce((a, b) => (b.value > a.value ? b : a)).index;
            const smallest = positive.reduce((a, b) => (b.value < a.value ? b : a)).index;
            expect(right.has(largest)).not.toBe(right.has(smallest));
          }
        }
      }
    }
  });

  it("anchors FX on the left axis and moves distant pair metrics to the right axis", () => {
    expect([...splitRightAxisIndexesAnchoredLeft([[250, 300, 350], [-2, -3, -4], [-18, -20, -22], [260, 280, 340]], 0)]).toEqual([1, 2]);
    expect(splitRightAxisIndexesAnchoredLeft([[250, 300, 350], [240, 310, 360]], 0).size).toBe(0);
    expect([...splitRightAxisIndexesAnchoredLeft([[108, 130, 157], [-5, -7, -9], [-100, -135, -170], [-92, -130, -168]], 0)]).toEqual([1, 2, 3]);
    expect([...splitRightAxisIndexesAnchoredLeft([[168, 145, 128, 138, 145, 136, 126, 112, 103, 94, 109], [-13, -12, -12, -12, -14, -15, -15, -15, -14, -12, -14], [2, 2, 1, 1, 0.8, 0, -0.4, -0.8, -1.2, -1.8, -2.4]], 0)]).toEqual([1, 2]);
  });

  it("uses FX as the left-axis anchor and splits distant metrics in every grouped 10-year pair chart", () => {
    const windows = groupedWindows(chartYears);
    for (const layer of Object.keys(stressLayers) as (keyof typeof stressLayers)[]) {
      const pairMetrics = getLayerMetrics(layer, "pair");
      for (const pair of allPairs) {
        const alignedFx = alignSeries(stressFxYears, stressFxData[pair], chartYears);
        const allMetricSeries = pairMetrics.map((metric) => alignSeries(stressYears, pairMetricValues(metric, pair), chartYears));
        for (const window of windows) {
          const fx = valuesForWindow(alignedFx, chartYears, window);
          const metrics = allMetricSeries.map((values) => valuesForWindow(values, chartYears, window));
          const right = splitRightAxisIndexesAnchoredLeft([fx, ...metrics], 0);
          expect(right.has(0)).toBe(false);
          metrics.forEach((metricValues, index) => {
            if (pairAxisDistance(fx, metricValues) >= 3) expect(right.has(index + 1)).toBe(true);
          });
        }
      }
    }
  });

  it("reports first and last non-empty years", () => {
    expect(firstNonNullYear(["1999", "2000", "2001"], [null, 2, 3])).toBe("2000");
    expect(lastNonNullYear(["1999", "2000", "2001"], [1, null, null])).toBe("1999");
  });

  it("exports CSV with escaping", () => {
    expect(toCsv([["a,b", "c"], [1, null]])).toBe('"a,b",c\n1,');
  });
});
