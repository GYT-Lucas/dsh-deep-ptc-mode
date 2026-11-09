import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

// Values built inside the vm realm are compared as plain JSON.
const plain = value => JSON.parse(JSON.stringify(value));

// A conversation region wide enough to dock the side card, in a document that has nothing else.
function fakeDocument() {
  const region = {
    getBoundingClientRect: () => ({ top: 0, bottom: 800, left: 0, right: 1200, width: 1200, height: 800 }),
    closest: () => region, querySelector: () => null, toggleAttribute() {}, removeAttribute() {},
  };
  return { querySelectorAll: () => [region], querySelector: selector => selector.includes('main.conversation') ? region : null, body: {} };
}

function fixture({ snapshot, mutate = async () => true, outcome = { ok: true, value: { commandId: 'c', result: { kind: 'success' } } } } = {}) {
  let plugin;
  const slots = new Map();
  const writes = [];
  const calls = [];
  let current = snapshot;
  const listeners = new Set();
  const form = snapshot === undefined ? undefined : {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => current,
    async mutate(ops, revision) {
      writes.push({ ops, revision });
      const ok = await mutate(ops, revision);
      if (ok) {
        current = { ...current, revision: current.revision + 1, value: { ...current.value, ...Object.fromEntries(ops.map(op => [op.path[0], op.value])) } };
        for (const listener of listeners) listener();
      }
      return ok;
    },
  };
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: definition => {
      plugin = definition.factory(name => name === 'react-dom' ? { createPortal: node => node } : React);
    } }, innerWidth: 1200, addEventListener() {}, removeEventListener() {} },
    document: fakeDocument(), setInterval, clearInterval, setTimeout, clearTimeout, URLSearchParams,
  });
  const ctx = { locale: { bind: () => key => key, register() {} }, effect: () => {},
    configForms: { get: () => form, whileServed: () => () => {} },
    remote: { commands: { async execute(...args) { calls.push(args); return outcome; } } },
    slots: { inject: (name, callback) => callback(), register: (slot, render) => { slots.set(slot.id ?? slot.key, { slot, render }); } },
  };
  ctx.inject = (deps, callback) => { assert.deepEqual(Array.from(deps), ['remote', 'remote.commands']); callback(ctx); };
  plugin.apply(ctx);
  return { slots, card: slots.get('deep-ptc-side'), writes, calls };
}

const windows = (value = {}) => ({ status: 'ready', writable: true, revision: 7, value: {
  environment: 'powershell', wslDistribution: '', shellExecutable: 'pwsh-7', hostPlatform: 'win32',
  shellChoices: [{ id: 'pwsh-7', label: 'PowerShell 7', path: 'C:/pwsh.exe', family: 'powershell' }], ...value } });
const noTools = { v: 1, epoch: 0, blocked: [], report: null };

// Render the side card of one Deep PTC session and unmount it even when an assertion fails,
// so the card's timers never keep the process alive.
async function withCard(f, { sessions = {}, tools = noTools, preset = 'deep-ptc', sessionId = 'deep' } = {}, body) {
  const injected = f.card.slot.inject(sessionId);
  let view;
  await act(async () => { view = Renderer.create(React.createElement(f.card.render, { ...injected, sessionId,
    useProjection: key => key === 'agentPreset' ? preset : key === 'deepPtcTools' ? tools : undefined,
    useSessionStatus: select => select(new Map()), useSessions: select => select(sessions) })); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  try { await body(view); } finally { await act(async () => view.unmount()); }
}
const radios = view => view.root.findAllByProps({ role: 'radio' });
const checked = view => radios(view).find(node => node.props['aria-checked']).props.children;
const text = view => JSON.stringify(view.toJSON());

test('the side card holds the environment switch and tool state', async () => {
  const f = fixture({ snapshot: windows() });
  // The composer dock hosts the card because its projection hook carries every session projection;
  // the card itself is drawn beside the conversation through a portal.
  assert.equal(f.card.slot.name, 'conversation.composer.dock');
  assert.deepEqual([...f.slots.values()].filter(entry => entry.slot.name === 'conversation.composer.dock').map(entry => entry.slot.id), ['deep-ptc-side']);
  await withCard(f, {}, async view => {
    assert.deepEqual(radios(view).map(node => node.props.children), ['envAuto', 'WSL', 'PowerShell']);
    assert.equal(checked(view), 'PowerShell');
    assert.match(text(view), /envForNew/u, 'the card says the switch applies to new sessions');
    assert.ok(view.root.findAllByType('button').some(node => node.props.children === 'toolReset'));
    assert.equal(view.root.findAllByProps({ className: 'dpt-agent' }).length, 0);
  });
});

test('switching environment writes the host form at its current revision and drops a shell of another family', async () => {
  const f = fixture({ snapshot: windows() });
  await withCard(f, {}, async view => {
    await act(async () => { radios(view).find(node => node.props.children === 'WSL').props.onClick(); });
    assert.deepEqual(plain(f.writes.at(-1)), { ops: [
      { op: 'set', path: ['environment'], value: 'wsl' }, { op: 'set', path: ['shellExecutable'], value: '' }], revision: 7 });
    assert.equal(checked(view), 'WSL');
    assert.match(text(view), /envSaved/u);
    // WSL selects a distribution; the field saves only a changed value.
    await act(async () => { view.root.findByProps({ className: 'dpt-input' }).props.onChange({ target: { value: ' Ubuntu ' } }); });
    await act(async () => { await view.root.findByProps({ className: 'dpt-field' }).props.onSubmit({ preventDefault() {} }); });
    assert.deepEqual(plain(f.writes.at(-1)), { ops: [{ op: 'set', path: ['wslDistribution'], value: 'Ubuntu' }], revision: 8 });
  });
});

test('choosing the current environment writes nothing, and a rejected write is reported', async () => {
  const f = fixture({ snapshot: windows(), mutate: async () => false });
  await withCard(f, {}, async view => {
    await act(async () => { radios(view).find(node => node.props.children === 'PowerShell').props.onClick(); });
    assert.equal(f.writes.length, 0);
    await act(async () => { radios(view).find(node => node.props.children === 'envAuto').props.onClick(); });
    assert.deepEqual(plain(f.writes.map(write => write.ops)), [[{ op: 'set', path: ['environment'], value: 'auto' }]],
      'auto on Windows still resolves to PowerShell, so the PowerShell choice stays');
    assert.match(text(view), /envFailed/u);
    assert.equal(checked(view), 'PowerShell');
  });
});

test('a read-only form shows the environment without allowing a switch', async () => {
  const f = fixture({ snapshot: { ...windows(), writable: false } });
  await withCard(f, {}, async view => {
    assert.ok(radios(view).every(node => node.props.disabled));
    assert.match(text(view), /readOnly/u);
  });
});

test('subagents are listed between the environment and the tool state, following the official catalog', async () => {
  const f = fixture({ snapshot: windows({ hostPlatform: 'darwin', environment: 'auto', shellChoices: [] }) });
  const sessions = { projectionsBySession: { deep: { values: { subagentCatalog: [
    { id: 'child-1', label: 'Research', mode: 'continuable', activity: 'running' },
    { id: 'child-2', label: 'Report', mode: 'one-shot', activity: 'inactive' },
    { id: 'child-3', label: 'Live', mode: 'one-shot', activity: 'inactive' }] } } },
  byId: { 'child-3': { running: true }, 'child-2': { projectionValues: { subagentTiming: { settledMs: 75_000, lastTurnCompleted: true },
    tokenUsage: { uncachedInputTokens: 1000, outputTokens: 500, cacheReadTokens: 10_000, cacheWriteTokens: 0 } } } } };
  await withCard(f, { sessions }, async view => {
    assert.deepEqual(radios(view).map(node => node.props.children), ['envAuto', 'Zsh', 'Bash']);
    assert.match(text(view), /envAutoNow/u);
    const rows = view.root.findAllByProps({ className: 'dpt-agent' });
    assert.deepEqual(rows.map(node => node.props['data-state']), ['running', 'completed', 'running'],
      'a stale catalog entry still runs when the session list says so');
    assert.match(text(view), /agentCompleted · durationMinutes · tokens/u, 'a finished row shows its duration and tokens');
    const sections = view.root.findAllByType('section').map(node => node.props['aria-label']);
    assert.deepEqual(sections, ['environment', 'agentsTitle', 'toolsSection']);
  });
});

test('the reload button resets only the current conversation through the host command and lists failed tools', async () => {
  const f = fixture({ snapshot: windows() });
  await withCard(f, { sessionId: 'session-A', tools: { ...noTools, report: { tools: [{ name: 'bad_tool', provider: 'example-plugin' }] } } }, async view => {
    assert.match(text(view), /bad_tool/u);
    assert.match(text(view), /example-plugin/u);
    const reload = view.root.findAllByType('button').find(node => node.props.children === 'toolReset');
    await act(async () => { await reload.props.onClick(); });
    assert.deepEqual(plain(f.calls), [['session-A', '/deep-ptc-reset-tools', []]]);
    assert.match(text(view), /toolResetDone/u);
  });
});

test('a denied reset is shown as a failure; the card never claims success', async () => {
  const f = fixture({ snapshot: windows(), outcome: { ok: false, error: { code: 'access-denied', message: 'access denied' } } });
  await withCard(f, {}, async view => {
    await act(async () => { await view.root.findAllByType('button').find(node => node.props.children === 'toolReset').props.onClick(); });
    assert.match(text(view), /toolResetFailed/u);
    assert.doesNotMatch(text(view), /toolResetDone/u);
  });
});

test('without settings or a readable tool state the card keeps the reload button and shows what it has', async () => {
  const f = fixture({ snapshot: undefined });
  await withCard(f, { tools: null }, async view => {
    assert.equal(radios(view).length, 0, 'no settings form, no environment switch');
    assert.ok(view.root.findAllByType('button').some(node => node.props.children === 'toolReset'), 'the reset command does not need the projection');
    assert.doesNotMatch(text(view), /toolFailures/u);
    assert.equal(f.calls.length, 0);
  });
});

test('other modes get neither the side card nor the tool controls', async () => {
  const f = fixture({ snapshot: windows() });
  await withCard(f, { preset: 'standard' }, async view => {
    assert.equal(view.toJSON(), null);
    assert.equal(radios(view).length, 0);
    assert.equal(f.calls.length, 0);
  });
});

test('the running composer glow is not overridden by the focus style, and a running subagent\'s status square flashes', () => {
  const css = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  // An !important box-shadow beats an animation, so the focus rule must step aside while the agent works.
  assert.match(css, /\$\{ON\}:not\(\[data-dpt-busy\]\) \[data-dpt-composer\]:focus-within\{box-shadow:/u);
  assert.match(css, /\$\{ON\}\[data-dpt-busy\] \[data-dpt-composer\]\{[^}]*animation:dpt-breathe/u);
  // Only the small status square of a running subagent flashes; the row has no glow of its own.
  assert.match(css, /\.dpt-agent\[data-state="running"\] \.dpt-agent-dot[^{]*\{[^}]*animation:dpt-dot-flash/u);
  assert.doesNotMatch(css, /\.dpt-agent\[data-state="running"\]\{/u);
  assert.match(css, /prefers-reduced-motion:reduce\)\{[^}]*\.dpt-agent-dot/u, 'reduced motion turns the flashing off');
});
