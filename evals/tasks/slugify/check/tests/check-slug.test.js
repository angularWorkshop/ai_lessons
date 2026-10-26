// Проверка eval: кладётся поверх проекта после прогона агента. Агент её не видит.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slugify } from '../src/slug.js';

test('строчные буквы и дефис вместо пробела', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('Node 20 Release'), 'node-20-release');
});

test('несколько разделителей подряд — один дефис', () => {
  assert.equal(slugify('a  --  b...c'), 'a-b-c');
});

test('по краям дефисов нет', () => {
  assert.equal(slugify('  ...Привет, TypeScript!  '), 'typescript');
});

test('не длиннее 40 символов и без дефиса на конце', () => {
  assert.equal(slugify('a'.repeat(50)), 'a'.repeat(40));
  assert.equal(slugify('word '.repeat(10)), 'word-word-word-word-word-word-word-word');
});

test('ничего не осталось — untitled', () => {
  assert.equal(slugify('Привет, мир!'), 'untitled');
  assert.equal(slugify(''), 'untitled');
});
