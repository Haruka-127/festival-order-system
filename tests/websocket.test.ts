import { expect, test } from "bun:test";
import { WebSocketManager } from "../src/services/websocket";

test("failed WebSocket clients are logged and removed from later broadcasts", () => {
  const manager = new WebSocketManager();
  let sendCount = 0;
  const client = {
    readyState: 1,
    send() { sendCount += 1; throw new Error("disconnected"); },
  } as any;
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = message => warnings.push(String(message));
  try {
    manager.addMonitor(client);
    manager.broadcastToMonitor({ locations: [] });
    manager.broadcastToMonitor({ locations: [] });
  } finally {
    console.warn = originalWarn;
  }
  expect(sendCount).toBe(1);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain('"event":"websocket_send_failed"');
  expect(warnings[0]).not.toContain("token");
});
