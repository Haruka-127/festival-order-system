import { config, validateRuntimeConfig } from "./config";
import { getDb, closeDb, getOne, runSql } from "./db/database";
import { createApp } from "./app";

validateRuntimeConfig();

const app = createApp();

async function seedInitialData() {
  const db = getDb();
  const admin = getOne<{ id: string; password_hash: string }>(db, "SELECT id, password_hash FROM users WHERE username = ?", config.adminUsername);
  if (!admin) {
    if (process.env.NODE_ENV === "production" && (config.adminPassword.length < 12 || ["admin123", "your-admin-password"].includes(config.adminPassword))) {
      throw new Error("Refusing to create an administrator with a weak or default password. Set ADMIN_PASSWORD to at least 12 characters.");
    }
    const id = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(config.adminPassword);
    runSql(db, "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'admin')", id, config.adminUsername, passwordHash);
    console.log(`[INIT] Created admin user: ${config.adminUsername}`);
  } else if (process.env.NODE_ENV === "production") {
    for (const knownWeakPassword of ["admin123", "your-admin-password"]) {
      if (await Bun.password.verify(knownWeakPassword, admin.password_hash)) {
        throw new Error("The existing administrator still uses a known default password. Change it before starting in production.");
      }
    }
  }
}

await seedInitialData();

app.listen({
  port: config.port,
  hostname: config.host,
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", event: "shutdown", signal }));
  try { await app.stop(); } catch {}
  closeDb();
  process.exit(0);
}

process.once("SIGINT", () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });

console.log(`🚀 Server running at http://${config.host}:${config.port}`);
if (process.env.NODE_ENV === "production") {
  console.log(`   Admin user: ${config.adminUsername}`);
} else {
  console.log(`   Admin user: ${config.adminUsername}`);
}
console.log(`   Monitor: http://${config.host}:${config.port}/monitor`);
