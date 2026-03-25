import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const NEXUS_DIR = join(homedir(), '.nexus');
const DB_PATH = join(NEXUS_DIR, 'nexus.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  if (!existsSync(NEXUS_DIR)) {
    mkdirSync(NEXUS_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}
