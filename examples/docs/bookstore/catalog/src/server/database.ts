import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openCatalog(path = process.env.CHAPTER_HOUSE_DATABASE ?? '.data/chapter-house.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, slug TEXT NOT NULL, sku TEXT NOT NULL,
      title TEXT NOT NULL, author TEXT NOT NULL, description TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
      stock INTEGER NOT NULL CHECK(stock >= 0), published INTEGER NOT NULL CHECK(published IN (0, 1)),
      version INTEGER NOT NULL DEFAULT 1, UNIQUE(owner, slug), UNIQUE(owner, sku)
    );
    CREATE TABLE IF NOT EXISTS catalog_seeds (owner TEXT PRIMARY KEY);
  `);
  return database;
}

export function transaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
