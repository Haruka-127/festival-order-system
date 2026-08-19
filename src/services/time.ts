import { config } from "../config";

export function utcNowIso(): string {
  return new Date().toISOString();
}

export function parseDatabaseDateTime(value: string | Date): Date {
  if (value instanceof Date) return value;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return new Date(normalized);
}

export function formatDateTime(value: string | Date): string {
  const date = parseDatabaseDateTime(value);
  if (Number.isNaN(date.getTime())) return "---";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
