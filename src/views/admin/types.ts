export type AdminItem = { id: number; name: string; active: number; sold_out: number; sort_order: number; fulfillment_location_id?: number; location_name?: string; max_quantity_per_order?: number | null; daily_limit?: number | null };
export type AdminOrder = { id: string; display_number: number; status: string; created_at: string; items: string; token: string };
export type AdminUser = { id: string; username: string; role: string; staff_type?: string; fulfillment_location_id?: number | null; location_name?: string | null; created_at: string };
export type AdminLocation = { id: number; name: string; slug: string; active: number; sort_order: number; max_preparing_orders: number | null; max_preparing_units: number | null };
export type AdminOrderSettings = { ordering_enabled: number; order_open_time: string | null; order_close_time: string | null; daily_order_limit: number | null; max_items_per_order: number; max_total_quantity: number; completed_order_retention_days: number };
export type AdminEvent = { display_number: number | null; location_name: string | null; event_type: string; from_status: string | null; to_status: string | null; username: string | null; details: string | null; created_at: string };
import type { OrderArchive } from "../../services/order-archives";

export type AdminSection = "status" | "items" | "orders" | "users" | "settings" | "locations" | "history" | "advanced" | "archives";
export type AdminStatusSummary = {
  preparing: number;
  available: number;
  today_delivered_orders: number;
  today_units: number;
  total_delivered_orders: number;
  total_units: number;
};
export type AdminItemSales = { item_id: number; name: string; today_quantity: number; total_quantity: number };
export type AdminPagination = { page: number; totalPages: number; previousHref: string | null; nextHref: string | null };
export type ArchivePageData =
  | { kind: "index"; archives: OrderArchive[] }
  | { kind: "error"; message: string }
  | { kind: "orders"; archive: OrderArchive; orders: AdminOrder[]; soldUnits: number; sales: { name: string; quantity: number }[] }
  | { kind: "history"; archive: OrderArchive; events: AdminEvent[] }
  | { kind: "detail"; archive: OrderArchive;
      order: { id: string; display_number: number; display_number_date: string; status: string; created_at: string; updated_at: string; cancellation_reason: string | null; created_by_name: string | null };
      fulfillments: { location_name: string; status: string; ready_at: string | null; handed_over_at: string | null; items: { name: string; quantity: number }[] }[];
      events: AdminEvent[] };
export type AdminPageState = { orderFilter?: "active" | "completed" | "all"; pagination?: AdminPagination; archivePage?: ArchivePageData };
