import { describe, expect, it } from "vitest";
import { collapseToDays, computeIntervals, median, predict, spreadCoeff, suggestionWindow } from "./predictor.js";
import type { ItemStats } from "./model.js";

const DAY = 86_400_000;

function stats(purchases: number[], extra: Partial<ItemStats> = {}): ItemStats {
  return {
    key: "test",
    purchases,
    addedCount: purchases.length,
    dismissedCount: 0,
    mode: "suggest",
    ...extra,
  };
}

describe("collapseToDays", () => {
  it("collapses same-day purchases", () => {
    const t0 = Date.UTC(2026, 0, 1, 9);
    const out = collapseToDays([t0, t0 + 3600_000, t0 + DAY]);
    expect(out).toHaveLength(2);
  });
});

describe("computeIntervals", () => {
  it("computes day gaps", () => {
    const t0 = Date.UTC(2026, 0, 1);
    expect(computeIntervals([t0, t0 + 2 * DAY, t0 + 5 * DAY])).toEqual([2, 3]);
  });
});

describe("median/spread", () => {
  it("median of odd/even", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("spreadCoeff grows with variance", () => {
    expect(spreadCoeff([7, 7, 7, 7])).toBeLessThan(spreadCoeff([2, 12, 3, 20]));
  });
});

describe("predict", () => {
  // local midnights so startOfDay() (local) is a no-op
  const JAN1 = new Date(2026, 0, 1).getTime();

  it("returns null with <2 purchase days", () => {
    expect(predict(stats([Date.now()]))).toBeNull();
  });

  it("predicts a steady 7-day cycle with high confidence", () => {
    const purchases = [0, 1, 2, 3, 4, 5, 6].map((w) => JAN1 + w * 7 * DAY);
    const p = predict(stats(purchases));
    expect(p).not.toBeNull();
    expect(p!.intervalDays).toBe(7);
    expect(p!.confidence).toBeGreaterThanOrEqual(0.6);
    expect(p!.nextDueMs).toBe(JAN1 + 7 * 7 * DAY);
  });

  it("reduces confidence for irregular purchases", () => {
    const irr = [0, 2, 17, 4, 21, 5].map((d) => JAN1 + d * DAY);
    const steady = [0, 5, 10, 15, 20, 25].map((d) => JAN1 + d * DAY);
    const a = predict(stats(irr))!;
    const b = predict(stats(steady))!;
    expect(a.confidence).toBeLessThan(b.confidence);
  });

  it("dismissals lower confidence", () => {
    const purchases = [0, 7, 14, 21].map((d) => JAN1 + d * DAY);
    const clean = predict(stats(purchases))!;
    const dismissed = predict(stats(purchases, { dismissedCount: 3 }))!;
    expect(dismissed.confidence).toBeLessThan(clean.confidence);
  });

  it("manual interval overrides computed", () => {
    const purchases = [0, 10, 20].map((d) => JAN1 + d * DAY);
    const p = predict(stats(purchases, { manualIntervalDays: 3 }))!;
    expect(p.intervalDays).toBe(3);
    expect(p.nextDueMs).toBe(JAN1 + 23 * DAY);
  });
});

describe("suggestionWindow", () => {
  const t0 = Date.UTC(2026, 0, 10);
  const pred = {
    key: "x",
    intervalDays: 7,
    confidence: 0.7,
    nextDueMs: t0,
    lastPurchaseMs: t0 - 7 * DAY,
    suggestionsCount: 4,
  };
  it("opens leadDays before due", () => {
    expect(suggestionWindow(pred, t0 - 2 * DAY, 1).open).toBe(false);
    expect(suggestionWindow(pred, t0 - 0.5 * DAY, 1).open).toBe(true);
  });
  it("expires 5 days after due", () => {
    expect(suggestionWindow(pred, t0 + 6 * DAY, 1).expired).toBe(true);
    expect(suggestionWindow(pred, t0 + 4 * DAY, 1).expired).toBe(false);
  });
});
