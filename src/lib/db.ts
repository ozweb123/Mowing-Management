/**
 * SQLite persistence via better-sqlite3.
 * Single-file DB under /data — easy backup for a teen-run business.
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "miles-mowing.db");

let dbInstance: Database.Database | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Run schema migrations (idempotent CREATE IF NOT EXISTS). */
function migrate(db: Database.Database) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      owner_name TEXT NOT NULL DEFAULT 'Miles',
      pin_hash TEXT NOT NULL,
      savings_goal_cents INTEGER NOT NULL DEFAULT 300000,
      savings_label TEXT NOT NULL DEFAULT 'Truck fund',
      gas_estimate_per_yard_cents INTEGER NOT NULL DEFAULT 250,
      base_lat REAL NOT NULL DEFAULT 39.0375,
      base_lon REAL NOT NULL DEFAULT -95.7250,
      timezone TEXT NOT NULL DEFAULT 'America/Chicago',
      rain_push_until TEXT
    );

    CREATE TABLE IF NOT EXISTS lawns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT 'Topeka, KS',
      notes TEXT NOT NULL DEFAULT '',
      charge_cents INTEGER NOT NULL DEFAULT 3500,
      size TEXT NOT NULL DEFAULT 'medium'
        CHECK (size IN ('small','medium','large','xlarge')),
      schedule_type TEXT NOT NULL DEFAULT 'recurring'
        CHECK (schedule_type IN ('recurring','adhoc')),
      interval_days INTEGER,
      route_order INTEGER NOT NULL DEFAULT 100,
      dog_warning TEXT NOT NULL DEFAULT 'none'
        CHECK (dog_warning IN ('none','friendly','caution','do_not_enter')),
      gate_code TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      mower TEXT NOT NULL DEFAULT 'john_deere_60_ztrak'
        CHECK (mower IN ('bad_boy_54','john_deere_60_ztrak')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mowings (
      id TEXT PRIMARY KEY,
      lawn_id TEXT NOT NULL REFERENCES lawns(id) ON DELETE CASCADE,
      mowed_at TEXT NOT NULL,
      duration_minutes INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      weather_summary TEXT NOT NULL DEFAULT '',
      amount_cents INTEGER NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'owes'
        CHECK (payment_status IN ('paid','owes','partial')),
      paid_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mowings_lawn ON mowings(lawn_id);
    CREATE INDEX IF NOT EXISTS idx_mowings_date ON mowings(mowed_at);

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL
        CHECK (category IN ('gas','blades','oil','parts','other')),
      amount_cents INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      spent_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  `);

  // Lightweight column migrations for existing DBs.
  const lawnCols = db.prepare(`PRAGMA table_info(lawns)`).all() as Array<{
    name: string;
  }>;
  if (!lawnCols.some((c) => c.name === "phone")) {
    db.exec(`ALTER TABLE lawns ADD COLUMN phone TEXT NOT NULL DEFAULT ''`);
  }
  if (!lawnCols.some((c) => c.name === "mower")) {
    db.exec(
      `ALTER TABLE lawns ADD COLUMN mower TEXT NOT NULL DEFAULT 'john_deere_60_ztrak'`
    );
  }

  // Seed default settings + demo lawns on first run.
  const row = db.prepare("SELECT id FROM settings WHERE id = 1").get();
  if (!row) {
    const defaultPin = process.env.DEFAULT_PIN || "2468";
    const pinHash = bcrypt.hashSync(defaultPin, 12);
    db.prepare(
      `INSERT INTO settings (
        id, owner_name, pin_hash, savings_goal_cents, savings_label,
        gas_estimate_per_yard_cents, base_lat, base_lon, timezone
      ) VALUES (1, 'Miles', ?, 300000, 'Truck fund', 250, 39.0375, -95.7250, 'America/Chicago')`
    ).run(pinHash);

    seedDemoLawns(db);
  }
}

function seedDemoLawns(db: Database.Database) {
  const now = new Date().toISOString();
  const lawns = [
    {
      name: "Johnson",
      address: "4120 SW 29th St",
      notes: "Dog — knock first. Bag clippings near patio.",
      charge: 3500,
      size: "medium",
      schedule: "recurring",
      order: 10,
      dog: "caution",
      gate: "",
      phone: "785-555-0142",
      daysAgo: 6,
    },
    {
      name: "Miller",
      address: "2801 SW Belle Ave",
      notes: "HOA: edge sidewalks. Blow driveway.",
      charge: 4000,
      size: "large",
      schedule: "recurring",
      order: 20,
      dog: "friendly",
      gate: "4521",
      phone: "785-555-0198",
      daysAgo: 7,
    },
    {
      name: "Garcia",
      address: "3518 SW Westport Dr",
      notes: "Leave clippings. Side gate unlocked.",
      charge: 3000,
      size: "small",
      schedule: "recurring",
      order: 30,
      dog: "none",
      gate: "",
      phone: "785-555-0177",
      daysAgo: 5,
    },
    {
      name: "Peterson cleanup",
      address: "2240 SW Fairlawn Rd",
      notes: "One-time storm cleanup — limbs already piled.",
      charge: 4500,
      size: "medium",
      schedule: "adhoc",
      order: 40,
      dog: "none",
      gate: "",
      phone: "",
      daysAgo: null as number | null,
    },
  ];

  const insertLawn = db.prepare(`
    INSERT INTO lawns (
      id, name, address, city, notes, charge_cents, size, schedule_type,
      interval_days, route_order, dog_warning, gate_code, phone, mower, active, created_at, updated_at
    ) VALUES (?, ?, ?, 'Topeka, KS', ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'john_deere_60_ztrak', 1, ?, ?)
  `);

  const insertMow = db.prepare(`
    INSERT INTO mowings (
      id, lawn_id, mowed_at, duration_minutes, notes, weather_summary,
      amount_cents, payment_status, paid_at, created_at
    ) VALUES (?, ?, ?, ?, '', '', ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const l of lawns) {
      const id = uuid();
      insertLawn.run(
        id,
        l.name,
        l.address,
        l.notes,
        l.charge,
        l.size,
        l.schedule,
        l.order,
        l.dog,
        l.gate,
        l.phone,
        now,
        now
      );
      if (l.daysAgo != null) {
        const mowed = new Date();
        mowed.setDate(mowed.getDate() - l.daysAgo);
        const paid = l.daysAgo <= 5;
        insertMow.run(
          uuid(),
          id,
          mowed.toISOString(),
          45,
          l.charge,
          paid ? "paid" : "owes",
          paid ? mowed.toISOString() : null,
          now
        );
      }
    }
  });
  tx();
}

/** Get a singleton DB connection (server-only). */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  ensureDataDir();
  dbInstance = new Database(DB_PATH);
  migrate(dbInstance);
  return dbInstance;
}

/** Close DB (tests / graceful shutdown). */
export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
