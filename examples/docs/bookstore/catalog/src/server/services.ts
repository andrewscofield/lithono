import { openCatalog } from '@/server/database.ts';
import { createCatalog } from '@/server/catalog.ts';

export const database = openCatalog();
export const catalog = createCatalog(database);
