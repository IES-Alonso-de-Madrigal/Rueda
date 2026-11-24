import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

export type AppDb = BetterSQLite3Database<typeof schema>;

let sqliteInstance: Database.Database | null = null;
let dbInstance: AppDb | null = null;

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'data/app.db');
}

function ensureDirectory(filePath: string) {
  if (filePath === ':memory:') return;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function initDb(customPath?: string): { db: AppDb; sqlite: Database.Database } {
  if (dbInstance && sqliteInstance && !customPath) {
    return { db: dbInstance, sqlite: sqliteInstance };
  }

  const dbPath = customPath ?? getDatabasePath();
  ensureDirectory(dbPath);

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  const db = drizzle(sqlite, { schema });

  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
  }

  if (!customPath) {
    sqliteInstance = sqlite;
    dbInstance = db;
  }

  return { db, sqlite };
}

export function getDb(): AppDb {
  return initDb().db;
}

export function getSqlite(): Database.Database {
  return initDb().sqlite;
}

export function closeDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}
