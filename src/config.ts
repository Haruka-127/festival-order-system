import type { CookieOptions } from "elysia";

const cookieSecure = process.env.COOKIE_SECURE === undefined
  ? process.env.NODE_ENV === "production"
  : process.env.COOKIE_SECURE === "true";

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  host: process.env.HOST || "0.0.0.0",

  dataDir: process.env.DATA_DIR || "./data",
  dbPath: () => `${config.dataDir}/orders.db`,

  sessionSecret: process.env.SESSION_SECRET || "festival-secret-change-in-production",
  sessionMaxAge: 24 * 60 * 60 * 1000,

  displayNumberDigits: parseInt(process.env.DISPLAY_NUMBER_DIGITS || "3"),
  displayNumberPad: (n: number) => n.toString().padStart(parseInt(process.env.DISPLAY_NUMBER_DIGITS || "3"), "0"),

  baseUrl: process.env.BASE_URL || `http://localhost:${parseInt(process.env.PORT || "3000")}`,

  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",

  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60,
    secure: cookieSecure,
  } satisfies CookieOptions,
};
