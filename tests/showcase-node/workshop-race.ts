import { openDatabase } from '../../src/server/database.ts';
import { createWorkshops } from '../../src/server/repositories/workshops.ts';
const db = openDatabase(process.argv[2]);
const repo = createWorkshops(db);
try {
  const owner = process.argv[3];
  repo.reserve(owner, repo.issue(owner, 'component-lab'), 'component-lab', `${owner}@example.test`, 3);
} catch { process.exitCode = 2; }
finally { db.close(); }
