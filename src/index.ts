import { Elysia } from "elysia";
import { config } from "./config";
import { getDb, closeDb, getAll, getOne, runSql } from "./db/database";
import { wsManager } from "./services/websocket";
import { authRoutes } from "./routes/auth";
import { staffRoutes } from "./routes/staff";
import { adminRoutes } from "./routes/admin";
import { monitorRoutes } from "./routes/monitor";
import { customerRoutes } from "./routes/customer";

const app = new Elysia()
  .get("/", () => new Response(null, { status: 302, headers: { Location: "/login" } }))
  .use(authRoutes)
  .use(staffRoutes)
  .use(adminRoutes)
  .use(monitorRoutes)
  .use(customerRoutes)
  .ws("/ws/monitor", {
    open(ws) {
      wsManager.addMonitor(ws as any);
      const db = getDb();
      const numbers = getAll<{ display_number: number }>(
        db,
        "SELECT display_number FROM orders WHERE status = 'available' ORDER BY display_number ASC"
      ).map(r => r.display_number);
      ws.send(JSON.stringify({ type: "monitor_update", numbers }));
    },
    close(ws) {
      wsManager.remove(ws as any);
    },
  })
  .ws("/ws/order/:token", {
    open(ws) {
      const token = ws.data.params?.token;
      if (token) {
        wsManager.addOrderClient(token, ws as any);
        const db = getDb();
        const order = getOne<{ status: string }>(db, "SELECT status FROM orders WHERE token = ?", token);
        if (order) {
          ws.send(JSON.stringify({ type: "order_update", status: order.status }));
        }
      }
    },
    close(ws) {
      wsManager.remove(ws as any);
    },
  })
  .onError(({ code }) => {
    if (code === "NOT_FOUND") return new Response(null, { status: 404 });
    console.error(`[ERROR] code=${code}`);
    return new Response("サーバーエラーが発生しました", { status: 500 });
  });

async function seedInitialData() {
  const db = getDb();
  const admin = getOne<{ id: string }>(db, "SELECT id FROM users WHERE username = ?", config.adminUsername);
  if (!admin) {
    const id = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(config.adminPassword);
    runSql(db, "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'admin')", id, config.adminUsername, passwordHash);
    console.log(`[INIT] Created admin user: ${config.adminUsername}`);
  }

  const itemCount = getOne<{ cnt: number }>(db, "SELECT COUNT(*) as cnt FROM items");
  if ((itemCount?.cnt ?? 0) === 0) {
    const defaultItems = ["ラーメン", "やきそば", "たこ焼き", "フランクフルト", "焼き鳥", "わたあめ", "りんご飴", "コーラ", "オレンジジュース", "お茶"];
    const insert = db.prepare("INSERT INTO items (name, sort_order) VALUES (?, ?)");
    defaultItems.forEach((name, i) => insert.run(name, i));
    console.log(`[INIT] Created ${defaultItems.length} default items`);
  }
}

await seedInitialData();

app.listen({
  port: config.port,
  hostname: config.host,
});

process.on("SIGINT", () => {
  console.log("\n[SHUTDOWN] Closing database...");
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[SHUTDOWN] Closing database...");
  closeDb();
  process.exit(0);
});

console.log(`🚀 Server running at http://${config.host}:${config.port}`);
if (process.env.NODE_ENV === "production") {
  console.log(`   Admin user: ${config.adminUsername}`);
} else {
  console.log(`   Admin login: ${config.adminUsername} / ${config.adminPassword}`);
}
console.log(`   Monitor: http://${config.host}:${config.port}/monitor`);
