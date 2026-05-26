import { describe, expect, it } from "vitest";
import { stressAutoUpdatePolicy, stressData, stressDataLastUpdated, stressFxData, stressFxYears, stressLayers, stressPairComparisons, stressPairGroups, stressPairLabels, stressPreviewData, stressYears } from "../data/stressModel";

describe("FX stress model data", () => {
  it("has six layers and the requested currency-pair order", () => {
    expect(Object.keys(stressLayers)).toHaveLength(6);
    expect(stressPairGroups.eur[0]).toBe("eurgbp");
    expect(stressPairGroups.usd).toEqual(["usdcny", "usdjpy", "usdtwd", "usdkrw", "usdinr"]);
    expect(stressPairGroups.twd).toEqual(["twdkrw", "twdinr"]);
  });

  it("keeps monetary definitions consistent with headline-CPI real policy rate", () => {
    expect(Object.hasOwn(stressData, "nominal10yYield")).toBe(true);
    expect(Object.hasOwn(stressData, "realPolicyRate")).toBe(true);
    expect(Object.hasOwn(stressData, "realPolicyRateZ")).toBe(true);
    expect(Object.hasOwn(stressData, "real10yYield")).toBe(false);
    expect(Object.hasOwn(stressData, "coreCpiInflation")).toBe(false);
  });

  it("includes CTFP USA=1 for productivity pair comparisons", () => {
    expect(stressData.tfpCtfp.us.some((value) => value !== null)).toBe(true);
    expect(stressPairComparisons.tfpCtfp.usdjpy.some((value) => value !== null)).toBe(true);
  });

  it("computes pair comparisons in the same base-minus-quote direction as FX quotes", () => {
    const index = stressData.realPolicyRateZ.us.findIndex((value, itemIndex) => value !== null && stressData.realPolicyRateZ.jp[itemIndex] !== null);
    expect(stressPairLabels.usdjpy.base).toBe("us");
    expect(stressPairLabels.usdjpy.quote).toBe("jp");
    expect(stressPairComparisons.realPolicyRateZ.usdjpy[index]).toBe(Number((stressData.realPolicyRateZ.us[index]! - stressData.realPolicyRateZ.jp[index]!).toFixed(4)));
  });

  it("keeps generated series aligned to the declared year ranges", () => {
    expect(new Set(stressYears).size).toBe(stressYears.length);
    expect(new Set(stressFxYears).size).toBe(stressFxYears.length);
    for (const metricData of Object.values(stressData)) for (const series of Object.values(metricData)) expect(series).toHaveLength(stressYears.length);
    for (const metricData of Object.values(stressPairComparisons)) for (const series of Object.values(metricData)) expect(series).toHaveLength(stressYears.length);
    for (const series of Object.values(stressFxData)) expect(series).toHaveLength(stressFxYears.length);
  });

  it("publishes a day-level update stamp and daily refresh policy", () => {
    expect(stressDataLastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stressAutoUpdatePolicy.macro.note).toContain("checked daily");
  });

  it("keeps provisional observations separate from historical data", () => {
    expect(Array.isArray(stressPreviewData)).toBe(true);
  });

  it("exposes confirmed 2025 updates to chart source data and pair spreads", () => {
    const yearIndex = stressYears.indexOf("2025");
    expect(yearIndex).toBeGreaterThanOrEqual(0);
    expect(stressData.fdiGdp.in[yearIndex]).toBe(-0.0868);
    expect(stressData.portfolioGdp.in[yearIndex]).toBe(0.2604);
    expect(stressData.externalDebtGdp.us[yearIndex]).toBe(95.7135);
    expect(stressData.externalDebtGdp.jp[yearIndex]).toBe(104.7017);
    expect(stressPairComparisons.fdiGdp.cnyinr[yearIndex]).toBe(0.4802);
    expect(stressPairComparisons.portfolioGdp.cnyinr[yearIndex]).toBe(1.9081);
    expect(stressPairComparisons.externalDebtGdp.usdjpy[yearIndex]).toBe(-8.9882);
  });
});
