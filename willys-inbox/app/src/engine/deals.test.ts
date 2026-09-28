import { describe, expect, it } from "vitest";
import { rankDeals, dealMatchesItem, percentOffFor } from "./deals.js";
import type { DealItem, ItemEntry } from "./model.js";

function deal(over: Partial<DealItem> = {}): DealItem {
  return {
    code: "101_ST",
    name: "Arla Mellanmjölk 1l",
    price: 10,
    comparePrice: 15,
    savings: 5,
    percentOff: 33,
    labels: [],
    outOfStock: false,
    ...over,
  };
}

describe("percentOffFor", () => {
  it("computes from savings", () => {
    const r = percentOffFor({ priceValue: 10, savingsAmount: "5,00 kr" });
    expect(r.compare).toBe(15);
    expect(r.percent).toBeCloseTo(33.33, 1);
  });
  it("zero when no savings", () => {
    expect(percentOffFor({ priceValue: 10, savingsAmount: null }).percent).toBe(0);
  });
});

describe("rankDeals", () => {
  it("sorts by percentOff and drops out of stock", () => {
    const items = [
      deal({ code: "1", percentOff: 10, outOfStock: true }),
      deal({ code: "2", percentOff: 25 }),
      deal({ code: "3", percentOff: 50, price: 0 }),
      deal({ code: "4", percentOff: 40 }),
    ];
    const out = rankDeals(items, 10);
    expect(out.map((d) => d.code)).toEqual(["4", "2"]);
  });
  it("caps at topN", () => {
    const items = Array.from({ length: 30 }, (_, i) => deal({ code: String(i), percentOff: i }));
    expect(rankDeals(items, 5)).toHaveLength(5);
  });
});

describe("dealMatchesItem", () => {
  const item = (over: Partial<ItemEntry> = {}): ItemEntry => ({
    key: "milk",
    name: "Mjölk",
    aisle: "mejeri",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  });
  it("matches on code", () => {
    expect(dealMatchesItem(deal({ code: "999_ST" }), item({ willysCode: "999_ST" }))).toBe(true);
  });
  it("matches tokens", () => {
    expect(dealMatchesItem(deal({ name: "Arla Ekologisk Mellanmjölk 1.5l" }), item({ name: "mjölk", searchQuery: "ekologisk mellanmjölk" }))).toBe(true);
  });
  it("rejects when a token is missing", () => {
    expect(dealMatchesItem(deal({ name: "Arla Standardmjölk" }), item({ searchQuery: "laktosfri mjölk" }))).toBe(false);
  });
});
