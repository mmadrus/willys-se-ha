import { readFileSync } from "node:fs";

export type AutoAddMode = "suggest" | "auto" | "off";

export interface AppConfig {
  willysUsername: string;
  willysPassword: string;
  storeId: string;            // empty = account home store
  timezone: string;
  autoAddMode: AutoAddMode;
  autoAddConfidence: number;
  notificationLeadDays: number;
  composeHour: number;        // local hour for scheduled compose
  composeLeadDays: number;
  composeDayOfWeek: number | null; // 0=Sun..6=Sat, null = any day
  dealsRefreshMinutes: number;
  notifyService: string;      // e.g. notify.mobile_app_pixel_9
  digestThreshold: number;
  watchlist: string[];        // item keys tracked for cheapest-unit-price
  todoEntity: string;         // HA to-do entity used as the shopping list
  dataDir: string;
  ingressPort: number;
  supervisorToken: string;
  supervisorUrl: string;
  eventsPollSeconds: number;
}

function readOptionsFile(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function str(opts: Record<string, unknown>, key: string, fallback = ""): string {
  const v = opts[key];
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return fallback;
}

function num(opts: Record<string, unknown>, key: string, fallback: number): number {
  const v = opts[key];
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

function strList(opts: Record<string, unknown>, key: string): string[] {
  const v = opts[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const optionsPath = env.WILLYS_OPTIONS ?? "/data/options.json";
  const opts = readOptionsFile(optionsPath);

  const dataDir = env.WILLYS_DATA_DIR ?? "./data";

  const autoModeRaw = str(opts, "auto_add_mode", "suggest");
  const autoAddMode: AutoAddMode =
    autoModeRaw === "auto" ? "auto" : autoModeRaw === "off" ? "off" : "suggest";

  return {
    willysUsername: str(opts, "username"),
    willysPassword: str(opts, "password"),
    storeId: str(opts, "store_id"),
    timezone: str(opts, "timezone", "Europe/Stockholm"),
    autoAddMode,
    autoAddConfidence: num(opts, "auto_add_confidence", 0.75),
    notificationLeadDays: num(opts, "notification_lead_days", 1),
    composeHour: num(opts, "compose_hour", 15),
    composeLeadDays: num(opts, "compose_lead_days", 2),
    composeDayOfWeek: (() => {
      const raw = str(opts, "compose_day_of_week", "");
      if (raw === "") return null;
      const n = Number.parseInt(raw, 10);
      return n >= 0 && n <= 6 ? n : null;
    })(),
    dealsRefreshMinutes: Math.max(60, num(opts, "deals_refresh_minutes", 240)),
    notifyService: str(opts, "notify_service"),
    digestThreshold: num(opts, "digest_threshold", 3),
    watchlist: strList(opts, "deals_watchlist"),
    todoEntity: str(opts, "todo_entity", "todo.shopping_list"),
    dataDir,
    ingressPort: num({ v: env.WILLYS_INGRESS_PORT }, "v", 8099),
    supervisorToken: env.SUPERVISOR_TOKEN ?? env.HASSIO_TOKEN ?? "",
    supervisorUrl: env.SUPERVISOR_URL ?? "http://supervisor",
    eventsPollSeconds: Math.max(5, num({ v: env.WILLYS_EVENTS_POLL }, "v", 20)),
  };
}
