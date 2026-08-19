import type { CookieOptions } from "elysia";

const cookieSecure = process.env.COOKIE_SECURE === undefined
  ? process.env.NODE_ENV === "production"
  : process.env.COOKIE_SECURE === "true";

const port = Number(process.env.PORT ?? "3000");
const displayNumberDigits = Number(process.env.DISPLAY_NUMBER_DIGITS ?? "3");
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, "");

export const config = {
  port,
  host: process.env.HOST || "0.0.0.0",

  dataDir: process.env.DATA_DIR || "./data",
  dbPath: () => `${config.dataDir}/orders.db`,

  sessionMaxAge: 24 * 60 * 60 * 1000,

  displayNumberDigits,
  displayNumberPad: (n: number) => n.toString().padStart(displayNumberDigits, "0"),
  timeZone: process.env.APP_TIME_ZONE || "Asia/Tokyo",

  baseUrl,
  publicOrigin: new URL(baseUrl).origin,

  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  trustProxy: process.env.TRUST_PROXY === "true",

  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60,
    secure: cookieSecure,
  } satisfies CookieOptions,
};

export function validateRuntimeConfig(): void {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error("PORT must be an integer from 1 to 65535.");
  if (!Number.isInteger(config.displayNumberDigits) || config.displayNumberDigits < 1 || config.displayNumberDigits > 12) throw new Error("DISPLAY_NUMBER_DIGITS must be an integer from 1 to 12.");
  try { new Intl.DateTimeFormat("ja-JP", { timeZone: config.timeZone }).format(new Date()); }
  catch { throw new Error("APP_TIME_ZONE must be a valid IANA time zone."); }
  const publicUrl = new URL(config.baseUrl);
  if (publicUrl.protocol !== "http:" && publicUrl.protocol !== "https:") throw new Error("BASE_URL must use http:// or https://.");
  if (publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || !["", "/"].includes(publicUrl.pathname)) {
    throw new Error("BASE_URL must be an origin only, without credentials, a path, query, or fragment.");
  }

  if (process.env.NODE_ENV !== "production") return;
  if (!config.cookieOptions.secure && process.env.ALLOW_INSECURE_HTTP !== "true") {
    throw new Error("Production requires secure cookies. Use HTTPS and COOKIE_SECURE=true, or explicitly set ALLOW_INSECURE_HTTP=true for an isolated trusted network.");
  }
  if (config.cookieOptions.secure && publicUrl.protocol !== "https:") {
    throw new Error("BASE_URL must use https:// when secure cookies are enabled.");
  }
}
