import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog } from '../src/server/database.ts';
import { createCatalog } from '../src/server/catalog.ts';
import { createReceiving } from '../src/server/receiving.ts';

test('receipts are atomic, owner scoped, version checked, and replay safe', () => {
  const database = openCatalog(':memory:');
  try {
    const catalog = createCatalog(database); catalog.seed('a');
    const receiving = createReceiving(database);
    const book = catalog.list('a').find(book => !book.published)!;
    const token = crypto.randomUUID();
    const receipt = receiving.receive('a', book.id, book.version, token, 5, 'DELIVERY-1');
    assert.equal(receiving.receive('a', book.id, book.version, token, 5, 'DELIVERY-1').id, receipt.id);
    assert.equal(catalog.one('a', book.id)?.stock, 5);
    assert.throws(() => receiving.receive('a', book.id, book.version, token, 7, 'DELIVERY-1'), /different details/);
    assert.throws(() => receiving.receive('a', book.id, book.version, crypto.randomUUID(), 1, 'STALE'), /Stock changed/);
    assert.throws(() => receiving.receive('b', book.id, 2, crypto.randomUUID(), 1, 'OTHER'), /Stock changed/);
    database.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'ledger unavailable'); END;");
    assert.throws(() => receiving.receive('a', book.id, 2, crypto.randomUUID(), 3, 'ROLLBACK'), /ledger unavailable/);
    assert.equal(catalog.one('a', book.id)?.stock, 5);
    assert.equal(catalog.one('a', book.id)?.version, 2);
    assert.equal(receiving.list('a', book.id).length, 1);
  } finally { database.close(); }
});
