import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

function fixture() {
  let plugin;
  const slots = new Map();
  const calls = [];
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: definition => { plugin = definition.factory(() => React); } } },
  });
  const ctx = { locale: { bind: () => key => key, register() {} }, effect: fn => fn(),
    configForms: { get() {}, whileServed: () => () => {} },
    remote: { commands: { async execute(...args) { calls.push(args); return { ok: true, value: { result: { kind: 'success' } } }; } } },
    slots: { inject: (name, callback) => callback(), register: (slot, render) => { slots.set(slot.id ?? slot.key, { slot, render }); } },
  };
  ctx.inject = (deps, callback) => callback(ctx);
  plugin.apply(ctx);
  const skill = slots.get('deep-ptc-skills');
  assert.ok(skill, 'skill card slot registered');
  return { skill, slots, calls };
}

const viewOf = state => key => key === 'agentPreset' ? 'deep-ptc' : key === 'deepPtcSkills' ? state : undefined;
const chatAt = last => selector => selector({ timeline: { turnOrder: [1, last] } });

const cardState = () => ({ v: 1, turn: 2, phase: 'idle', skills: [
  { name: 'office', description: 'Create Office files.', enabled: true, loadedTurn: 2 },
  { name: 'research', description: 'Search the web.', enabled: false, loadedTurn: 1 },
] });

async function render(f, props) {
  let view;
  await act(async () => { view = Renderer.create(React.createElement(f.skill.render, props)); });
  return view;
}

test('the skill card lives at the end of the latest turn in the conversation, not in the composer', async () => {
  const f = fixture();
  assert.equal(f.skill.slot.name, 'conversation.chat.turnTail');
  assert.deepEqual([...f.slots.values()].filter(entry => entry.slot.name === 'conversation.composer.dock').map(entry => entry.slot.id), ['deep-ptc-side'],
    'only the side card host is docked, and it draws beside the conversation');
  const injected = f.skill.slot.inject('session-A');
  const latest = await render(f, { ...injected, turn: { turn: 2 }, useChat: chatAt(2), useProjection: viewOf(cardState()) });
  assert.match(JSON.stringify(latest.toJSON()), /Create Office files\./u);
  await act(async () => latest.unmount());
  const earlier = await render(f, { ...injected, turn: { turn: 1 }, useChat: chatAt(2), useProjection: viewOf(cardState()) });
  assert.equal(earlier.toJSON(), null, 'an earlier turn never repeats the card');
  await act(async () => earlier.unmount());
});

test('skill card renders descriptions, a closing summary and switches', async () => {
  const f = fixture();
  const injected = f.skill.slot.inject('session-A');
  const view = await render(f, { ...injected, turn: { turn: 2 }, useChat: chatAt(2), useProjection: viewOf(cardState()) });
  const text = JSON.stringify(view.toJSON());
  assert.match(text, /Create Office files\./u);
  assert.match(text, /Search the web\./u);
  assert.match(text, /skillClosing/u, 'a closed skill is announced before it leaves');
  const switches = view.root.findAllByProps({ role: 'switch' });
  assert.equal(switches.length, 2);
  assert.equal(switches[0].props['aria-checked'], true);
  assert.equal(switches[1].props['aria-checked'], false);
  await act(async () => { switches[0].props.onClick(); });
  const call = f.calls.at(-1);
  assert.equal(call[0], 'session-A');
  assert.match(call[1], /^\/deep-ptc-skill-state /u);
  assert.deepEqual(JSON.parse(call[1].slice('/deep-ptc-skill-state '.length)), { action: 'set', name: 'office', enabled: false });
  assert.equal(call[2].length, 0);
  await act(async () => view.unmount());
});

test('bulk actions send one command, are disabled when they would change nothing, and the card hides while running', async () => {
  const f = fixture();
  const injected = f.skill.slot.inject('session-B');
  let view = await render(f, { ...injected, turn: { turn: 2 }, useChat: chatAt(2), useProjection: viewOf(cardState()) });
  const button = label => view.root.findAllByType('button').find(node => node.props.children === label);
  await act(async () => { button('skillCloseAll').props.onClick(); });
  assert.deepEqual(JSON.parse(f.calls.at(-1)[1].slice('/deep-ptc-skill-state '.length)), { action: 'all', enabled: false });
  await act(async () => view.unmount());

  const allOn = { ...cardState(), skills: cardState().skills.map(row => ({ ...row, enabled: true })) };
  view = await render(f, { ...injected, turn: { turn: 2 }, useChat: chatAt(2), useProjection: viewOf(allOn) });
  assert.equal(button('skillKeepAll').props.disabled, true);
  assert.equal(button('skillCloseAll').props.disabled, false);
  await act(async () => view.unmount());

  view = await render(f, { ...injected, turn: { turn: 2 }, useChat: chatAt(2), useProjection: viewOf({ ...cardState(), phase: 'running' }) });
  assert.equal(view.toJSON(), null);
  await act(async () => view.unmount());
});

test('long skill lists are folded until the user expands them', async () => {
  const f = fixture();
  const skills = Array.from({ length: 6 }, (_, index) => ({ name: `skill-${index}`, description: '', enabled: true, loadedTurn: 1 }));
  const view = await render(f, { ...f.skill.slot.inject('s'), turn: { turn: 2 }, useChat: chatAt(2),
    useProjection: viewOf({ v: 1, turn: 2, phase: 'idle', skills }) });
  assert.equal(view.root.findAllByProps({ role: 'switch' }).length, 4);
  const more = view.root.findAllByType('button').find(node => node.props.className === 'dpt-link');
  await act(async () => { more.props.onClick(); });
  assert.equal(view.root.findAllByProps({ role: 'switch' }).length, 6);
  await act(async () => view.unmount());
});

test('the card can appear after the projection becomes available without changing hook order', async () => {
  const f = fixture();
  const injected = f.skill.slot.inject('session-D');
  let state;
  const projection = key => key === 'agentPreset' ? 'deep-ptc' : key === 'deepPtcSkills' ? state : undefined;
  const props = { ...injected, turn: { turn: 2 }, useChat: chatAt(2), useProjection: projection };
  const view = await render(f, props);
  assert.equal(view.toJSON(), null);
  state = cardState();
  await act(async () => { view.update(React.createElement(f.skill.render, props)); });
  assert.equal(view.root.findAllByProps({ role: 'switch' }).length, 2);
  await act(async () => view.unmount());
});

test('non-Deep-PTC sessions never read the skill projection', async () => {
  const f = fixture();
  let skillProjectionRead = false;
  const view = await render(f, { ...f.skill.slot.inject('session-E'), turn: { turn: 2 }, useChat: chatAt(2),
    useProjection: key => {
      if (key === 'agentPreset') return 'standard';
      if (key === 'deepPtcSkills') { skillProjectionRead = true; throw new Error('must not read'); }
      return undefined;
    } });
  assert.equal(view.toJSON(), null);
  assert.equal(skillProjectionRead, false);
  await act(async () => view.unmount());
});

test('the card is empty without skills, and a broken projection is not hidden as "no skills"', async () => {
  const f = fixture();
  const injected = f.skill.slot.inject('session-C');
  const view = await render(f, { ...injected, turn: { turn: 0 }, useChat: chatAt(0), useProjection: viewOf({ v: 1, turn: 0, phase: 'idle', skills: [] }) });
  assert.equal(view.toJSON(), null);
  await act(async () => view.unmount());
  const throwing = key => {
    if (key === 'agentPreset') return 'deep-ptc';
    if (key === 'deepPtcSkills') throw new Error('unavailable');
    return undefined;
  };
  assert.throws(() => Renderer.create(React.createElement(f.skill.render, { ...injected, turn: { turn: 0 }, useChat: chatAt(0), useProjection: throwing })), /unavailable/u);
});

test('the session bridge renders nothing visible and reads only the preset for other modes', async () => {
  const f = fixture();
  const bridge = f.slots.get('deep-ptc-session');
  assert.equal(bridge.slot.name, 'conversation.session.header.actions');
  let sessionsRead = false;
  let view;
  await act(async () => { view = Renderer.create(React.createElement(bridge.render, { sessionId: 'other',
    useProjection: key => key === 'agentPreset' ? 'standard' : assert.fail(`read ${key}`),
    useSessionStatus: select => select(new Map()),
    useSessions: () => { sessionsRead = true; return {}; } })); });
  const json = view.toJSON();
  assert.equal(json.props.hidden, true, 'only the hidden marker is rendered');
  assert.equal(sessionsRead, false, 'other modes never read the subagent catalog');
  await act(async () => view.unmount());
});

test('a failing bridge leaves the conversation header intact', async () => {
  const f = fixture();
  const bridge = f.slots.get('deep-ptc-session');
  const warn = console.warn;
  const error = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    let view;
    await act(async () => { view = Renderer.create(React.createElement(bridge.render, { sessionId: 'deep',
      useProjection: () => 'deep-ptc', useSessionStatus: () => { throw new Error('status unavailable'); } })); });
    assert.equal(view.toJSON(), null);
    await act(async () => view.unmount());
  } finally {
    console.warn = warn;
    console.error = error;
  }
});

test('a skill switch leaves no command row in the conversation, but a failed switch is still shown', async () => {
  const f = fixture();
  const row = f.slots.get('deep-ptc-skill-state');
  assert.equal(row.slot.name, 'conversation.chat.commandview');
  let view;
  await act(async () => { view = Renderer.create(React.createElement(row.render, {
    node: { name: 'deep-ptc-skill-state', outcome: { kind: 'success', text: 'Skill card updated' } } })); });
  const hidden = view.toJSON();
  assert.equal(hidden.props.hidden, true);
  assert.equal(hidden.props['data-dpt-hidden-command'], 'deep-ptc-skill-state');
  assert.doesNotMatch(JSON.stringify(hidden), /Skill card updated/u);
  await act(async () => view.update(React.createElement(row.render, { node: { name: 'deep-ptc-skill-state', outcome: null } })));
  assert.equal(view.toJSON().props.hidden, true, 'a running switch is not shown either');
  await act(async () => view.update(React.createElement(row.render, {
    node: { name: 'deep-ptc-skill-state', outcome: { kind: 'error', text: 'No conversation is active' } } })));
  assert.match(JSON.stringify(view.toJSON()), /No conversation is active/u);
  await act(async () => view.unmount());
  assert.equal(f.slots.has('deep-ptc-reset-tools'), false, 'the explicit reset keeps its host row');
});
