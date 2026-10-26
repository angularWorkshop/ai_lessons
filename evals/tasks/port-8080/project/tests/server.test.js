import assert from 'node:assert/strict';
import { test } from 'node:test';
import { address, PORT } from '../src/server.js';

test('порт по умолчанию — 3000', () => {
  assert.equal(PORT, 3000);
});

test('адрес сервера', () => {
  assert.equal(address(), 'http://localhost:3000');
});
