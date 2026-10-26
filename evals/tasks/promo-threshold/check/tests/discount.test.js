// Проверка eval: кладётся поверх проекта после прогона агента. Агент её не видит.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPromo, findPromo } from '../src/discount.js';

test('WELCOME: 10% от 1500 ₽', () => {
  assert.equal(applyPromo(1500, findPromo('WELCOME')), 1350);
});

test('WELCOME: меньше 1000 ₽ — без скидки', () => {
  assert.equal(applyPromo(999, findPromo('welcome')), 999);
});

test('WELCOME: ровно 1000 ₽ — скидка уже действует', () => {
  assert.equal(applyPromo(1000, findPromo('WELCOME')), 900);
});

test('BIG: ровно 5000 ₽ — скидка 15%', () => {
  assert.equal(applyPromo(5000, findPromo('BIG')), 4250);
});

test('BIG: 4999 ₽ — без скидки', () => {
  assert.equal(applyPromo(4999, findPromo('BIG')), 4999);
});
