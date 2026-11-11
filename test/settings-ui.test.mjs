import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

function setup(platform, localeId, presetEntries = new Map()) {
  let plugin;
  let Card;
  let snapshot = { status: 'ready', writable: true, revision: 4,
    value: { environment: 'auto', wslDistribution: '', hostPlatform: platform } };
  const listeners = new Set();
  const localeListeners = new Set();
  let revision = 0;
  let dictionaries;
  const writes = [];
  const form = {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    async mutate(ops, revision) {
      writes.push({ ops, revision });
      snapshot = { ...snapshot, revision: snapshot.revision + 1,
        value: { ...snapshot.value, ...Object.fromEntries(ops.map(op => [op.path[0], op.value])) } };
      for (const listener of listeners) listener();
      return true;
    },
  };
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: definition => { plugin = definition.factory(name => {
      assert.ok(name === 'react' || name === 'react-dom', name); return React;
    }); } } },
  });
  const ctx = {
    locale: {
      bind: () => key => dictionaries?.[localeId]?.[key] ?? key,
      register: (_, value) => { dictionaries = value; return () => {}; },
      getSnapshot: () => ({ revision }),
      subscribe(listener) { localeListeners.add(listener); return () => localeListeners.delete(listener); },
    },
    effect: callback => callback(),
    configForms: { get: () => form, whileServed: (_, register) => register(new Set(['deep-ptc-settings'])) },
    slots: {
      inject: (_, register) => register(),
      entries: name => presetEntries.get(name) ?? [],
      entriesOfSlot: name => presetEntries.get(name) ?? [],
      subscribe: () => () => {},
      register(slot, component) {
        if (slot.name === 'plugins.item') Card = component;
        if (presetEntries.has(slot.name)) {
          const { locale, inject, ...options } = slot;
          presetEntries.get(slot.name).push({ locale, inject, options, component });
        }
        return () => {};
      },
    },
  };
  plugin.apply(ctx);
  return { Card, form, writes, setSnapshot: value => { snapshot = value; for (const listener of listeners) listener(); },
    setLocale: id => { localeId = id; revision++; for (const listener of localeListeners) listener(); } };
}

test('settings follow DSH language changes while keeping the form and its saved status', async () => {
  const fixture = setup('win32', 'en');
  let view;
  await act(async () => { view = Renderer.create(React.createElement(fixture.Card, { view: 'config' })); });
  try {
    assert.match(JSON.stringify(view.toJSON()), /Execution environment/u);
    await act(async () => view.root.findByType('select').props.onChange({ target: { value: 'wsl' } }));
    await act(async () => view.root.findByProps({ id: 'deep-ptc-distribution' }).props.onChange({ target: { value: 'Ubuntu' } }));
    await act(async () => fixture.setLocale('zh'));
    assert.match(JSON.stringify(view.toJSON()), /执行环境/u);
    assert.equal(view.root.findByProps({ id: 'deep-ptc-distribution' }).props.value, 'Ubuntu');
    assert.equal(fixture.writes.length, 0);
    await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.match(JSON.stringify(view.toJSON()), /已保存/u);
    await act(async () => fixture.setLocale('en'));
    assert.match(JSON.stringify(view.toJSON()), /Saved. New sessions/u);
    assert.equal(fixture.writes.length, 1);
  } finally {
    await act(async () => view.unmount());
  }
});

test('DSH preset surfaces translate only the Deep PTC display copy and keep the real selection ID', async () => {
  const row = { id: 'deep-ptc', name: '深度PTC模式', description: '原描述 当前环境：wsl (Ubuntu)' };
  const official = { id: 'ptc', name: 'Official PTC', description: 'Official description' };
  const snapshot = { options: [official, row] };
  const picks = [];
  const specs = [
    ['conversation.hero.agentPreset', undefined, 'useAgentPresetSeat', 'options'],
    ['conversation.session.header.actions', 'agent-preset', 'useAgentPresets', 'options'],
  ];
  const entries = new Map(specs.map(([name, id, hook, field]) => [name, [{
    options: { id }, locale: 'settings.agentPreset',
    inject: () => ({ select: preset => picks.push(preset) }),
    component: props => React.createElement('div', null,
      ...props[hook](state => state[field]).map(preset => React.createElement('button',
        { key: preset.id, title: preset.description, onClick: () => props.select(preset.id) }, preset.name))),
  }]]));
  const fixture = setup('win32', 'en', entries);
  const views = [];
  try {
    for (const [name, , hook] of specs) {
      const [base, localized] = entries.get(name);
      assert.equal(localized.options.priority, -1);
      assert.equal(localized.inject, base.inject);
      await act(async () => views.push(Renderer.create(React.createElement(localized.component,
        { ...localized.inject(), [hook]: select => select(snapshot) }))));
    }
    for (const view of views) {
      const buttons = view.root.findAllByType('button');
      assert.equal(buttons[0].props.children, 'Official PTC');
      assert.equal(buttons[1].props.children, 'Deep PTC Mode');
      assert.match(buttons[1].props.title, /Current environment: WSL \(Ubuntu\)/u);
    }
    await act(async () => views[0].root.findAllByType('button')[1].props.onClick());
    assert.deepEqual(picks, ['deep-ptc']);
    await act(async () => fixture.setLocale('zh'));
    for (const view of views) {
      const buttons = view.root.findAllByType('button');
      assert.equal(buttons[0].props.children, 'Official PTC');
      assert.equal(buttons[1].props.children, '深度 PTC 模式');
      assert.match(buttons[1].props.title, /当前环境：WSL \(Ubuntu\)/u);
    }
    assert.deepEqual(row, { id: 'deep-ptc', name: '深度PTC模式', description: '原描述 当前环境：wsl (Ubuntu)' });
  } finally {
    await act(async () => { for (const view of views) view.unmount(); });
  }
});

test('the safe-mode suffix still translates on the remaining preset surfaces', async () => {
  const row = { id: 'deep-ptc', name: '深度PTC模式', description: '原描述 当前为安全模式' };
  const official = { id: 'ptc', name: 'Official PTC', description: 'Official description' };
  const snapshot = { options: [official, row] };
  const specs = [
    ['conversation.hero.agentPreset', undefined, 'useAgentPresetSeat', 'options'],
    ['conversation.session.header.actions', 'agent-preset', 'useAgentPresets', 'options'],
  ];
  const entries = new Map(specs.map(([name, id, hook, field]) => [name, [{
    options: { id }, locale: 'settings.agentPreset',
    inject: () => ({ select: () => {} }),
    component: props => React.createElement('div', null,
      ...props[hook](state => state[field]).map(preset => React.createElement('button',
        { key: preset.id, title: preset.description }, preset.name))),
  }]]));
  const fixture = setup('win32', 'en', entries);
  const views = [];
  try {
    for (const [name, , hook] of specs) {
      const [, localized] = entries.get(name);
      await act(async () => views.push(Renderer.create(React.createElement(localized.component,
        { ...localized.inject(), [hook]: select => select(snapshot) }))));
    }
    for (const view of views) {
      const buttons = view.root.findAllByType('button');
      assert.equal(buttons[1].props.children, 'Deep PTC Mode');
      assert.match(buttons[1].props.title, /Safe mode is active/u);
    }
    await act(async () => fixture.setLocale('zh'));
    for (const view of views) {
      const buttons = view.root.findAllByType('button');
      assert.equal(buttons[1].props.children, '深度 PTC 模式');
      assert.match(buttons[1].props.title, /当前为安全模式/u);
    }
  } finally {
    await act(async () => { for (const view of views) view.unmount(); });
  }
});

test('Windows settings save WSL and distribution atomically through the revisioned host form', async () => {
  const fixture = setup('win32');
  let view;
  await act(async () => { view = Renderer.create(React.createElement(fixture.Card, { view: 'config' })); });
  const options = view.root.findAllByType('option');
  assert.equal(options.find(option => option.props.value === 'zsh').props.disabled, true);
  assert.equal(options.find(option => option.props.value === 'wsl').props.disabled, false);
  await act(async () => { view.root.findByType('select').props.onChange({ target: { value: 'wsl' } }); });
  await act(async () => { view.root.findByProps({ id: 'deep-ptc-distribution' }).props.onChange({ target: { value: ' Ubuntu ' } }); });
  await act(async () => { await view.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.writes[0].revision, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.writes[0].ops)), [
    { op: 'set', path: ['environment'], value: 'wsl' },
    { op: 'set', path: ['wslDistribution'], value: 'Ubuntu' },
    { op: 'set', path: ['shellExecutable'], value: '' },
  ]);
  await act(async () => { view.unmount(); });
});

test('PowerShell can select a discovered executable without writing the discovery list', async () => {
  const fixture = setup('win32');
  fixture.setSnapshot({ status: 'ready', writable: true, revision: 4, value: {
    environment: 'powershell', wslDistribution: '', hostPlatform: 'win32', shellExecutable: '',
    shellChoices: [{ id: 'path:C:\\PowerShell\\7\\pwsh.exe', label: 'PowerShell 7', path: 'C:\\PowerShell\\7\\pwsh.exe', family: 'powershell' }],
  } });
  let view;
  await act(async () => { view = Renderer.create(React.createElement(fixture.Card, { view: 'config' })); });
  assert.equal(view.root.findAllByProps({ id: 'deep-ptc-plugin-lab' }).length, 0);
  const shell = view.root.findByProps({ id: 'deep-ptc-shell' });
  assert.equal(shell.props.value, '');
  await act(async () => { shell.props.onChange({ target: { value: 'path:C:\\PowerShell\\7\\pwsh.exe' } }); });
  await act(async () => { await view.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.writes[0].ops)).map(op => op.path[0]), ['environment', 'wslDistribution', 'shellExecutable']);
  assert.equal(fixture.writes[0].ops[2].value, 'path:C:\\PowerShell\\7\\pwsh.exe');
  assert.equal(fixture.writes[0].ops.some(op => op.path[0] === 'shellChoices'), false);
  await act(async () => { view.unmount(); });
});

test('macOS offers native Zsh and Bash, and excludes Windows-only selections', async () => {
  const fixture = setup('darwin');
  let view;
  await act(async () => { view = Renderer.create(React.createElement(fixture.Card, { view: 'config' })); });
  const options = view.root.findAllByType('option');
  assert.equal(options.find(option => option.props.value === 'wsl').props.disabled, true);
  assert.equal(options.find(option => option.props.value === 'powershell').props.disabled, true);
  assert.equal(options.find(option => option.props.value === 'zsh').props.disabled, false);
  assert.equal(options.find(option => option.props.value === 'bash').props.disabled, false);
  await act(async () => { view.unmount(); });
});

test('a stale draft keeps its original revision fence when another window updates settings', async () => {
  const fixture = setup('win32');
  let view;
  await act(async () => { view = Renderer.create(React.createElement(fixture.Card, { view: 'config' })); });
  await act(async () => { view.root.findByType('select').props.onChange({ target: { value: 'powershell' } }); });
  await act(async () => { fixture.setSnapshot({ status: 'ready', writable: true, revision: 8,
    value: { environment: 'wsl', wslDistribution: 'Ubuntu', hostPlatform: 'win32' } }); });
  await act(async () => { await view.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.equal(fixture.writes[0].revision, 4);
  await act(async () => { view.unmount(); });
});
