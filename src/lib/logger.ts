/**
 * Structured logger — replaces raw console.* calls per CLAUDE.md.
 * Emits single-line JSON so log output stays queryable in Vercel/any log
 * aggregator. Use `scope` to namespace a subsystem, e.g. logger.child("stripe webhook").
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function emit(level: LogLevel, scope: string | undefined, message: string, fields?: LogFields) {
  const entry = {
    level,
    time: new Date().toISOString(),
    scope,
    message,
    ...(fields ? serializeFields(fields) : {}),
  };
  const line = JSON.stringify(entry);
  switch (level) {
    case "error":
      // eslint-disable-next-line no-console
      console.error(line);
      reportToSentry(scope, message, fields);
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(line);
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(line);
  }
}

// Deferred require — avoids pulling @sentry/nextjs into every bundle that
// only needs console output (e.g. scripts run outside the Next.js runtime).
function reportToSentry(scope: string | undefined, message: string, fields?: LogFields) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as typeof import("@sentry/nextjs");
    const errorField = fields && Object.values(fields).find((v) => v instanceof Error);
    Sentry.withScope((s) => {
      s.setTag("logger_scope", scope ?? "unscoped");
      if (fields) s.setContext("log_fields", serializeFields(fields));
      Sentry.captureException(errorField ?? new Error(message));
    });
  } catch {
    // Sentry not configured/available (e.g. local script) — console output above still happened.
  }
}

function serializeFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value;
  }
  return out;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(scope: string): Logger;
}

function createLogger(scope?: string): Logger {
  return {
    debug: (message, fields) => emit("debug", scope, message, fields),
    info: (message, fields) => emit("info", scope, message, fields),
    warn: (message, fields) => emit("warn", scope, message, fields),
    error: (message, fields) => emit("error", scope, message, fields),
    child: (childScope) => createLogger(scope ? `${scope}:${childScope}` : childScope),
  };
}

export const logger = createLogger();
