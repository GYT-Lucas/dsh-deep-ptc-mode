import test from 'node:test';
import assert from 'node:assert/strict';
import template from '../lib/preset.json' with { type: 'json' };
import { availableEnvironments, resolveEnvironment, shellArgv, assertExecutionPolicy, configuredPreset, normalizeDistribution } from '../lib/model.mjs';
import { presetLifecycle } from '../lib/lifecycle.mjs';
import { checkCompatibility, parsePreset, check } from '../scripts/check.mjs';
import { readFileSync } from 'node:fs';

test('auto selects the host native shell without guessing the existing root provider', () => {
  assert.equal(resolveEnvironment('auto', 'win32'), 'powershell');
  assert.equal(resolveEnvironment('auto', 'darwin'), 'zsh');
  assert.equal(resolveEnvironment('auto', 'linux'), 'bash');
  assert.throws(() => resolveEnvironment('wsl', 'darwin'), /unavailable/);
  assert.throws(() => resolveEnvironment('bash', 'win32'), /unavailable/);
  assert.throws(() => resolveEnvironment('unknown', 'win32'), /unavailable/);
});

test('WSL keeps command text and host cwd as distinct argv, including spaces and quotes', () => {
  const spec = { workdir: 'C:\\project with spaces\\中文', command: 'printf "%s\\n" "$HOME"; echo \'hello\'' };
  assert.deepEqual(shellArgv('wsl', spec, ' Ubuntu ', 'win32'),
    ['wsl.exe', '--distribution', 'Ubuntu', '--cd', spec.workdir, '--exec', 'bash', '-lc', spec.command]);
  assert.deepEqual(shellArgv('wsl', spec, '', 'win32').slice(0, 2), ['wsl.exe', '--cd']);
  assert.throws(() => normalizeDistribution('Ubuntu\nother'), /control/);
  assert.throws(() => normalizeDistribution(' --exec'), /dash/);
});

test('WSL fails before execution in confined or missing policies', () => {
  assertExecutionPolicy('wsl', { mode: 'danger-full-access' });
  for (const mode of ['read-only', 'workspace-write', 'unknown'])
    assert.throws(() => assertExecutionPolicy('wsl', { mode }), /No command was executed/);
  assert.throws(() => assertExecutionPolicy('wsl'), /No command was executed/);
  assert.doesNotThrow(() => assertExecutionPolicy('zsh', { mode: 'workspace-write' }));
});

test('macOS Zsh uses an explicit native binary and preserves source literally', () => {
  const spec = { command: 'print -r -- "$ZSH_VERSION"', workdir: '/tmp/project' };
  assert.deepEqual(shellArgv('zsh', spec, '', 'darwin'), ['/bin/zsh', '-lc', spec.command]);
  assert.deepEqual(shellArgv('zsh', spec, '', 'linux'), ['zsh', '-lc', spec.command]);
});

test('environment selection isolates executors and leaves template and all other tools intact', () => {
  const before = structuredClone(template);
  for (const platform of ['win32', 'darwin', 'linux']) for (const environment of availableEnvironments(platform)) {
    const preset = configuredPreset(template, { environment, wslDistribution: 'Ubuntu' }, platform);
    const group = preset.plugins.find(row => row.id === 'execution');
    assert.deepEqual(group.isolate, { shell: true });
    assert.equal(group.config.filter(row => row.id.startsWith('tool-')).length, 1);
    if (resolveEnvironment(environment, platform) === 'powershell')
      assert.equal(group.config[0].name, '@deepseek-ai/dsh-pwsh-sandbox');
  }
  assert.deepEqual(template, before);
});

test('compatibility check catches official plan/tool drift, even when the YAML remains valid', () => {
  const upstream = parsePreset(readFileSync(new URL('fixtures/ptc-0.2.1-rc.5.patch.yml', import.meta.url), 'utf8'));
  checkCompatibility(template, upstream);
  upstream.plugins.find(row => row.id === 'tool-web').config.fetch = false;
  assert.throws(() => checkCompatibility(template, upstream), /composition changed/);
});

test('registry updates serialize and retain captured per-session definitions', async () => {
  const live = new Map();
  const retired = [];
  let environment = 'wsl';
  const lifecycle = presetLifecycle(async definition => {
    assert.equal(live.has(definition.id), false);
    live.set(definition.id, definition);
    return async () => { retired.push(definition); live.delete(definition.id); };
  }, () => configuredPreset(template, { environment, wslDistribution: 'Ubuntu' }, 'win32'), () => {});
  await lifecycle.refresh();
  const existingSessionDefinition = live.get('deep-ptc');
  environment = 'powershell';
  await Promise.all([lifecycle.refresh(), lifecycle.refresh()]);
  assert.equal(live.get('deep-ptc').plugins.find(row => row.id === 'execution').config[0].name,
    '@deepseek-ai/dsh-pwsh-sandbox');
  assert.equal(existingSessionDefinition.plugins.find(row => row.id === 'execution').config[0].config.environment, 'wsl');
  assert.ok(retired.includes(existingSessionDefinition));
  environment = 'invalid';
  await assert.rejects(lifecycle.refresh(), /unavailable/);
  assert.ok(live.has('deep-ptc'));
  await lifecycle.dispose();
  assert.equal(live.size, 0);
});

test('teardown during asynchronous registration releases the late definition exactly once', async () => {
  let complete;
  let markStarted;
  let releases = 0;
  const started = new Promise(resolve => { complete = resolve; });
  const registrationStarted = new Promise(resolve => { markStarted = resolve; });
  const lifecycle = presetLifecycle(() => { markStarted(); return started; }, () => ({ id: 'deep-ptc' }), () => {});
  const refresh = lifecycle.refresh();
  await registrationStarted;
  const disposal = lifecycle.dispose();
  complete(async () => { releases++; });
  await Promise.all([refresh, disposal]);
  assert.equal(releases, 1);
});

test('package and verified fixture checks pass', () => {
  assert.equal(check().version, '1.4.0');
});
