import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../src/server/database.ts';
import { createBookstore, BookstoreConflict } from '../../src/server/repositories/bookstore.ts';

test('catalog is workspace-owned, seeded once and public reads exclude drafts', () => {
  const database = openDatabase(':memory:');
  try {
    const catalog = createBookstore(database);
    catalog.seed('staff-a'); catalog.seed('staff-b'); catalog.seed('staff-a');
    assert.equal(catalog.list('staff-a').length, 3);
    assert.equal(catalog.list('staff-a', '', true).length, 2);
    const draft = catalog.list('staff-a').find(book => book.slug === 'night-trains')!;
    assert.equal(catalog.published('staff-a', draft.slug), undefined);
    assert.equal(catalog.one('staff-b', draft.id), undefined);
    assert.throws(() => catalog.save('staff-b', draft.id, draft.version, draft, true), BookstoreConflict);
    catalog.save('staff-a', draft.id, draft.version, { ...draft, description: 'A newly published journey.' }, true);
    assert.equal(catalog.published('staff-a', draft.slug)?.description, 'A newly published journey.');
    assert.equal(catalog.list('staff-b', '', true).length, 2);
  } finally { database.close(); }
});

test('receiving is atomic, version checked and safely replayed only for identical input', () => {
  const database = openDatabase(':memory:');
  try {
    const catalog = createBookstore(database); catalog.seed('staff');
    const book = catalog.list('staff').find(book => book.slug === 'night-trains')!;
    const token = crypto.randomUUID();
    const receipt = catalog.receive('staff', book.id, book.version, token, 5, 'DELIVERY-A');
    assert.equal(catalog.one('staff', book.id)?.stock, 5);
    assert.equal(catalog.receive('staff', book.id, book.version, token, 5, 'DELIVERY-A').id, receipt.id);
    assert.equal(catalog.one('staff', book.id)?.stock, 5);
    assert.equal(catalog.receipts('staff', book.id).length, 1);
    assert.throws(() => catalog.receive('staff', book.id, book.version, token, 7, 'DELIVERY-A'), /different details/);
    assert.throws(() => catalog.receive('staff', book.id, book.version, crypto.randomUUID(), 3, 'STALE'), /Stock changed/);
    // Force a ledger write failure after the stock UPDATE and prove rollback.
    database.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON bookstore_movements BEGIN SELECT RAISE(ABORT, 'ledger unavailable'); END;");
    assert.throws(() => catalog.receive('staff', book.id, 2, crypto.randomUUID(), 3, 'ROLLBACK'), /ledger unavailable/);
    assert.equal(catalog.one('staff', book.id)?.stock, 5);
    assert.equal(catalog.one('staff', book.id)?.version, 2);
    assert.equal(catalog.receipts('staff', book.id).length, 1);
  } finally { database.close(); }
});
