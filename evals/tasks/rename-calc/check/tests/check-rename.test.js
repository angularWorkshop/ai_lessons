// Проверка eval: кладётся поверх проекта после прогона агента. Агент её не видит.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cartTotal } from '../src/cart.js';
import * as math from '../src/math.js';
import { report } from '../src/report.js';

const items = [{ price: 500, qty: 2 }, { price: 100, qty: 1 }];

test('sumPrices считает так же, как calc', () => {
  assert.equal(math.sumPrices(items), 1100);
});

test('старого имени больше нет', () => {
  assert.equal(math.calc, undefined);
});

test('корзина и отчёт работают', () => {
  assert.equal(cartTotal({ items }), 1100);
  assert.equal(report([{ id: 'A-1', items }]), 'A-1: 1100');
});
