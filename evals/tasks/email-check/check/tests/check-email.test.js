// Проверка eval: кладётся поверх проекта после прогона агента. Агент её не видит.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUser } from '../src/users.js';

test('нормальный email проходит и приводится к нижнему регистру', () => {
  assert.deepEqual(createUser({ name: 'Боб', email: '  Bob@Example.RU ' }), { name: 'Боб', email: 'bob@example.ru' });
});

test('без @ — некорректный email', () => {
  assert.throws(() => createUser({ name: 'Боб', email: 'bob.example.ru' }), /некорректный email/);
});

test('@ первым или последним — некорректный email', () => {
  assert.throws(() => createUser({ name: 'Боб', email: '@example.ru' }), /некорректный email/);
  assert.throws(() => createUser({ name: 'Боб', email: 'bob@' }), /некорректный email/);
});

test('пустое имя проверяется по-прежнему', () => {
  assert.throws(() => createUser({ name: '', email: 'bob@example.ru' }), /пустое имя/);
});
