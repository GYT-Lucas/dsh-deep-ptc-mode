// Two-attempt preset identity: native deep-ptc first, then the base id the caller
// actually accepts (ptc, or cordis for a creative-mode row). Creative preset
// loading must never depend on composedPreset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decidePresetId, packageProbe, installPresetCompat, inspectCaller } from '../lib/preset-compat.mjs';
import { loadCreativePreset } from '../lib/upstream.mjs';

const opts = { nativeIds: ['deep-ptc'], fallback: 'ptc' };

function fakePackage(root, name, code) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  writeFileSync(join(dir, 'lib.js'), code);
  return dir;
}

test('layer 1 keeps the native id for host, declaring and unrestricted callers', () => {
  assert.equal(decidePresetId('deep-ptc', opts, { host: true }), 'deep-ptc');
  assert.equal(decidePresetId('deep-ptc', opts, { host: false, declares: true, restricted: true }), 'deep-ptc');
  assert.equal(decidePresetId('deep-ptc', opts, { host: false, restricted: false, accepts: [] }), 'deep-ptc');
});

test('layer 2 uses the base id the restricted caller accepts', () => {
  assert.equal(decidePresetId('deep-ptc', opts, { host: false, restricted: true, accepts: ['ptc'] }), 'ptc');
  assert.equal(decidePresetId('deep-ptc', opts, { host: false, restricted: true, accepts: ['cordis'] }), 'cordis');
  assert.equal(decidePresetId('deep-ptc', opts, { host: false, restricted: true, accepts: ['cordis', 'ptc'] }), 'ptc');
  assert.equal(decidePresetId('deep-ptc', opts, { host: false, restricted: true, accepts: [] }), 'ptc');
});

test('normal ptc, creative and other presets are returned unchanged', () => {
  assert.equal(decidePresetId('ptc', opts, { host: false, restricted: true, accepts: ['cordis'] }), 'ptc');
  assert.equal(decidePresetId('cordis', opts, { host: false, restricted: true, accepts: [] }), 'cordis');
  assert.equal(decidePresetId('standard', opts, { host: false }), 'standard');
});

test('probe collects the preset ids a restricted plugin accepts', () => {
  const root = mkdtempSync(join(tmpdir(), 'deep-ptc-probe-'));
  try {
    const opsLike = fakePackage(root, 'ops-like', "export const MODE_PRESET = { ptc: 'ptc', standard: 'standard' };\n");
    const creative = fakePackage(root, 'creative-row', "export const gate = preset => preset === 'cordis';\n");
    const declares = fakePackage(root, 'declares-native', "export const PRESETS = ['deep-ptc', 'ptc'];\n");
    assert.deepEqual(packageProbe(opsLike, 'deep-ptc'), { declares: false, restricted: true, accepts: ['ptc', 'standard'] });
    assert.deepEqual(packageProbe(creative, 'deep-ptc'), { declares: false, restricted: true, accepts: ['cordis'] });
    assert.equal(packageProbe(declares, 'deep-ptc').declares, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the Cordis service proxy frame is skipped, so the real caller is classified', () => {
  const root = mkdtempSync(join(tmpdir(), 'deep-ptc-proxy-'));
  try {
    const dir = fakePackage(root, 'ops-like', "export const gate = preset => preset === 'ptc';\n");
    const stack = ['Error',
      '    at composedPreset (file:///usr/local/lib/preset-compat.mjs:1:1)',
      '    at Object.apply (file:///C:/app/app.asar/node_modules/@deepseek-ai/cordis/lib/index.js:122:36)',
      '    at presetOf (file://' + join(dir, 'lib.js') + ':1:1)',
      '    at new apply (file:///C:/app/probe/index.mjs:1:1)',
    ].join('\n');
    const info = inspectCaller(stack, 'deep-ptc');
    assert.equal(info.host, false);
    assert.equal(info.packageName, 'ops-like');
    assert.equal(info.restricted, true);
    assert.deepEqual(info.accepts, ['ptc']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('install is idempotent and dispose restores the original method', () => {
  const registry = { composedPreset() { return 'deep-ptc'; } };
  const ctx = { agentPresets: registry };
  const first = installPresetCompat(ctx, opts);
  const second = installPresetCompat(ctx, opts);
  assert.equal(first.owner, true);
  assert.equal(second.owner, false);
  assert.equal(Object.hasOwn(registry, 'composedPreset'), true);
  first.dispose();
  assert.equal(registry.composedPreset(), 'deep-ptc');
});

test('creative preset loading never consults composedPreset', async () => {
  let called = false;
  const registry = {
    composedPreset() { called = true; throw new Error('creative loading must not use composedPreset'); },
    async list() { return [{ id: 'future', name: '创造模式' }]; },
    async readDocument(id) {
      assert.equal(id, 'future');
      return { content: '- id: tool-added\n  name: "@someone/renamed"\n' };
    },
  };
  const loaded = await loadCreativePreset(registry);
  assert.equal(called, false);
  assert.deepEqual(loaded.plugins, [{ id: 'tool-added', name: '@someone/renamed' }]);
});

test('diagnostics go to the installing plugin\'s logger, never to a fixed file path', async () => {
  const { installPresetCompat } = await import('../lib/preset-compat.mjs');
  const lines = [];
  const registry = { composedPreset: () => 'ptc' };
  const compat = installPresetCompat({ agentPresets: registry, logger: { debug: (...args) => lines.push(args.join(' ')) } }, { enabled: true });
  compat.dispose();
  assert.ok(lines.some(line => line.includes('installed')), 'the install is logged through the host logger');
  const source = (await import('node:fs')).readFileSync(new URL('../lib/preset-compat.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /appendFileSync|[A-Z]:[\\/]Users/u);
});
