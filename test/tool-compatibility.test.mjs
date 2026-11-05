import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompatibilityState, classifyToolOutcome, markOfficialTool, isOfficialTool, installToolCompatibility, normalizePreferences } from '../lib/tool-policy.mjs';
import { blankState, foldToolState, STATE_EVENT, searchCatalog } from '../lib/tool-catalog.mjs';
import { deriveDeepPtc } from '../lib/model.mjs';
import snapshot from '../lib/preset.json' with { type: 'json' };
const def = (name, description = name) => ({ name, description, parameters: { type: 'object' }, output: { schema: {} } });
function setup() {
  const official = markOfficialTool(def('read', 'Read files'), 'installed official module');
  const extension = { ...def('better_read', 'Read files quickly'), deepPtc: { provider: 'example-plugin' } };
  const live = new Map([[official.name, official], [extension.name, extension]]);
  const tools = { get: (name, agent, admitted) => !admitted || admitted.has(name) ? live.get(name) : undefined,
    definitions: (agent, admitted) => [...live.values()].filter(d => !admitted || admitted.has(d.name)) };
  const session = {}, agent = { session }, logs = [];
  let durable = blankState();
  const storage = { read: s => s === session ? durable : blankState(), write: (s, state) => { assert.equal(s, session); logs.push(state); durable = state; } };
  const state = createCompatibilityState(tools, [], storage);
  const call = (name = extension.name) => { const exec = { name, agent }; state.dispatched(exec); return exec; };
  return { state, tools, agent, session, live, official, extension, call, storage, logs };
}
test('one failed extension is blocked for this conversation until an explicit reset', () => {
  const f = setup(), exec = f.call();
  f.state.observe(exec, { isError: true });
  assert.match(f.state.guard(f.call()), /quarantined/);
  assert.equal(f.state.guard({ name: 'better_read', agent: { session: {} } }), undefined);
  assert.equal(f.state.guard(f.call('read')), undefined);
  f.state.observe(exec, { isError: false, value: 'late success' });
  assert.match(f.state.guard(f.call()), /quarantined/);
  assert.match(f.state.text({ scope: f.agent }), /no retries or diagnosis/);
  assert.match(f.state.text({ scope: f.agent }), /example-plugin/);
  assert.equal(f.state.reset(f.agent), 1);
  assert.equal(f.state.guard(f.call()), undefined);
});
test('provenance is captured before a reload and no new provider is blamed for an old call', () => {
  const f = setup(), exec = f.call();
  f.live.set('better_read', { ...def('better_read'), deepPtc: { provider: 'new-plugin' } });
  f.state.observe(exec, { isError: true });
  assert.equal(f.state.status(f.agent).blocked[0].provider, 'example-plugin');
  assert.match(f.state.guard(f.call()), /quarantined/); // Only the user's reset lifts the logical-name block.
});
test('late failure after user reset cannot recreate a quarantine mark', () => {
  const f = setup(), old = f.call();
  f.state.reset(f.agent);
  f.state.observe(old, { isError: true });
  assert.equal(f.state.status(f.agent).blocked.length, 0);
});
test('session state survives agent recreation and plugin recreation, without probing', () => {
  const f = setup();
  f.state.observe(f.call(), { isError: true });
  const restored = createCompatibilityState(f.tools, [], f.storage);
  assert.match(restored.guard({ name: 'better_read', agent: { session: f.session } }), /quarantined/);
  assert.equal(f.logs.length, 1);
});
test('no eviction silently re-enables a previously failed tool', () => {
  const f = setup();
  for (let i = 0; i < 24; i++) { const name = `external_${i}`; f.live.set(name, def(name)); f.state.observe(f.call(name), { isError: true }); }
  assert.equal(f.state.status(f.agent).blocked.length, 24);
  assert.match(f.state.guard(f.call('external_0')), /quarantined/);
  assert.ok(f.state.text({ scope: f.agent }).length < 1800, 'model-facing failure list is bounded');
});
test('denials, cancellation, task exit codes, empty results and background jobs do not quarantine', () => {
  const f = setup();
  for (const result of [{ isError: true, error: { code: 'PERMISSION_DENIED' } }, { isError: true, error: { code: 'INVALID_ARGUMENTS' } }, { isError: true, error: { code: 'TOOL_ABORTED' } },
    { value: { kind: 'foreground', exitCode: 1 } }, { value: { results: [] } }, { value: { status: 'partial', continuation: 'page-2' } }, { value: { kind: 'background' } }, { value: { kind: 'promoted' } }])
    f.state.observe(f.call(), result);
  f.state.observe({ name: 'better_read', agent: f.agent }, { isError: true }); // Never dispatched: guard/policy.
  assert.equal(f.state.status(f.agent).blocked.length, 0);
});
test('partial failure is quarantined, with task-state readback guidance and no diagnosis', () => {
  const f = setup();
  f.state.observe(f.call(), { value: { status: 'partial', failure: { effectState: 'partial' } } });
  assert.match(f.state.guard(f.call()), /quarantined/);
  assert.match(f.state.text({ scope: f.agent }), /necessary task state/);
});
test('official tool failures stay under the official contract', () => {
  const f = setup(); f.state.observe(f.call('read'), { isError: true });
  assert.equal(f.state.guard(f.call('read')), undefined);
  assert.equal(f.state.status(f.agent).blocked.length, 0);
});
test('search first returns extensions, then admitted official equivalents after quarantine', () => {
  const f = setup();
  assert.equal(f.state.search(f.agent, { query: 'read' }).layer, 'external');
  f.state.observe(f.call(), { isError: true });
  const result = f.state.search(f.agent, { query: 'read' });
  assert.equal(result.layer, 'official'); assert.equal(result.results[0].name, 'read');
  assert.equal(f.state.search(f.agent, { query: 'read' }, new Set()).total, 0);
});
test('schemas are disclosed only after selection; unavailable capabilities never become callable', () => {
  const f = setup();
  assert.deepEqual(f.state.sdkDefinitions(f.agent).map(d => d.name), ['read']);
  const loaded = f.state.load(f.agent, ['better_read']);
  assert.equal(loaded.loaded[0].name, 'better_read');
  assert.deepEqual(f.state.sdkDefinitions(f.agent).map(d => d.name), ['read', 'better_read']);
  f.state.reset(f.agent);
  assert.deepEqual(f.state.sdkDefinitions(f.agent).map(d => d.name), ['read']);
  assert.equal(f.state.load(f.agent, ['better_read'], new Set(['read'])).loaded.length, 0);
  f.live.set('huge', def('huge', 'x'.repeat(20000)));
  assert.equal(f.state.load(f.agent, ['huge']).loaded.length, 0, 'never truncate an executable schema');
});
test('local directory pagination is deterministic and descriptions are bounded', () => {
  const rows = Array.from({ length: 25 }, (_, i) => def(`file_${String(i).padStart(2, '0')}`, 'File search '+ 'x'.repeat(400)));
  const first = searchCatalog(rows, 'file', 0, 6), second = searchCatalog(rows, 'file', first.nextOffset, 6);
  assert.equal(first.results.length, 6); assert.equal(new Set([...first.results, ...second.results].map(r => r.name)).size, 12);
  assert.equal(first.results[0].description.length, 240);
});
test('persistent projection reports failures after the turn and clears on reset', () => {
  const saved = { ...blankState(), blocked: [{ name: 'bad', provider: 'p', kind: 'failure' }] };
  let state = foldToolState(blankState(), { type: STATE_EVENT, ignorable: true, data: saved });
  state = foldToolState(state, { type: 'turn/end', data: { turn: 4 } });
  assert.equal(state.report.tools[0].name, 'bad'); assert.equal(state.report.turn, 4);
  state = foldToolState(state, { type: STATE_EVENT, ignorable: true, data: { ...blankState(), epoch: 1 } });
  assert.equal(state.report, null);
});
test('official declarations remain the source of provenance after arbitrary module renaming', () => {
  const upstream = structuredClone(snapshot);
  upstream.plugins.find(row => row.id === 'tool-fs').name = '@vendor/renamed-file-provider';
  const derived = deriveDeepPtc(upstream, { environment: 'wsl' }, 'win32').preset;
  assert.equal(derived.plugins.find(row => row.id === 'tool-fs').config.upstream, '@vendor/renamed-file-provider');
  assert.equal(derived.plugins.find(row => row.id === 'tool-executor-ptc').name, '@deepseek-ai/dsh-tool-executor-ptc');
});
test('runtime hooks never replay, and block a second call before body dispatch', () => {
  const f = setup(), events = new Map(), guards = [];
  const ctx = { tools: { ...f.tools, guard: g => guards.push(g) }, systemPrompt: { section() {}, context() {} },
    on: (name, fn) => events.set(name, fn), effect() {} };
  installToolCompatibility(ctx);
  const exec = { name: 'better_read', agent: f.agent };
  let count = 0;
  events.get('tools/execute')(exec, () => ++count);
  events.get('tools/result')(exec, { isError: true });
  assert.match(guards[0]({ ...exec }), /quarantined/);
  events.get('tools/execute')({ ...exec }, () => ++count);
  assert.equal(count, 1);
});
test('explicit route names remain validated without an execution alias', () => {
  assert.throws(() => normalizePreferences([{ preferred: 'run_code', fallback: ['read'] }]));
  assert.equal(classifyToolOutcome({}, { value: { status: 'failed', failure: { code: 'WORKER_UNAVAILABLE' } } }).kind, 'unavailable');
  assert.ok(isOfficialTool(markOfficialTool(def('new_official_tool'), 'new module')));
});
