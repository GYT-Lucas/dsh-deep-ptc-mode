import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRoot, installRoot } from '../lib/tool-state.mjs';
import { RESET_COMMAND, STATE_EVENT, STATE_KEY } from '../lib/tool-catalog.mjs';

function rootHost(stateOf = () => undefined) {
  const commands = new Map();
  const records = [];
  const effects = [];
  const ctx = {
    effect: fn => effects.push(fn()),
    commands: { register: definition => commands.set(definition.name, definition) },
    sessionProjections: { register: async definition => ({ key: definition.key, summary: definition.wire.summary, stateOf, dispose() {} }) },
  };
  return { ctx, commands, records, effects, append: async () => (session, type, data) => records.push({ session, type, data }) };
}

test('the root installer waits for the command and projection services', () => {
  let definition;
  const ctx = { logger: { warn() {} }, plugin: value => { definition = value; return { await: async () => {}, catch() { return this; } }; } };
  applyRoot(ctx);
  assert.deepEqual(definition.inject, ['commands', 'sessionProjections']);
});

test('the root reset works in any Deep PTC conversation by persisting a new epoch', async () => {
  const blocked = [{ name: 'bad_tool', provider: 'example-plugin', kind: 'failure' }];
  const host = rootHost(() => ({ v: 1, epoch: 3, blocked, report: null }));
  await installRoot(host.ctx, host.append);
  try {
    const reset = host.commands.get(RESET_COMMAND);
    const session = { header: { agentPreset: 'deep-ptc' } };
    const result = reset.handler({ agent: { session } });
    assert.equal(result.kind, 'success');
    assert.match(result.text, /清除 1 个故障标记/u);
    assert.deepEqual(host.records, [{ session, type: STATE_EVENT, data: { v: 1, epoch: 4, blocked: [], report: null } }]);
    assert.equal(reset.handler({ agent: { session: { header: { agentPreset: 'ptc' } } } }).kind, 'error', 'other presets are untouched');
    assert.equal(reset.handler({}).kind, 'error');
    assert.equal(host.records.length, 1);
  } finally {
    for (const dispose of host.effects) dispose?.();
  }
});

test('the root projection keeps the tool state out of session summaries and is released on dispose', async () => {
  const host = rootHost();
  await installRoot(host.ctx, host.append);
  assert.ok(globalThis[Symbol.for('dsh-deep-ptc-mode/tool-state')], 'the preset layer can find the root state');
  for (const dispose of host.effects) dispose?.();
  assert.equal(globalThis[Symbol.for('dsh-deep-ptc-mode/tool-state')], undefined);
  assert.equal(STATE_KEY, 'deepPtcTools');
});
