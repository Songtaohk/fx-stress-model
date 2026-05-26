import { describe, expect, it } from "vitest";
// @ts-ignore script module is runtime-tested from the app test suite.
import { buildIngestionMatrix, refreshStartYear, writeDecision } from "../../scripts/ingestionPolicy.mjs";

describe("ingestion policy layer", () => {
  it("locks archived years and only allows writes from the auto-refresh start year", () => {
    const years = ["2024", "2025", "2026"];
    const values = [1, 2, null];
    expect(refreshStartYear({ metric: "cpiInflation", economy: "us", years, values, currentYear: 2026 })).toBe("2026");

    expect(writeDecision({
      metric: "cpiInflation",
      economy: "us",
      year: "2025",
      annualPoint: { value: 3, observations: 12 },
      years,
      values,
      currentYear: 2026,
      cadence: "high-frequency",
    }).allow).toBe(false);

    const decision = writeDecision({
      metric: "cpiInflation",
      economy: "us",
      year: "2026",
      annualPoint: { value: 2.4, observations: 3 },
      years,
      values,
      currentYear: 2026,
      cadence: "high-frequency",
    });
    expect(decision.allow).toBe(true);
    expect(decision.status).toBe("rolling-current-year");
  });

  it("rejects incomplete completed-year high-frequency observations", () => {
    const years = ["2024", "2025", "2026"];
    const values = [1, null, null];
    const tenMonthDecision = writeDecision({
      metric: "nominal10yYield",
      economy: "jp",
      year: "2025",
      annualPoint: { value: 1.1, observations: 10 },
      years,
      values,
      currentYear: 2026,
      cadence: "high-frequency",
    });
    expect(tenMonthDecision.allow).toBe(false);
    expect(tenMonthDecision.reason).toBe("insufficient-observations");

    const completeDecision = writeDecision({
      metric: "nominal10yYield",
      economy: "jp",
      year: "2025",
      annualPoint: { value: 1.2, observations: 12 },
      years,
      values,
      currentYear: 2026,
      cadence: "high-frequency",
    });
    expect(completeDecision.allow).toBe(true);
    expect(completeDecision.status).toBe("finalized-high-frequency-year");
  });

  it("produces a traceable matrix row for every metric/economy combination", () => {
    const years = ["2024", "2025", "2026"];
    const stressData = {
      cpiInflation: {
        eu: [1, 2, null],
        gb: [1, 2, null],
        us: [1, 2, null],
        cn: [1, 2, null],
        jp: [1, 2, null],
        tw: [1, 2, null],
        kr: [1, 2, null],
        in: [1, 2, null],
      },
    };
    const matrix = buildIngestionMatrix({ years, stressData, currentYear: 2026 });
    expect(matrix).toHaveLength(8);
    expect(matrix[0]).toMatchObject({ metric: "cpiInflation", archivedThrough: "2025", autoRefreshFrom: "2026" });
  });
});
