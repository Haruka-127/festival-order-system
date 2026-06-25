import { Elysia } from "elysia";
import { getDb, getOne } from "../db/database";

export type UserInfo = {
  id: string;
  username: string;
  role: "admin" | "staff";
};

export const authMiddleware = new Elysia()
  .derive({ as: "global" }, ({ cookie: { session_id }, request }) => {
    return {
      getUser: (): UserInfo | null => {
        const sid = session_id?.value;
        if (!sid) return null;

        const db = getDb();
        const row = getOne<{ id: string; username: string; role: string }>(
          db,
          `SELECT u.id, u.username, u.role
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.id = ? AND julianday(s.expires_at) > julianday('now')`,
          String(sid)
        );

        if (!row) return null;
        return { id: row.id, username: row.username, role: row.role as "admin" | "staff" };
      },
    };
  });
