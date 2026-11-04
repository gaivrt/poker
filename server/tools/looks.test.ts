// node --test tools/looks.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignLooks, cleanLook, picksFree } from '../src/looks.ts';

// Seats hold a bot's preset, or -1 for a person; picks hold each person's choice.
test('a person gets the look they picked', () => {
  assert.deepEqual(assignLooks([-1, 0, 1, 2, 3, 5], [4]), [4, 0, 1, 2, 3, 5]);
});

test('no pick: a look no bot is using', () => {
  assert.deepEqual(assignLooks([-1, 0, 1, 2, 3, 5], [undefined]), [4, 0, 1, 2, 3, 5]);
});

test('a bot keeps its look: the person gets a free one instead', () => {
  assert.deepEqual(assignLooks([-1, 0, 1, 2, 3, 5], [0]), [4, 0, 1, 2, 3, 5]);
});

test('two people pick the same look: the first keeps it, the other gets a free one', () => {
  assert.deepEqual(assignLooks([-1, -1, 0, 1, 2, 3], [5, 5]), [5, 4, 0, 1, 2, 3]);
});

test('a free look goes to nobody who picked another: picks are served first', () => {
  // the second person picked 4, so the first (no pick) must not be handed 4
  assert.deepEqual(assignLooks([-1, -1, 0, 1, 2, 3], [undefined, 4]), [5, 4, 0, 1, 2, 3]);
});

test('six people: everyone distinct, whatever they picked', () => {
  const looks = assignLooks([-1, -1, -1, -1, -1, -1], [0, 0, 0, 1, undefined, 1]);
  assert.equal(new Set(looks).size, 6);
  assert.equal(looks[0], 0);
  assert.equal(looks[3], 1);
});

test('picksFree: true only when no bot holds a picked look', () => {
  assert.equal(picksFree([-1, 0, 1, 2, 3, 5], [4]), true);
  assert.equal(picksFree([-1, 0, 1, 2, 3, 5], [0]), false);
  assert.equal(picksFree([-1, 0, 1, 2, 3, 5], [undefined]), true);
});

test('cleanLook: only a valid preset index survives', () => {
  for (const ok of [0, 3, 5]) assert.equal(cleanLook(ok), ok);
  for (const bad of [-1, 6, 1.5, '2', null, undefined, {}]) assert.equal(cleanLook(bad), undefined);
});
