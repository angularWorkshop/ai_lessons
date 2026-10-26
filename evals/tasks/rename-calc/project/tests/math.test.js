import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calc } from '../src/math.js';

test('сумма позиций', () => {
  assert.equal(calc([{ price: 500, qty: 2 }, { price: 100, qty: 1 }]), 1100);
});

test('пустой список — ноль', () => {
  assert.equal(calc([]), 0);
});
