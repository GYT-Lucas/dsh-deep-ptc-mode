import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseSkillResults } from '../lib/skill-context.mjs';
import { SKILL_DISABLED_MARK } from '../lib/skill-card.mjs';

const event = { seq: 2, type: 'tool/result', data: { callId: 'call-1', name: 'skill', message: {
  role: 'tool', name: 'skill', content: [{ type: 'text', text: '<skill_content name="office">secret</skill_content>' }],
} } };

function state(enabled) { return { v: 1, turn: 2, phase: 'running',
  skills: [{ name: 'office', description: 'Office files', enabled, loadedTurn: 1, callId: 'call-1', seqs: [2] }],
  committed: { office: enabled }, descriptions: {} }; }

test('releases only committed-off skills with one surface replacement', async () => {
  const calls = []; const saved = [];
  const session = { header: { agentPreset: 'deep-ptc' }, surface: { nodes: [2] }, eventAt: () => event,
    append: (...args) => calls.push(args) };
  const projection = { stateOf: () => state(false) };
  await releaseSkillResults({ logger: { warn() {} } }, projection, (_session, next) => saved.push(next), { session });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'tool/result');
  assert.match(calls[0][1].message.content[0].text, new RegExp(SKILL_DISABLED_MARK.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.deepEqual(calls[0][2], { surfaceOp: { op: 'replace', startSeq: 2, endSeq: 2 }, sourceEventSeqs: [2] });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].skills.length, 0);
});

test('keeps an enabled skill untouched', async () => {
  const calls = []; const saved = [];
  const session = { header: { agentPreset: 'deep-ptc' }, surface: { nodes: [2] }, eventAt: () => event, append: (...args) => calls.push(args) };
  await releaseSkillResults({ logger: { warn() {} } }, { stateOf: () => state(true) }, (_session, next) => saved.push(next), { session });
  assert.equal(calls.length, 0);
  assert.equal(saved.length, 0);
});

test('a PTC-only skill row is dropped without an append', async () => {
  const calls = []; const saved = [];
  const ptc = { v: 1, turn: 2, phase: 'running', skills: [{ name: 'research', description: 'Search',
    enabled: false, loadedTurn: 1, source: 'ptc', callId: '', seqs: [] }], committed: { research: false }, descriptions: {} };
  const session = { header: { agentPreset: 'deep-ptc' }, surface: { nodes: [] }, eventAt: () => event, append: (...args) => calls.push(args) };
  await releaseSkillResults({ logger: { warn() {} } }, { stateOf: () => ptc }, (_session, next) => saved.push(next), { session });
  assert.equal(calls.length, 0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].skills.length, 0);
});

test('a non-Deep-PTC session is never inspected or mutated', async () => {
  const calls = []; const saved = [];
  const session = { header: { agentPreset: 'standard' }, surface: { nodes: [2] }, eventAt: () => event,
    append: (...args) => calls.push(args) };
  await releaseSkillResults({ logger: { warn() {} } }, { stateOf: () => state(false) }, (_session, next) => saved.push(next), { session });
  assert.equal(calls.length, 0);
  assert.equal(saved.length, 0);
});

test('a compacted or missing result is removed without an append', async () => {
  const calls = []; const saved = [];
  const session = { header: { agentPreset: 'deep-ptc' }, surface: { nodes: [] }, eventAt: () => event, append: (...args) => calls.push(args) };
  await releaseSkillResults({ logger: { warn() {} } }, { stateOf: () => state(false) }, (_session, next) => saved.push(next), { session });
  assert.equal(calls.length, 0);
  assert.equal(saved[0].skills.length, 0);
});
