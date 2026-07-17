import { Elysia } from "elysia";
import { getDb, getOne } from "../db/database";
import { consumeFlashMessages, enqueueFlashMessage, type FlashKind, type FlashTargetTab } from "../services/flash";

export type UserInfo = {
  id: string;
  username: string;
  role: "admin" | "cashier" | "provider";
  fulfillmentLocationId: number | null;
  fulfillmentLocationName: string | null;
};

export function getUserBySessionId(sessionId: string): UserInfo | null {
  const db = getDb();
  const row = getOne<{
    id: string;
    username: string;
    role: string;
    staff_type: string;
    fulfillment_location_id: number | null;
    fulfillment_location_name: string | null;
  }>(
    db,
    `SELECT u.id, u.username, u.role, u.staff_type, u.fulfillment_location_id,
            l.name AS fulfillment_location_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN fulfillment_locations l ON l.id = u.fulfillment_location_id
     WHERE s.id = ? AND julianday(s.expires_at) > julianday('now')`,
    sessionId,
  );
  if (!row) return null;
  const role: UserInfo["role"] = row.role === "admin"
    ? "admin"
    : row.staff_type === "provider" ? "provider" : "cashier";
  return {
    id: row.id,
    username: row.username,
    role,
    fulfillmentLocationId: row.fulfillment_location_id,
    fulfillmentLocationName: row.fulfillment_location_name,
  };
}

export const authMiddleware = new Elysia()
  .derive({ as: "global" }, ({ cookie: { session_id }, request }) => {
    return {
      getUser: (): UserInfo | null => {
        const sid = session_id?.value;
        if (!sid) return null;

        return getUserBySessionId(String(sid));
      },
      addFlash: (kind: FlashKind, message: string, targetTab: FlashTargetTab | null = null): void => {
        const sid = session_id?.value;
        if (!sid) return;
        enqueueFlashMessage(String(sid), kind, message, targetTab);
      },
      consumeFlash: () => {
        const sid = session_id?.value;
        return sid ? consumeFlashMessages(String(sid)) : [];
      },
    };
  });
