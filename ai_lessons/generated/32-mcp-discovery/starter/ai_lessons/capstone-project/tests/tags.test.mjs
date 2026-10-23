import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTags } from '../src/tags.mjs';

test('trims, lowercases, removes duplicates, and sorts tags', () => {
  assert.deepEqual(normalizeTags([' React ', 'angular', 'REACT', 'Vue']), ['angular', 'react', 'vue']);
});
test('removes whitespace-only entries', () => {
  assert.deepEqual(normalizeTags([' ', ' CSS', '', 'html ']), ['css', 'html']);
});
test('preserves input and returns a different array', () => {
  const input = Object.freeze([' B ', 'a']);
  const output = normalizeTags(input);
  assert.deepEqual(input, [' B ', 'a']);
  assert.notEqual(output, input);
});
test('empty input stays empty', () => {
  assert.deepEqual(normalizeTags([]), []);
});
