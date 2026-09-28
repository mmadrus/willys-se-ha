export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

let threshold: number = LEVELS.info;

export function setLogLevel(level: LogLevel): void {
  threshold = LEVELS[level];
}

function fmt(msg: unknown): string {
  if (typeof msg === "string") return msg;
  try {
    return JSON.stringify(msg);
  } catch {
    return String(msg);
  }
}

function emit(level: LogLevel, prefix: string, msg: unknown, extra?: unknown): void {
  if (LEVELS[level] < threshold) return;
  const line = `[${new Date().toISOString()}] ${prefix}: ${fmt(msg)}`;
  const out = extra === undefined ? line : `${line} ${fmt(extra)}`;
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const log = {
  trace: (msg: unknown, extra?: unknown) => emit("trace", "TRACE", msg, extra),
  debug: (msg: unknown, extra?: unknown) => emit("debug", "DEBUG", msg, extra),
  info: (msg: unknown, extra?: unknown) => emit("info", "INFO", msg, extra),
  warn: (msg: unknown, extra?: unknown) => emit("warn", "WARN", msg, extra),
  error: (msg: unknown, extra?: unknown) => emit("error", "ERROR", msg, extra),
  child(scope: string) {
    return {
      trace: (msg: unknown, extra?: unknown) => emit("trace", scope, msg, extra),
      debug: (msg: unknown, extra?: unknown) => emit("debug", scope, msg, extra),
      info: (msg: unknown, extra?: unknown) => emit("info", scope, msg, extra),
      warn: (msg: unknown, extra?: unknown) => emit("warn", scope, msg, extra),
      error: (msg: unknown, extra?: unknown) => emit("error", scope, msg, extra),
    };
  },
};
