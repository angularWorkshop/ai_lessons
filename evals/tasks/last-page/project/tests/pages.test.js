import assert from 'node:assert/strict';
import { test } from 'node:test';
import { page, pageCount } from '../src/pages.js';

const orders = (count) => Array.from({ length: count }, (_, i) => `заказ ${i + 1}`);

test('20 заказов по 10 — две страницы', () => {
  assert.equal(pageCount(20, 10), 2);
});

test('вторая страница — заказы с 11 по 20', () => {
  assert.deepEqual(page(orders(20), 2, 10), orders(20).slice(10));
});

test('страницы с номером 0 нет', () => {
  assert.deepEqual(page(orders(5), 0, 10), []);
});
