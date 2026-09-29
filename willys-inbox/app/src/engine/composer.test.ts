import { describe, expect, it } from "vitest";
import { composeRun, hasPendingOnList, sortEntries, type TodoItemLite } from "./composer.js";
import { DEFAULT_AISLES } from "./aisles.js";
import { emptyState, type AppState, type DealItem } from "./model.js";

const DAY = 86_400_000;

function baseState(): AppState {
  const s = emptyState();
  DEFAULT_AISLES.forEach((a, i) => s.aisles.push({ ...a, order: i }));
  s.items["mjolk"] = { key: "mjolk", name: "Mjölk", aisle: "mejeri", createdAt: 0, updatedAt: 0 };
  s.items["brod"] = { key: "brod", name: "Bröd", aisle: "brod", createdAt: 0, updatedAt: 0 };
  s.items["banan"] = { key: "banan", name: "Bananer", aisle: "gront", createdAt: 0, updatedAt: 0 };
  return s;
}

const opts = {
  autoMode: "suggest" as const,
  autoConfidence: 0.75,
  notificationLeadDays: 1,
  includeDeals: true,
};

describe("hasPendingOnList", () => {
  const todos: TodoItemLite[] = [
    { uid: "1", summary: "Mjölk", status: "needs_action" },
    { uid: "2", summary: "Kaffe", status: "completed" },
  ];
  it("finds pending match", () => {
    expect(hasPendingOnList(todos, { key: "mjolk", name: "mjölk" })).toBe(true);
  });
  it("ignores completed", () => {
    expect(hasPendingOnList(todos, { key: "kaffe", name: "kaffe" })).toBe(false);
  });
});

describe("sortEntries", () => {
  it("orders by aisle order", () => {
    const s = baseState();
    const out = sortEntries(s, [
      { key: "m", name: "Mjölk", qty: 1, reason: "staple", aisle: "mejeri" },
      { key: "b", name: "Bananer", qty: 1, reason: "staple", aisle: "gront" },
      { key: "x", name: "X", qty: 1, reason: "staple", aisle: "unknown-aisle" },
    ]);
    expect(out.map((e) => e.name)).toEqual(["Bananer", "Mjölk", "X"]);
  });
});

describe("composeRun", () => {
  it("adds active staples in aisle order", () => {
    const s = baseState();
    s.staples["mjolk"] = { key: "mjolk", active: true, qty: 2 };
    s.staples["banan"] = { key: "banan", active: true, qty: 1 };
    const res = composeRun(s, [], opts);
    expect(res.listEntries.map((e) => e.key)).toEqual(["banan", "mjolk"]);
    expect(res.listEntries[1].qty).toBe(2);
  });

  it("skips staples already pending on list", () => {
    const s = baseState();
    s.staples["mjolk"] = { key: "mjolk", active: true, qty: 1 };
    const todos: TodoItemLite[] = [{ uid: "1", summary: "Mjölk", status: "needs_action" }];
    const res = composeRun(s, todos, opts);
    expect(res.listEntries).toHaveLength(0);
  });

  it("suggests due items when below auto confidence", () => {
    const s = baseState();
    const now = Date.now();
    // bought 14 and 8 days ago (6-day cycle) -> due 2 days ago, window open
    s.stats["mjolk"] = {
      key: "mjolk",
      purchases: [now - 14 * DAY, now - 8 * DAY],
      addedCount: 2,
      dismissedCount: 0,
      mode: "suggest",
    };
    const res = composeRun(s, [], opts);
    expect(res.listEntries).toHaveLength(0);
    expect(res.suggestions).toHaveLength(1);
    expect(res.suggestions[0].key).toBe("mjolk");
    expect(res.suggestions[0].reason).toBe("due");
  });

  it("auto-adds confident due items in auto mode", () => {
    const s = baseState();
    const now = Date.now();
    // steady weekly cycle, last purchase 7 days ago -> due now
    s.stats["mjolk"] = {
      key: "mjolk",
      purchases: [42, 35, 28, 21, 14, 7].map((d) => now - d * DAY),
      addedCount: 6,
      dismissedCount: 0,
      mode: "suggest",
    };
    const res = composeRun(s, [], { ...opts, autoMode: "auto" });
    expect(res.listEntries.map((e) => e.key)).toContain("mjolk");
  });

  it("respects per-item never mode", () => {
    const s = baseState();
    const now = Date.now();
    s.stats["mjolk"] = {
      key: "mjolk",
      purchases: [42, 35, 28, 21, 14, 7].map((d) => now - d * DAY),
      addedCount: 6,
      dismissedCount: 0,
      mode: "never",
    };
    const res = composeRun(s, [], { ...opts, autoMode: "auto" });
    expect(res.listEntries).toHaveLength(0);
    expect(res.suggestions).toHaveLength(0);
  });

  it("creates deal suggestions from watchlist", () => {
    const s = baseState();
    s.watchlist["mjolk"] = { key: "mjolk" };
    const dealItem: DealItem = {
      code: "123_ST",
      name: "Arla Mjölk 1l",
      price: 9,
      comparePrice: 14,
      savings: 5,
      percentOff: 35,
      labels: [],
      outOfStock: false,
    };
    s.dealCache = { fetchedAt: Date.now(), storeId: "2110", items: [dealItem] };
    const res = composeRun(s, [], opts);
    expect(res.dealHits).toHaveLength(1);
    expect(res.suggestions.some((x) => x.reason === "deal")).toBe(true);
    expect(res.listEntries.some((e) => e.reason === "deal")).toBe(false);
  });

  it("puts deal hits on the list in dealMode add", () => {
    const s = baseState();
    s.watchlist["mjolk"] = { key: "mjolk" };
    s.dealCache = {
      fetchedAt: Date.now(),
      storeId: "2110",
      items: [{
        code: "123_ST",
        name: "Arla Mjölk 1l",
        price: 9,
        comparePrice: 14,
        savings: 5,
        percentOff: 35,
        labels: [],
        outOfStock: false,
      }],
    };
    const res = composeRun(s, [], { ...opts, dealMode: "add" });
    const dealEntry = res.listEntries.find((e) => e.reason === "deal");
    expect(dealEntry?.key).toBe("mjolk");
    expect(res.suggestions.some((x) => x.reason === "deal")).toBe(false);
  });
});
