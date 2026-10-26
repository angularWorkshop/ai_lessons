// Проверка eval: кладётся поверх проекта после прогона агента. Агент её не видит.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { page, pageCount } from '../src/pages.js';

const orders = (count) => Array.from({ length: count }, (_, i) => `заказ ${i + 1}`);

test('21 заказ по 10 — три страницы', () => {
  assert.equal(pageCount(21, 10), 3);
});

test('ровно 20 — по-прежнему две', () => {
  assert.equal(pageCount(20, 10), 2);
});

test('нет заказов — нет страниц', () => {
  assert.equal(pageCount(0, 10), 0);
  assert.deepEqual(page([], 1, 10), []);
});

test('на третьей странице — последний заказ', () => {
  assert.deepEqual(page(orders(21), 3, 10), ['заказ 21']);
});

test('четвёртой страницы нет', () => {
  assert.deepEqual(page(orders(21), 4, 10), []);
});
