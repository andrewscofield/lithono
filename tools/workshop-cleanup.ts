import { sqlite } from '../src/server/db.ts';
import { createWorkshops } from '../src/server/repositories/workshops.ts';
console.log('Expired workshop holds:', createWorkshops(sqlite).cleanup().changes);
