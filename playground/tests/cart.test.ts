import assert from 'node:assert/strict';
import { test } from 'node:test';
import { subtotal, total, type Item } from '../src/cart.ts';
import { formatPrice } from '../src/format.ts';

const book: Item = { name: 'Книга', price: 500, qty: 1 };
const lamp: Item = { name: 'Лампа', price: 1000, qty: 1 };

test('сумма корзины', () => {
  assert.equal(subtotal([book, { ...lamp, qty: 2 }]), 2500);
});

test('без промокода — просто сумма', () => {
  assert.equal(total([book, lamp]), 1500);
});

test('WELCOME: 10% от 1500 ₽', () => {
  assert.equal(total([book, lamp], 'WELCOME'), 1350);
});

test('WELCOME: меньше 1000 ₽ — без скидки', () => {
  assert.equal(total([book], 'WELCOME'), 500);
});

test('WELCOME: ровно 1000 ₽ — скидка уже действует', () => {
  assert.equal(total([{ ...book, qty: 2 }], 'welcome'), 900);
});

test('неизвестный промокод — ошибка', () => {
  assert.throws(() => total([book], 'FREE'), /не найден/);
});

test('цена для чека', () => {
  assert.equal(formatPrice(1350), '1 350 ₽');
  assert.equal(formatPrice(99.5), '99,50 ₽');
});
