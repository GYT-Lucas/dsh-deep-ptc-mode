import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

function setup(platform) {
  let plugin;
  let Card;
  let snapshot = { status: 'ready', writable: true, revision: 4,
    value: { environment: 'auto', wslDistribution: '', hostPlatform: platform } };
  const listeners = new Set();
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
      assert.equal(name, 'react'); return React;
    }); } } },
  });
  const ctx = {
    locale: { bind: () => key => key, register: () => () => {} },
    effect: callback => callback(),
    configForms: { get: () => form, whileServed: (_, register) => register(new Set(['deep-ptc-settings'])) },
    slots: { inject: (_, register) => register(), register: (_, component) => { Card = component; return () => {}; } },
  };
  plugin.apply(ctx);
  return { Card, form, writes, setSnapshot: value => { snapshot = value; for (const listener of listeners) listener(); } };
}

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
    { op: 'set', path: ['pluginLab'], value: false },
  ]);
  await act(async () => { view.unmount(); });
});

test('PowerShell can select a discovered executable, and plugin lab is saved without the discovery list', async () => {
  const fixture = setup('win32');
  fixture.setSnapshot({ status: 'ready', writable: true, revision: 4, value: {
    environment: 'powershell', wslDistribution: '', hostPlatform: 'win32', shellExecutable: '', pluginLab: false,
    shellChoices: [{ id: 'path:C:\\PowerShell\\7\\pwsh.exe', label: 'PowerShell 7', path: 'C:\\PowerShell\\7\\pwsh.exe', family: 'powershell' }],
  } });
  let view;
  await act(async () => { view = Renderer.create(React.createElement(fixture.Card, { view: 'config' })); });
  const shell = view.root.findByProps({ id: 'deep-ptc-shell' });
  assert.equal(shell.props.value, '');
  await act(async () => { shell.props.onChange({ target: { value: 'path:C:\\PowerShell\\7\\pwsh.exe' } }); });
  await act(async () => { view.root.findByProps({ id: 'deep-ptc-plugin-lab' }).props.onChange({ target: { checked: true } }); });
  await act(async () => { await view.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.writes[0].ops)).map(op => op.path[0]), ['environment', 'wslDistribution', 'shellExecutable', 'pluginLab']);
  assert.equal(fixture.writes[0].ops[2].value, 'path:C:\\PowerShell\\7\\pwsh.exe');
  assert.equal(fixture.writes[0].ops[3].value, true);
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
