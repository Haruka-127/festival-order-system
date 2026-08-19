export type OrderStatus = "preparing" | "available" | "delivered" | "cancelled";
export type FulfillmentStatus = "preparing" | "ready" | "handed_over" | "cancelled";

export type LineItemView = { name: string; quantity: number };

export type FulfillmentView = {
  id: string;
  location_name: string;
  status: FulfillmentStatus;
  items: LineItemView[];
};

export type CashierOrder = {
  id: string;
  display_number: number;
  display_number_date?: string;
  status: OrderStatus;
  created_at: string;
  fulfillments?: FulfillmentView[];
  items?: LineItemView[];
};

export type ProviderTask = {
  id: string;
  display_number: number;
  display_number_date: string;
  status: FulfillmentStatus;
  created_at: string;
  handed_over_at?: string | null;
  items: LineItemView[];
};
