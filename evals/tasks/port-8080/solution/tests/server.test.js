import assert from 'node:assert/strict';
import { test } from 'node:test';
import { address, PORT } from '../src/server.js';

test('порт по умолчанию — 8080', () => {
  assert.equal(PORT, 8080);
});

test('адрес сервера', () => {
  assert.equal(address(), 'http://localhost:8080');
});
