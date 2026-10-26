import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPromo, findPromo } from '../src/discount.js';

test('WELCOME: 10% от 1500 ₽', () => {
  assert.equal(applyPromo(1500, findPromo('WELCOME')), 1350);
});

test('WELCOME: меньше 1000 ₽ — без скидки', () => {
  assert.equal(applyPromo(500, findPromo('welcome')), 500);
});

test('WELCOME: ровно 1000 ₽ — скидка уже действует', () => {
  assert.equal(applyPromo(1000, findPromo('WELCOME')), 900);
});
