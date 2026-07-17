import type { ServerWebSocket } from "bun";

type WsData = { type: string };

class WebSocketManager {
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

  broadcastToMonitor(data: object) {
    const msg = JSON.stringify({ type: "monitor_update", ...data });
    for (const ws of this.monitorClients) {
      try {
        if (ws.readyState === 1) ws.send(msg);
      } catch {}
    }
  }

  broadcastToOrder(token: string, data: object) {
    const msg = JSON.stringify({ type: "order_update", ...data });
    const clients = this.orderClients.get(token);
    if (clients) {
      for (const ws of clients) {
        try {
          if (ws.readyState === 1) ws.send(msg);
        } catch {}
      }
    }
  }

  broadcastToProvider(locationId: number, data: object) {
    const msg = JSON.stringify({ type: "provider_update", ...data });
    const clients = this.providerClients.get(locationId);
    if (!clients) return;
    for (const ws of clients) {
      try {
        if (ws.readyState === 1) ws.send(msg);
      } catch {}
    }
  }
}

export const wsManager = new WebSocketManager();
