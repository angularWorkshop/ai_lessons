import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slugify } from '../src/slug.js';

test('заголовок со знаками препинания', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
});
