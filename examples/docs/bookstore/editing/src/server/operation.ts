import { HttpError } from 'lithono';
import { CatalogConflict } from '@/server/catalog-write.ts';

export function operation<T>(work: () => T): T {
  try { return work(); }
  catch (error) {
    if (error instanceof CatalogConflict) throw new HttpError(409, error.message);
    throw error;
  }
}
