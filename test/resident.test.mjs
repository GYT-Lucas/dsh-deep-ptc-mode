import test from 'node:test';
import assert from 'node:assert/strict';
import { staysResident } from '../lib/resident.mjs';

test('ordinary external tools stay on demand', () => {
  assert.equal(staysResident(null), false);
  assert.equal(staysResident({ name: 'better_read', deepPtc: { provider: 'example-plugin' } }), false);
  assert.equal(staysResident({ name: 'read' }), false);
});

test('a plugin can keep its own tool resident without a package pin', () => {
  assert.equal(staysResident({ name: 'acme_lookup', resident: true }), true);
  assert.equal(staysResident({ name: 'acme_flow', deepPtc: { resident: true, provider: 'example-plugin' } }), true);
});

test('screen-control definitions stay in the initial SDK', () => {
  assert.equal(staysResident({ name: 'tap', presentationMeta: { 'dsh-go/view': { kind: 'card' } } }), true);
  assert.equal(staysResident({ name: 'intent' }), true);
  assert.equal(staysResident({ name: 'collect' }), true);
  assert.equal(staysResident({ name: 'tap_xy' }), true);
  assert.equal(staysResident({ name: 'screen_shot' }), true);
  assert.equal(staysResident({ name: 'press' }, 'community/dsh-go-screen'), true);
  assert.equal(staysResident({ name: 'press', deepPtc: { provider: 'screen-control' } }), true);
});
