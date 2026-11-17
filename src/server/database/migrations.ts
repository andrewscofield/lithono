import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  version: number;
  name: string;
  up(database: DatabaseSync): void;
}
const activeTransactions = new WeakSet<DatabaseSync>();

/** Synchronous SQLite work only: never hold a transaction across provider I/O. */
export function transaction<T>(database: DatabaseSync, work: () => T): T {
  // Repository operations may compose atomically (inquiry + outbox). A savepoint
  // rolls back only the nested operation if its caller handles the error.
  if (activeTransactions.has(database)) {
    const name = `nested_${crypto.randomUUID().replaceAll('-', '')}`;
    database.exec(`SAVEPOINT ${name}`);
    try {
      const result = work();
      database.exec(`RELEASE ${name}`);
      return result;
    } catch (error) {
      database.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
      throw error;
    }
  }
  database.exec('BEGIN IMMEDIATE');
  activeTransactions.add(database);
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  } finally {
    activeTransactions.delete(database);
  }
}

export const migrations: Migration[] = [
  { version: 8, name: 'Chapter House catalog and receiving ledger', up(db) {
    db.exec(`CREATE TABLE bookstore_products (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES showcase_workspaces(id),
      slug TEXT NOT NULL, sku TEXT NOT NULL, title TEXT NOT NULL, author TEXT NOT NULL,
      description TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0, 1)), version INTEGER NOT NULL DEFAULT 1,
      UNIQUE(workspace_id, slug), UNIQUE(workspace_id, sku)
    );
    CREATE TABLE bookstore_movements (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES bookstore_products(id),
      token TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), reference TEXT NOT NULL,
      created_at INTEGER NOT NULL, UNIQUE(workspace_id, token)
    );`);
  } },
  { version: 7, name: 'community publication and subscription lifecycle', up(db) {
    db.exec(`CREATE TABLE community_posts (id TEXT PRIMARY KEY, title TEXT NOT NULL, topic TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('draft','published')), version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE community_marks (owner TEXT NOT NULL, post_id TEXT NOT NULL REFERENCES community_posts(id), kind TEXT NOT NULL, PRIMARY KEY(owner,post_id,kind));
      CREATE TABLE community_subscriptions (owner TEXT PRIMARY KEY REFERENCES showcase_workspaces(id), email TEXT NOT NULL, token TEXT NOT NULL UNIQUE, state TEXT NOT NULL CHECK(state IN ('pending','confirmed','unsubscribed')), outbox_id TEXT NOT NULL REFERENCES showcase_email_outbox(id));
      INSERT INTO community_posts VALUES ('native-web','A useful native web','platform','article','Start with links and forms. Give data and DOM clear owners. Add enhancement where it helps readers complete their work.','published',1), ('open-studio','Open studio evening','events','event','Join the community on 18 December 2026 at 18:00 UTC for an informal project review. RSVP records interest only; no ticketing or capacity guarantee.','published',1);`);
  } },
  { version: 6, name: 'workspace inventory and adjustment audits', up(db) {
    db.exec(`CREATE TABLE inventory_items (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES showcase_workspaces(id), sku TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, stock INTEGER NOT NULL CHECK(stock >= 0), threshold INTEGER NOT NULL CHECK(threshold >= 0), version INTEGER NOT NULL DEFAULT 1, UNIQUE(workspace_id, sku));
      CREATE TABLE inventory_audit (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, item_id TEXT NOT NULL REFERENCES inventory_items(id), delta INTEGER NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);`);
  } },
  {
    version: 5,
    name: 'workshop sessions bookings and payment events',
    up(database) {
      database.exec(`
        CREATE TABLE workshop_sessions (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
          starts_at INTEGER NOT NULL, zone TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity > 0),
          price INTEGER NOT NULL CHECK(price >= 0), currency TEXT NOT NULL
        );
        CREATE TABLE workshop_bookings (
          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES showcase_workspaces(id),
          token TEXT NOT NULL, session_id TEXT NOT NULL REFERENCES workshop_sessions(id),
          email TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 6),
          amount INTEGER NOT NULL, currency TEXT NOT NULL, expires_at INTEGER NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('pending','expired','cancelled','confirmed','needs_attention')),
          checkout_id TEXT UNIQUE, checkout_url TEXT, checkout_lease INTEGER, outbox_id TEXT REFERENCES showcase_email_outbox(id),
          created_at INTEGER NOT NULL, UNIQUE(workspace_id, token)
        );
        CREATE TABLE workshop_events (id TEXT PRIMARY KEY, outcome TEXT NOT NULL, processed_at INTEGER NOT NULL);
        CREATE TABLE workshop_tokens (token TEXT PRIMARY KEY, owner TEXT NOT NULL, session_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
        INSERT INTO workshop_sessions VALUES
          ('native-forms','Native forms workshop','Build accessible progressively enhanced forms.',1797332400000,'Europe/London',12,0,'gbp'),
          ('component-lab','Component integration lab','Hands-on custom element ownership and integration.',1797418800000,'Europe/London',8,2500,'gbp');
      `);
    },
  },
  {
    version: 1,
    name: 'existing lists and listings',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS listings (
          id TEXT PRIMARY KEY, address TEXT NOT NULL, price INTEGER NOT NULL,
          kind TEXT NOT NULL DEFAULT 'house', status TEXT NOT NULL DEFAULT 'for-sale',
          featured INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS lists (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY, list_id TEXT NOT NULL, title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
          FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
        );
      `);
      const columns = new Set(
        (database.prepare('PRAGMA table_info(listings)').all() as { name: string }[])
          .map(column => column.name),
      );
      for (const [name, definition] of [
        ['kind', "TEXT NOT NULL DEFAULT 'house'"],
        ['status', "TEXT NOT NULL DEFAULT 'for-sale'"],
        ['featured', 'INTEGER NOT NULL DEFAULT 0'],
      ]) {
        if (!columns.has(name)) database.exec(`ALTER TABLE listings ADD COLUMN ${name} ${definition}`);
      }
    },
  },
  {
    version: 2,
    name: 'workspace, seed metadata and delivery outbox',
    up(database) {
      database.exec(`
        CREATE TABLE showcase_workspaces (
          id TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
        );
        CREATE TABLE showcase_seeds (
          domain TEXT NOT NULL, scope TEXT NOT NULL, version INTEGER NOT NULL,
          applied_at INTEGER NOT NULL, PRIMARY KEY (domain, scope, version)
        );
        CREATE TABLE showcase_email_outbox (
          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL, payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'sending', 'sent', 'unavailable', 'failed')),
          attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
          first_attempt_at INTEGER, next_attempt_at INTEGER NOT NULL,
          lease_until INTEGER, provider_id TEXT, last_error TEXT,
          UNIQUE (workspace_id, idempotency_key),
          FOREIGN KEY (workspace_id) REFERENCES showcase_workspaces(id)
        );
        CREATE INDEX showcase_email_due ON showcase_email_outbox(status, next_attempt_at);
      `);
    },
  },
  {
    version: 3,
    name: 'property explorer metadata and durable inquiries',
    up(database) {
      database.exec(`
        ALTER TABLE listings ADD COLUMN description TEXT NOT NULL DEFAULT '';
        ALTER TABLE listings ADD COLUMN location TEXT NOT NULL DEFAULT '';
        ALTER TABLE listings ADD COLUMN latitude REAL;
        ALTER TABLE listings ADD COLUMN longitude REAL;
        ALTER TABLE listings ADD COLUMN bedrooms INTEGER;
        ALTER TABLE listings ADD COLUMN area INTEGER;
        ALTER TABLE listings ADD COLUMN listed_at INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE listings ADD COLUMN image TEXT;
        CREATE TABLE property_inquiries (
          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, listing_id TEXT NOT NULL,
          submission_key TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL,
          outbox_id TEXT NOT NULL, created_at INTEGER NOT NULL,
          UNIQUE(workspace_id, submission_key),
          FOREIGN KEY(workspace_id) REFERENCES showcase_workspaces(id),
          FOREIGN KEY(outbox_id) REFERENCES showcase_email_outbox(id)
        );
        CREATE INDEX property_recent ON listings(listed_at DESC, id);
      `);
    },
  },
  {
    version: 4,
    name: 'workspace project dashboard',
    up(database) {
      database.exec(`
        CREATE TABLE dashboard_projects (
          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '', notes_version INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY(workspace_id) REFERENCES showcase_workspaces(id)
        );
        CREATE INDEX dashboard_scope ON dashboard_projects(workspace_id, id);
        CREATE TABLE dashboard_milestones (
          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
          title TEXT NOT NULL, due TEXT NOT NULL, status TEXT NOT NULL
            CHECK(status IN ('planned', 'active', 'done')),
          FOREIGN KEY(project_id) REFERENCES dashboard_projects(id),
          FOREIGN KEY(workspace_id) REFERENCES showcase_workspaces(id)
        );
        CREATE TABLE dashboard_metrics (
          workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, day TEXT NOT NULL,
          completed INTEGER NOT NULL, PRIMARY KEY(workspace_id, project_id, day),
          FOREIGN KEY(project_id) REFERENCES dashboard_projects(id),
          FOREIGN KEY(workspace_id) REFERENCES showcase_workspaces(id)
        );
        CREATE TABLE dashboard_activity (
          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
          message TEXT NOT NULL, created_at INTEGER NOT NULL,
          FOREIGN KEY(project_id) REFERENCES dashboard_projects(id),
          FOREIGN KEY(workspace_id) REFERENCES showcase_workspaces(id)
        );
      `);
    },
  },
];

/** Each numbered migration commits atomically and runs exactly once. */
export function runMigrations(database: DatabaseSync, steps = migrations): void {
  database.exec(`CREATE TABLE IF NOT EXISTS showcase_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL
  )`);
  for (const step of [...steps].sort((a, b) => a.version - b.version)) {
    transaction(database, () => {
      const applied = database.prepare('SELECT name FROM showcase_migrations WHERE version = ?')
        .get(step.version) as { name: string } | undefined;
      if (applied) {
        if (applied.name !== step.name) throw new Error(`Migration ${step.version} name changed`);
        return;
      }
      step.up(database);
      database.prepare('INSERT INTO showcase_migrations VALUES (?, ?, ?)')
        .run(step.version, step.name, Date.now());
    });
  }
}
