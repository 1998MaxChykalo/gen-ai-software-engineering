'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTotal, filterByMonth, validateExpense } = require('../src/utils');

test('calculateTotal returns 0 for an empty list', () => {
  assert.equal(calculateTotal([]), 0);
});

test('calculateTotal sums every expense, including the first one', () => {
  const expenses = [
    { amount: 10.5 },
    { amount: 20 },
    { amount: 4.25 },
  ];
  assert.equal(calculateTotal(expenses), 34.75);
});

test('calculateTotal of a single expense equals its amount', () => {
  assert.equal(calculateTotal([{ amount: 42 }]), 42);
});

test('filterByMonth returns expenses from the requested calendar month', () => {
  const expenses = [
    { id: 1, date: '2026-03-15T12:00:00Z' },
    { id: 2, date: '2026-04-10T12:00:00Z' },
    { id: 3, date: '2026-03-02T12:00:00Z' },
  ];
  const march = filterByMonth(expenses, 2026, 3);
  assert.deepEqual(march.map((e) => e.id).sort(), [1, 3]);
});

test('filterByMonth respects the year', () => {
  const expenses = [
    { id: 1, date: '2025-06-15T12:00:00Z' },
    { id: 2, date: '2026-06-15T12:00:00Z' },
  ];
  const june2026 = filterByMonth(expenses, 2026, 6);
  assert.deepEqual(june2026.map((e) => e.id), [2]);
});

test('validateExpense rejects a missing description', () => {
  const { valid, errors } = validateExpense({ amount: 5, date: '2026-01-01' });
  assert.equal(valid, false);
  assert.ok(errors.includes('description is required'));
});

test('validateExpense accepts a complete expense', () => {
  const { valid } = validateExpense({
    description: 'Coffee',
    amount: 3.5,
    category: 'food',
    date: '2026-01-01',
  });
  assert.equal(valid, true);
});
