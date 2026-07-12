const { test } = require('node:test');
const assert = require('node:assert');
const { isDuplicateReceipt, deriveTaxYear } = require('../receipt-utils');

test('deriveTaxYear from receipt date string', () => {
  assert.strictEqual(deriveTaxYear('2026-05-02'), 2026);
  assert.strictEqual(deriveTaxYear('2025-12-31'), 2025);
});
test('deriveTaxYear null/invalid → null', () => {
  assert.strictEqual(deriveTaxYear(null), null);
  assert.strictEqual(deriveTaxYear('not-a-date'), null);
  assert.strictEqual(deriveTaxYear(undefined), null);
  assert.strictEqual(deriveTaxYear('2025-99-99'), null);
});
test('duplicate: same merchant+total, same day', () => {
  const existing = [{ merchant: 'Costco', amount: 214.33, date: '2026-05-02' }];
  assert.strictEqual(isDuplicateReceipt({ merchant: 'Costco', total: 214.33, date: '2026-05-02' }, existing), true);
});
test('duplicate: ±1 day tolerance', () => {
  const existing = [{ merchant: 'Costco', amount: 214.33, date: '2026-05-02' }];
  assert.strictEqual(isDuplicateReceipt({ merchant: 'Costco', total: 214.33, date: '2026-05-03' }, existing), true);
  assert.strictEqual(isDuplicateReceipt({ merchant: 'Costco', total: 214.33, date: '2026-05-01' }, existing), true);
  assert.strictEqual(isDuplicateReceipt({ merchant: 'Costco', total: 214.33, date: '2026-05-04' }, existing), false);
});
test('not duplicate: different total or merchant', () => {
  const existing = [{ merchant: 'Costco', amount: 214.33, date: '2026-05-02' }];
  assert.strictEqual(isDuplicateReceipt({ merchant: 'Costco', total: 99.99, date: '2026-05-02' }, existing), false);
  assert.strictEqual(isDuplicateReceipt({ merchant: 'Smiths', total: 214.33, date: '2026-05-02' }, existing), false);
});
test('merchant match is case/whitespace-insensitive', () => {
  const existing = [{ merchant: ' costco ', amount: 214.33, date: '2026-05-02' }];
  assert.strictEqual(isDuplicateReceipt({ merchant: 'Costco', total: 214.33, date: '2026-05-02' }, existing), true);
});
test('missing data never duplicates', () => {
  assert.strictEqual(isDuplicateReceipt({ merchant: null, total: 214.33, date: '2026-05-02' }, [{ merchant: null, amount: 214.33, date: '2026-05-02' }]), false);
  assert.strictEqual(isDuplicateReceipt({ merchant: 'Costco', total: null, date: '2026-05-02' }, [{ merchant: 'Costco', amount: null, date: '2026-05-02' }]), false);
});
