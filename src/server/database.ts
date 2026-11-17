import './environment.ts';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './database/migrations.ts';
import { seedLegacyDemos } from './database/seeds.ts';
import { seedProperties } from './repositories/properties.ts';

/** Shared connection factory; tests and future repositories can supply isolated databases. */
export function openDatabase(path = process.env.LITHONO_DEMO_DATABASE ?? '.data/app.sqlite'): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  try {
    database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    runMigrations(database);
    seedLegacyDemos(database);
    seedProperties(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
