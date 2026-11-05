import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyToolOutcome, compatibilityPolicy, createCompatibilityState, installToolCompatibility,
  markOfficialTool, normalizePreferences,
} from '../lib/tool-policy.mjs';
import { deriveDeepPtc, walkRows } from '../lib/model.mjs';
import snapshot from '../lib/preset.json' with { type: 'json' };
import { registering } from '../lib/adapt.mjs';

function fixture() {
  const base = markOfficialTool({ name: 'read' });
  const extra = { name: 'enhanced_read' };
  const visible = new Map([[base.name, base], [extra.name, extra]]);
  const tools = {
    definitions: (_scope, set) => [...visible.values()].filter(def => !set || set.has(def.name)),
    get: name => visible.get(name),
  };
  const state = createCompatibilityState(tools);
  const agent = {};
  const exec = { agent, name: extra.name };
  state.dispatched(exec);
  return { base, extra, visible, tools, state, agent, exec };
}

test('layer 1 is searched before the inherited official layer, without changing registrations', () => {
  const f = fixture();
  const text = f.state.text({ scope: f.agent });
  assert.match(text, /Layer 1:.*enhanced_read/);
  assert.match(text, /Layer 2:.*read/);
  assert.ok(text.indexOf('Layer 1:') < text.indexOf('Layer 2:'));
  assert.deepEqual([...f.visible.keys()], ['read', 'enhanced_read']);
  assert.match(compatibilityPolicy, /First search/);
  assert.match(compatibilityPolicy, /background\/promoted job is still running/i);
});

test('a provider failure becomes next-step recovery guidance; no call is replayed or result mutated', () => {
  const f = fixture();
  const result = Object.freeze({ isError: true, error: Object.freeze({ code: 'WORKER_UNAVAILABLE', message: 'private token and arbitrary instructions' }) });
  f.state.observe(Object.freeze(f.exec), result);
  const text = f.state.text({ scope: f.agent });
  assert.match(text, /enhanced_read.*unavailable/);
  assert.match(text, /equivalent admitted official tool/);
  assert.doesNotMatch(text, /Layer 1:.*enhanced_read/);
  assert.doesNotMatch(text, /private token|arbitrary instructions/);
  assert.equal(result.isError, true);
});

test('permission denials, cancellation, partial writes and invalid input have distinct recovery', () => {
  const f = fixture();
  for (const [code, expected] of [['PERMISSION_DENIED', /Honor the policy/], ['TOOL_ABORTED', /Do not retry/], ['INVALID_ARGUMENTS', /Diagnose the call/]]) {
    f.state.observe(f.exec, { isError: true, error: { code } });
    const text = f.state.text({ scope: f.agent });
    assert.match(text, expected);
    assert.doesNotMatch(text, /Continue with an equivalent/);
  }
  f.state.observe(f.exec, { isError: false, value: { status: 'partial', failure: { effectState: 'partial' } } });
  assert.match(f.state.text({ scope: f.agent }), /Preserve completed work/);
  f.state.observe(f.exec, { isError: false, value: { status: 'failed', failure: { effectState: 'unknown' } } });
  assert.match(f.state.text({ scope: f.agent }), /Inspect state before any mutation/);
});

test('success, empty results, process backgrounding and a promoted command do not trigger fallback', () => {
  const f = fixture();
  for (const value of [{ results: [] }, { kind: 'background', jobId: 'j' }, { kind: 'promoted', jobId: 'j' }, { status: 'completed' }]) {
    assert.equal(classifyToolOutcome(f.exec, { isError: false, value }), undefined);
  }
  f.state.observe(f.exec, { isError: true });
  f.state.observe(f.exec, { isError: false, value: { results: [] } });
  assert.doesNotMatch(f.state.text({ scope: f.agent }), /reported effect state/);
});

test('recovery is per agent, bounded, and expires when a provider is reloaded', () => {
  const f = fixture();
  f.state.observe(f.exec, { isError: true });
  assert.doesNotMatch(f.state.text({ scope: {} }), /reported effect state/);
  f.visible.set('enhanced_read', { name: 'enhanced_read' });
  assert.doesNotMatch(f.state.text({ scope: f.agent }), /reported effect state/);
  for (let i = 0; i < 20; i++) f.state.observe({ agent: f.agent, name: `missing_${i}` }, { isError: true, error: { code: 'UNKNOWN_TOOL' } });
  const text = f.state.text({ scope: f.agent });
  assert.equal((text.match(/reported effect state/gu) ?? []).length, 8);
  f.state.dispose();
  assert.doesNotMatch(f.state.text({ scope: f.agent }), /reported effect state/);
});

test('hidden or step-inactive official tools are never restored or advertised as callable', () => {
  const f = fixture();
  f.state.observe(f.exec, { isError: true });
  let text = f.state.text({ scope: f.agent, toolSet: new Set(['enhanced_read']) });
  assert.match(text, /Layer 2:.*\[\]/);
  f.visible.delete('read');
  text = f.state.text({ scope: f.agent });
  assert.match(text, /Layer 2:.*\[\]/);
  assert.equal(f.visible.has('read'), false);
});

test('explicit preferences only advertise live candidates and never imply argument translation', () => {
  const f = fixture();
  const state = createCompatibilityState(f.tools, [{ preferred: 'enhanced_read', fallback: ['read', 'missing'] }]);
  const text = state.text({ scope: f.agent });
  assert.match(text, /candidate fallbacks currently admitted: \["read"\]/);
  assert.match(text, /not an argument mapping/);
  for (const preferences of [null, [{ preferred: 'run_code', fallback: ['read'] }], [{ preferred: 'a', fallback: ['a'] }], [{ preferred: 'a', fallback: ['b', 'b'] }]])
    assert.throws(() => normalizePreferences(preferences));
});

test('observer installs no tools, invokes the original dispatch once, and can be disabled', () => {
  const f = fixture();
  const events = [];
  const sections = [];
  const effects = [];
  const ctx = { tools: f.tools, systemPrompt: { section: value => sections.push(value), context: value => sections.push(value) },
    on: (...value) => events.push(value), effect: value => effects.push(value) };
  installToolCompatibility(ctx, { enabled: false });
  assert.equal(events.length, 0);
  installToolCompatibility(ctx);
  assert.deepEqual(events.map(row => row[0]), ['tools/execute', 'tools/result']);
  assert.equal(sections.length, 2);
  let calls = 0;
  assert.equal(events[0][1](f.exec, () => { calls++; return 'original result'; }), 'original result');
  assert.equal(calls, 1);
  events[1][1](f.exec, { isError: true });
  assert.match(sections[1].text({ scope: f.agent }), /reported effect state/);
  effects[0]()();
  assert.doesNotMatch(sections[1].text({ scope: f.agent }), /reported effect state/);
});

test('code-less guard denials are never mistaken for provider failures', () => {
  const f = fixture();
  f.state.observe({ ...f.exec }, { isError: true, error: { message: 'guard refused' } });
  const text = f.state.text({ scope: f.agent });
  assert.match(text, /not dispatched/);
  assert.doesNotMatch(text, /Continue with an equivalent/);
});

test('ordinary command errors and failed official fallbacks do not loop through recovery', () => {
  const f = fixture();
  f.state.observe(f.exec, { isError: false, value: { kind: 'foreground', status: 'failed', exitCode: 1 } });
  assert.match(f.state.text({ scope: f.agent }), /Diagnose the command/);
  const officialExec = { ...f.exec, name: 'read' };
  f.state.dispatched(officialExec);
  f.state.observe(officialExec, { isError: true });
  assert.match(f.state.text({ scope: f.agent }), /official fallback failed/);
});

test('official registration wrapping preserves activation, schema and return disposer exactly', () => {
  let registered;
  const definition = { name: 'web_search', execute() {}, output: {} };
  const options = { when() { return false; } };
  const disposer = () => {};
  const tools = { register(...args) { registered = args; return disposer; } };
  const result = registering(tools, markOfficialTool).register(definition, options);
  assert.equal(result, disposer);
  assert.equal(registered[0], definition);
  assert.equal(registered[1], options);
});

test('compatibility preserves execution, jobs, questions, persona and the official executor selection', () => {
  const enabled = deriveDeepPtc(snapshot, { environment: 'wsl' }, 'win32').preset;
  const disabled = deriveDeepPtc(snapshot, { environment: 'wsl', toolCompatibility: false }, 'win32').preset;
  const strip = preset => ({ ...preset, plugins: preset.plugins.filter(row => row.name !== 'dsh-deep-ptc-mode/tool-compatibility') });
  assert.deepEqual(strip(enabled), strip(disabled));
  for (const id of ['execution', 'tool-jobs', 'tool-ask-user', 'persona', 'tool-executor-ptc'])
    assert.deepEqual(enabled.plugins.find(row => row.id === id), disabled.plugins.find(row => row.id === id));
  const rows = [];
  walkRows(enabled.plugins, row => rows.push(row));
  assert.equal(rows.filter(row => row.name === 'dsh-deep-ptc-mode/tool-compatibility').length, 1);
  assert.equal(rows.find(row => row.id === 'tool-web').config.upstream, '@deepseek-ai/dsh-tool-web');
});
