import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUser } from '../src/users.js';

test('имя и email без лишних пробелов', () => {
  assert.deepEqual(createUser({ name: ' Аня ', email: ' Anya@Example.com ' }), { name: 'Аня', email: 'anya@example.com' });
});

test('пустое имя — ошибка', () => {
  assert.throws(() => createUser({ name: '  ', email: 'a@b.ru' }), /пустое имя/);
});

test('email без @ — ошибка', () => {
  assert.throws(() => createUser({ name: 'Боб', email: 'bob.example.com' }), /некорректный email/);
});
