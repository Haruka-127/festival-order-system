import { getAll, getDb, runSql } from "../db/database";

export type FlashKind = "success" | "error";
export type FlashTargetTab = "items" | "orders" | "users" | "locations" | "history" | "settings";

export type FlashMessage = {
  kind: FlashKind;
  message: string;
  targetTab: FlashTargetTab | null;
};

export function enqueueFlashMessage(
  sessionId: string,
  kind: FlashKind,
  message: string,
  targetTab: FlashTargetTab | null = null,
): void {
  if (!sessionId || !message || message.length > 500) throw new Error("Invalid flash message");
  const db = getDb();
  db.transaction(() => {
    runSql(db, "DELETE FROM session_flash_messages WHERE created_at < datetime('now', '-1 day')");
    runSql(
      db,
      "INSERT INTO session_flash_messages (session_id, kind, message, target_tab) VALUES (?, ?, ?, ?)",
      sessionId,
      kind,
      message,
      targetTab,
    );
    runSql(
      db,
      `DELETE FROM session_flash_messages
       WHERE session_id = ?
         AND id NOT IN (
           SELECT id FROM session_flash_messages
           WHERE session_id = ? ORDER BY id DESC LIMIT 10
         )`,
      sessionId,
      sessionId,
    );
  })();
}

export function consumeFlashMessages(sessionId: string): FlashMessage[] {
  if (!sessionId) return [];
  const db = getDb();
  return db.transaction(() => {
    const messages = getAll<{ kind: FlashKind; message: string; target_tab: FlashTargetTab | null }>(
      db,
      "SELECT kind, message, target_tab FROM session_flash_messages WHERE session_id = ? ORDER BY id ASC",
      sessionId,
    ).map(row => ({ kind: row.kind, message: row.message, targetTab: row.target_tab }));
    runSql(db, "DELETE FROM session_flash_messages WHERE session_id = ?", sessionId);
    return messages;
  })();
}
