import { describe, expect, it } from "vitest";
import { stressData, stressFxData, stressFxYears, stressLayers, stressPairComparisons, stressPairGroups, stressPairLabels, stressYears } from "../data/stressModel";

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
    for (const metricData of Object.values(stressData)) for (const series of Object.values(metricData)) expect(series).toHaveLength(stressYears.length);
    for (const metricData of Object.values(stressPairComparisons)) for (const series of Object.values(metricData)) expect(series).toHaveLength(stressYears.length);
    for (const series of Object.values(stressFxData)) expect(series).toHaveLength(stressFxYears.length);
  });
});
