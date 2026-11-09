import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../lib/skill-context.mjs';

test('the root installer waits for the command and projection services', () => {
  let definition;
  const ctx = { logger: { warn() {} }, plugin: value => { definition = value; return { await: async () => {}, catch() { return this; } }; } };
  apply(ctx);
  assert.deepEqual(definition.inject, ['commands', 'sessionProjections']);
  assert.equal(typeof definition.apply, 'function');
});
