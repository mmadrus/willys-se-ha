import type { ItemStats } from "./model.js";
import { startOfDay } from "../util.js";

export interface Prediction {
  key: string;
  intervalDays: number;
  confidence: number;
  nextDueMs: number;
  lastPurchaseMs: number;
  suggestionsCount: number;
}

const DAY = 86_400_000;

/** Collapse multiple purchases on the same day into one per-day entry. */
export function collapseToDays(purchases: number[]): number[] {
  const days = new Set(purchases.map((t) => startOfDay(t)));
  return [...days].sort((a, b) => a - b);
}

export function computeIntervals(purchases: number[]): number[] {
  const days = collapseToDays(purchases);
  const iv: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const d = (days[i] - days[i - 1]) / DAY;
    if (d > 0) iv.push(d);
  }
  return iv;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Robust spread: median absolute deviation / median (per day). */
export function spreadCoeff(xs: number[]): number {
  const med = median(xs);
  if (med === null || med <= 0) return 1;
  const devs = xs.map((x) => Math.abs(x - med));
  const mad = median(devs) ?? 0;
  return mad / med;
}

/**
 * Predict the next purchase day for an item.
 * Requires at least 2 distinct purchase days (1 interval).
 */
export function predict(stats: ItemStats): Prediction | null {
  const intervals = computeIntervals(stats.purchases);
  if (intervals.length === 0) return null;
  const days = collapseToDays(stats.purchases);
  const lastPurchaseMs = days[days.length - 1];

  let med = median(intervals) ?? 0;
  if (stats.manualIntervalDays && stats.manualIntervalDays > 0) {
    med = stats.manualIntervalDays;
  }
  if (med <= 0) med = intervals[intervals.length - 1];

  const cv = spreadCoeff(intervals);
  const n = days.length;

  let confidence = 0.35 + Math.min(0.4, (n - 1) * 0.09);
  confidence -= clampNum(cv, 0, 0.65) * 0.5;
  confidence -= Math.min(0.3, stats.dismissedCount * 0.08);
  confidence = clampNum(confidence, 0.05, 0.95);

  const nextDue = lastPurchaseMs + med * DAY;
  // Round to start of day for pleasant "due tomorrow" math
  return {
    key: stats.key,
    intervalDays: Math.round(med * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    nextDueMs: nextDue,
    lastPurchaseMs,
    suggestionsCount: n,
  };
}

function clampNum(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Suggestion window opens leadDays before due, and stays open 5 days after. */
export function suggestionWindow(
  pred: Prediction,
  nowMs: number,
  leadDays: number,
): { open: boolean; expired: boolean; daysRemaining: number } {
  const openFrom = pred.nextDueMs - leadDays * DAY;
  const closeTo = pred.nextDueMs + 5 * DAY;
  const open = nowMs >= openFrom;
  const expired = nowMs >= closeTo;
  const daysRemaining = Math.ceil((pred.nextDueMs - nowMs) / DAY);
  return { open, expired, daysRemaining: Number.isFinite(daysRemaining) ? daysRemaining : 0 };
}

/** Anti-annoyance: suppress for max(3d, 1.5 * interval) after a dismissal. */
export function isSuppressedByDismissal(stats: ItemStats, nowMs: number): boolean {
  if (!stats.lastDismissedAt) return false;
  const iv = medIntervalSafe(stats);
  const cooldown = Math.max(3, iv * 1.5) * DAY;
  return nowMs - stats.lastDismissedAt < cooldown;
}

function medIntervalSafe(stats: ItemStats): number {
  const iv = computeIntervals(stats.purchases);
  return median(iv) ?? 7;
}
