import type { UserInfo } from "../../middleware/auth";
import type { FlashKind, FlashTargetTab } from "../../services/flash";
import { isPositiveInteger } from "../../security";

export const MAX_NAME_LENGTH = 100;
export const MAX_USERNAME_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 10;

type AddFlash = (kind: FlashKind, message: string, targetTab?: FlashTargetTab | null) => void;

const adminPaths: Record<FlashTargetTab, string> = {
  items: "/admin/items",
  orders: "/admin/orders",
  users: "/admin/users",
  settings: "/admin/settings",
  locations: "/admin/settings/locations",
  history: "/admin/settings/history",
};

export function redirectAdmin(addFlash?: AddFlash, kind?: FlashKind, message?: string, targetTab?: FlashTargetTab, redirectPath?: string): Response {
  if (addFlash && kind && message) addFlash(kind, message, targetTab ?? null);
  return new Response(null, { status: 303, headers: { Location: redirectPath ?? adminPaths[targetTab ?? "items"] } });
}

export function parseAdminId(value: string): number | null {
  return isPositiveInteger(value, 2_147_483_647) ? Number(value) : null;
}

export function parseSortOrder(value: unknown): number | null {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && Math.abs(parsed) <= 1_000_000 ? parsed : null;
}

export function requireAdmin(user: UserInfo | null, api = true): UserInfo | Response {
  if (!user) return api
    ? new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8" } })
    : new Response(null, { status: 302, headers: { Location: "/login" } });
  if (user.role !== "admin") return api
    ? new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8" } })
    : new Response("アクセス権限がありません", { status: 403 });
  return user;
}
