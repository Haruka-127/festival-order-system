import type { Database } from "bun:sqlite";
import { runSql } from "../db/database";

export type AuditEventInput = {
  orderId?: string | null;
  fulfillmentId?: string | null;
  displayNumber?: number | null;
  displayNumberDate?: string | null;
  locationName?: string | null;
  eventType: "order_created" | "order_cancelled" | "fulfillment_status" | "orders_cleaned";
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string | null;
  actorUsername?: string | null;
  details?: Record<string, unknown> | null;
};

export function recordAuditEvent(db: Database, event: AuditEventInput): void {
  const details = event.details ? JSON.stringify(event.details).slice(0, 2000) : null;
  runSql(
    db,
    `INSERT INTO audit_events (
       order_id, fulfillment_id, display_number, display_number_date, location_name,
       event_type, from_status, to_status, actor_user_id, actor_username, details
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    event.orderId ?? null,
    event.fulfillmentId ?? null,
    event.displayNumber ?? null,
    event.displayNumberDate ?? null,
    event.locationName ?? null,
    event.eventType,
    event.fromStatus ?? null,
    event.toStatus ?? null,
    event.actorUserId ?? null,
    event.actorUsername ?? null,
    details,
  );
}
