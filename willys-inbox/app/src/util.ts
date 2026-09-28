export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function daysBetween(fromMs: number, toMs: number): number {
  return (toMs - fromMs) / 86_400_000;
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function stableHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Normalize a free-text item name into a stable item key. */
export function normalizeItem(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKC")
    .replace(/å|ä|æ/g, "a")
    .replace(/ö|ø/g, "o")
    .replace(/é|è/g, "e")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Parse "2,50 kr" / "2.5kr" / "2 450,10 kr" into 2.5 / 2450.1. */
export function parseMoney(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.-]/g, "")
    .trim();
  if (!cleaned) return null;
  // Swedish format uses comma as decimal separator
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Retry an async fn with capped exponential backoff. */
export async function retry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number; factor?: number; onFail?: (e: unknown, attempt: number) => void } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseMs ?? 1000;
  const factor = opts.factor ?? 3;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      opts.onFail?.(e, i + 1);
      if (i < attempts - 1) {
        await sleep(base * Math.pow(factor, i) + Math.random() * 500);
      }
    }
  }
  throw last;
}

/** Fetch that never hangs: timeout via AbortController. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
