import type { Database } from "bun:sqlite";

export function initializeDatabaseSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'staff')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_flash_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('success', 'error')),
      message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 500),
      target_tab TEXT CHECK(target_tab IS NULL OR target_tab IN ('items', 'orders', 'users', 'locations', 'history', 'settings')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sold_out INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      display_number INTEGER NOT NULL,
      display_number_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing', 'available', 'delivered', 'cancelled')),
      token TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS number_sequences (
      display_number_date TEXT PRIMARY KEY,
      next_number INTEGER NOT NULL DEFAULT 1 CHECK(next_number >= 1),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      item_id INTEGER NOT NULL REFERENCES items(id),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      item_name TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(display_number_date);
    CREATE INDEX IF NOT EXISTS idx_orders_status_updated ON orders(status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_orders_token ON orders(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_session_flash_messages_session
      ON session_flash_messages(session_id, id);
  `);

  migrateMultiLocationSchema(db);

  db.exec(`
    INSERT INTO number_sequences (display_number_date, next_number, updated_at)
    SELECT display_number_date, MAX(display_number) + 1, datetime('now')
    FROM orders
    GROUP BY display_number_date
    ON CONFLICT(display_number_date) DO NOTHING;
  `);
}
function hasColumn(db: Database, table: string, column: string): boolean {
  const columns = db.prepare<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  return columns.some(row => row.name === column);
}

function migrateMultiLocationSchema(db: Database): void {
  const schemaVersion = db.prepare<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;
  db.exec(`
    CREATE TABLE IF NOT EXISTS fulfillment_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      max_preparing_orders INTEGER CHECK(max_preparing_orders IS NULL OR max_preparing_orders > 0),
      max_preparing_units INTEGER CHECK(max_preparing_units IS NULL OR max_preparing_units > 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO fulfillment_locations (id, name, slug, sort_order)
    VALUES (1, '既定提供場所', 'default', 0);
  `);

  if (!hasColumn(db, "users", "staff_type")) {
    db.exec("ALTER TABLE users ADD COLUMN staff_type TEXT NOT NULL DEFAULT 'cashier' CHECK(staff_type IN ('cashier', 'provider'));");
  }
  if (!hasColumn(db, "users", "fulfillment_location_id")) {
    db.exec("ALTER TABLE users ADD COLUMN fulfillment_location_id INTEGER REFERENCES fulfillment_locations(id);");
  }
  if (!hasColumn(db, "items", "fulfillment_location_id")) {
    db.exec("ALTER TABLE items ADD COLUMN fulfillment_location_id INTEGER REFERENCES fulfillment_locations(id);");
  }
  if (!hasColumn(db, "items", "max_quantity_per_order")) {
    db.exec("ALTER TABLE items ADD COLUMN max_quantity_per_order INTEGER CHECK(max_quantity_per_order IS NULL OR max_quantity_per_order > 0);");
  }
  if (!hasColumn(db, "items", "daily_limit")) {
    db.exec("ALTER TABLE items ADD COLUMN daily_limit INTEGER CHECK(daily_limit IS NULL OR daily_limit > 0);");
  }
  if (!hasColumn(db, "orders", "client_request_id")) {
    db.exec("ALTER TABLE orders ADD COLUMN client_request_id TEXT;");
  }
  if (!hasColumn(db, "orders", "created_by")) {
    db.exec("ALTER TABLE orders ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL;");
  }
  if (!hasColumn(db, "orders", "cancelled_by")) {
    db.exec("ALTER TABLE orders ADD COLUMN cancelled_by TEXT REFERENCES users(id) ON DELETE SET NULL;");
  }
  if (!hasColumn(db, "orders", "cancellation_reason")) {
    db.exec("ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;");
  }
  if (!hasColumn(db, "orders", "cancelled_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN cancelled_at TEXT;");
  }
  if (!hasColumn(db, "order_items", "fulfillment_id")) {
    db.exec("ALTER TABLE order_items ADD COLUMN fulfillment_id TEXT;");
  }

  db.exec(`
    UPDATE items SET fulfillment_location_id = 1 WHERE fulfillment_location_id IS NULL;

    CREATE TABLE IF NOT EXISTS order_fulfillments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES fulfillment_locations(id),
      status TEXT NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing', 'ready', 'handed_over', 'cancelled')),
      ready_at TEXT,
      handed_over_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(order_id, location_id)
    );

    CREATE TABLE IF NOT EXISTS fulfillment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fulfillment_id TEXT NOT NULL REFERENCES order_fulfillments(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_item_usage (
      usage_date TEXT NOT NULL,
      item_id INTEGER NOT NULL REFERENCES items(id),
      reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK(reserved_quantity >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(usage_date, item_id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      ordering_enabled INTEGER NOT NULL DEFAULT 1 CHECK(ordering_enabled IN (0, 1)),
      order_open_time TEXT,
      order_close_time TEXT,
      daily_order_limit INTEGER CHECK(daily_order_limit IS NULL OR daily_order_limit > 0),
      max_items_per_order INTEGER NOT NULL DEFAULT 50 CHECK(max_items_per_order > 0),
      max_total_quantity INTEGER NOT NULL DEFAULT 500 CHECK(max_total_quantity > 0),
      completed_order_retention_days INTEGER NOT NULL DEFAULT 7 CHECK(completed_order_retention_days BETWEEN 1 AND 3650),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT,
      fulfillment_id TEXT,
      display_number INTEGER,
      display_number_date TEXT,
      location_name TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN ('order_created', 'order_cancelled', 'fulfillment_status', 'orders_cleaned', 'admin_action')),
      from_status TEXT,
      to_status TEXT,
      actor_user_id TEXT,
      actor_username TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    INSERT OR IGNORE INTO app_settings (id) VALUES (1);

    DROP INDEX IF EXISTS idx_orders_client_request_id;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_creator_request_id
      ON orders(created_by, client_request_id)
      WHERE created_by IS NOT NULL AND client_request_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_fulfillments_location_status_created
      ON order_fulfillments(location_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_fulfillments_order
      ON order_fulfillments(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_fulfillment
      ON order_items(fulfillment_id);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_events_fulfillment
      ON fulfillment_events(fulfillment_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_events_created
      ON audit_events(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_events_order
      ON audit_events(order_id, created_at);
  `);

  if (!hasColumn(db, "app_settings", "completed_order_retention_days")) {
    db.exec("ALTER TABLE app_settings ADD COLUMN completed_order_retention_days INTEGER NOT NULL DEFAULT 7 CHECK(completed_order_retention_days BETWEEN 1 AND 3650);");
  }

  if (schemaVersion < 1) {
    db.exec(`
      INSERT OR IGNORE INTO order_fulfillments (
        id, order_id, location_id, status, ready_at, handed_over_at, created_at, updated_at
      )
      SELECT
        'legacy-' || o.id,
        o.id,
        COALESCE((SELECT MIN(i.fulfillment_location_id)
                  FROM order_items oi JOIN items i ON i.id = oi.item_id
                  WHERE oi.order_id = o.id), 1),
        CASE o.status
          WHEN 'available' THEN 'ready'
          WHEN 'delivered' THEN 'handed_over'
          WHEN 'cancelled' THEN 'cancelled'
          ELSE 'preparing'
        END,
        CASE WHEN o.status IN ('available', 'delivered') THEN o.updated_at END,
        CASE WHEN o.status = 'delivered' THEN o.updated_at END,
        o.created_at,
        o.updated_at
      FROM orders o;

      UPDATE order_items
      SET fulfillment_id = (
        SELECT f.id FROM order_fulfillments f
        WHERE f.order_id = order_items.order_id
        ORDER BY f.created_at ASC LIMIT 1
      )
      WHERE fulfillment_id IS NULL;

      PRAGMA user_version = 1;
    `);
  }
  if (schemaVersion < 3) {
    db.exec(`
      INSERT INTO audit_events (
        order_id, fulfillment_id, display_number, display_number_date, location_name,
        event_type, from_status, to_status, actor_user_id, actor_username, created_at
      )
      SELECT f.order_id, e.fulfillment_id, o.display_number, o.display_number_date, l.name,
             'fulfillment_status', e.from_status, e.to_status, e.changed_by, u.username,
             CASE
               WHEN instr(e.created_at, 'T') > 0 THEN e.created_at
               ELSE replace(e.created_at, ' ', 'T') || 'Z'
             END
      FROM fulfillment_events e
      JOIN order_fulfillments f ON f.id = e.fulfillment_id
      JOIN orders o ON o.id = f.order_id
      JOIN fulfillment_locations l ON l.id = f.location_id
      LEFT JOIN users u ON u.id = e.changed_by
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_events a
        WHERE a.fulfillment_id = e.fulfillment_id
          AND a.event_type = 'fulfillment_status'
          AND COALESCE(a.from_status, '') = COALESCE(e.from_status, '')
          AND a.to_status = e.to_status
          AND a.created_at = CASE
            WHEN instr(e.created_at, 'T') > 0 THEN e.created_at
            ELSE replace(e.created_at, ' ', 'T') || 'Z'
          END
      );
    `);
    db.exec("PRAGMA user_version = 3;");
  }
  if (schemaVersion < 4) {
    db.exec(`
      ALTER TABLE audit_events RENAME TO audit_events_before_admin_audit;
      CREATE TABLE audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT,
        fulfillment_id TEXT,
        display_number INTEGER,
        display_number_date TEXT,
        location_name TEXT,
        event_type TEXT NOT NULL CHECK(event_type IN ('order_created', 'order_cancelled', 'fulfillment_status', 'orders_cleaned', 'admin_action')),
        from_status TEXT,
        to_status TEXT,
        actor_user_id TEXT,
        actor_username TEXT,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      INSERT INTO audit_events (
        id, order_id, fulfillment_id, display_number, display_number_date, location_name,
        event_type, from_status, to_status, actor_user_id, actor_username, details, created_at
      )
      SELECT id, order_id, fulfillment_id, display_number, display_number_date, location_name,
             event_type, from_status, to_status, actor_user_id, actor_username, details, created_at
      FROM audit_events_before_admin_audit;
      DROP TABLE audit_events_before_admin_audit;
      CREATE INDEX idx_audit_events_created ON audit_events(created_at DESC, id DESC);
      CREATE INDEX idx_audit_events_order ON audit_events(order_id, created_at);
      PRAGMA user_version = 4;
    `);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS fulfilled_item_sales (
      fulfillment_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      sales_date TEXT NOT NULL,
      location_id INTEGER NOT NULL,
      location_name TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      PRIMARY KEY (fulfillment_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_fulfilled_item_sales_date
      ON fulfilled_item_sales(sales_date);

    INSERT OR IGNORE INTO fulfilled_item_sales (
      fulfillment_id, order_id, item_id, item_name, quantity, sales_date,
      location_id, location_name, completed_at
    )
    SELECT f.id, f.order_id, oi.item_id, oi.item_name, oi.quantity, o.display_number_date,
           f.location_id, l.name, COALESCE(f.handed_over_at, f.updated_at)
    FROM order_fulfillments f
    JOIN orders o ON o.id = f.order_id
    JOIN order_items oi ON oi.fulfillment_id = f.id
    JOIN fulfillment_locations l ON l.id = f.location_id
    WHERE f.status = 'handed_over';
  `);
  if (schemaVersion < 5) db.exec("PRAGMA user_version = 5;");
}
