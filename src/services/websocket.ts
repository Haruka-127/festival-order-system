import type { ServerWebSocket } from "bun";

type WsData = { type: string };

export class WebSocketManager {
  private monitorClients = new Set<ServerWebSocket<WsData>>();
  private orderClients = new Map<string, Set<ServerWebSocket<WsData>>>();
  private providerClients = new Map<number, Set<ServerWebSocket<WsData>>>();

  addMonitor(ws: ServerWebSocket<WsData>) {
    this.monitorClients.add(ws);
  }

  addOrderClient(token: string, ws: ServerWebSocket<WsData>) {
    if (!this.orderClients.has(token)) {
      this.orderClients.set(token, new Set());
    }
    this.orderClients.get(token)!.add(ws);
  }

  addProviderClient(locationId: number, ws: ServerWebSocket<WsData>) {
    if (!this.providerClients.has(locationId)) this.providerClients.set(locationId, new Set());
    this.providerClients.get(locationId)!.add(ws);
  }

  remove(ws: ServerWebSocket<WsData>) {
    this.monitorClients.delete(ws);
    for (const [, clients] of this.orderClients) {
      clients.delete(ws);
    }
    for (const [, clients] of this.providerClients) clients.delete(ws);
    // Clean up empty sets
    for (const [token, clients] of this.orderClients) {
      if (clients.size === 0) this.orderClients.delete(token);
    }
    for (const [locationId, clients] of this.providerClients) {
      if (clients.size === 0) this.providerClients.delete(locationId);
    }
  }

  private send(clients: Iterable<ServerWebSocket<WsData>>, message: string, channel: "monitor" | "order" | "provider"): void {
    for (const ws of clients) {
      if (ws.readyState >= 2) {
        this.remove(ws);
        continue;
      }
      if (ws.readyState !== 1) continue;
      try {
        ws.send(message);
      } catch (error) {
        this.remove(ws);
        console.warn(JSON.stringify({
          level: "warn",
          event: "websocket_send_failed",
          channel,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }
  }

  broadcastToMonitor(data: object) {
    const msg = JSON.stringify({ type: "monitor_update", ...data });
    this.send(this.monitorClients, msg, "monitor");
  }

  broadcastToOrder(token: string, data: object) {
    const msg = JSON.stringify({ type: "order_update", ...data });
    const clients = this.orderClients.get(token);
    if (clients) this.send(clients, msg, "order");
  }

  broadcastToProvider(locationId: number, data: object) {
    const msg = JSON.stringify({ type: "provider_update", ...data });
    const clients = this.providerClients.get(locationId);
    if (!clients) return;
    this.send(clients, msg, "provider");
  }
}

export const wsManager = new WebSocketManager();
