// Two-attempt preset identity: native deep-ptc first, then the base id the caller
// actually accepts (ptc, or cordis for a creative-mode row). Creative preset
// loading must never depend on composedPreset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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

test('a plugin published as build output only is still probed', () => {
  const root = mkdtempSync(join(tmpdir(), 'deep-ptc-dist-'));
  try {
    const dir = join(root, 'compiled');
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'compiled', main: 'dist/index.js' }));
    writeFileSync(join(dir, 'dist', 'index.js'), "if (ctx.agentPresets.composedPreset(agent) !== 'ptc') return;\n");
    assert.deepEqual(packageProbe(dir, 'deep-ptc'), { declares: false, restricted: true, accepts: ['ptc'] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('only code that tests a preset id is restricted, and only a literal declares the native id', () => {
  const root = mkdtempSync(join(tmpdir(), 'deep-ptc-markers-'));
  try {
    const unrelated = fakePackage(root, 'unrelated', 'const activePreset = ctx.agentPresets.composedPreset(agent);\nconst dark = theme==="standard";\n');
    const prose = fakePackage(root, 'prose', "// TODO: support 'deep-ptc' later.\n/* A note about \"deep-ptc\". */\nexport const gate = preset => ['ptc', 'standard'].includes(preset);\n");
    const reversed = fakePackage(root, 'reversed', "export const gate = preset => 'ptc' == preset;\n");
    const alias = fakePackage(root, 'alias', "const p=ctx.agentPresets.composedPreset(agent); if(p==='ptc') start();\n");
    const membership = fakePackage(root, 'membership', "const gate = presetId => new Set(['ptc', 'cordis']).has(presetId);\n");
    const switchGate = fakePackage(root, 'switch-gate', "switch (session.agentPreset) { case 'ptc': start(); }\n");
    const commentedGate = fakePackage(root, 'commented-gate', "// if (preset === 'ptc') return;\nconst preset = ctx.agentPresets.composedPreset(agent);\n");
    const unrelatedInfo = packageProbe(unrelated, 'deep-ptc');
    assert.equal(unrelatedInfo.restricted, false, 'a comparison that is not about presets');
    assert.equal(decidePresetId('deep-ptc', opts, unrelatedInfo), 'deep-ptc');
    assert.deepEqual(packageProbe(prose, 'deep-ptc'), { declares: false, restricted: true, accepts: ['ptc', 'standard'] });
    assert.equal(decidePresetId('deep-ptc', opts, packageProbe(prose, 'deep-ptc')), 'ptc');
    assert.equal(packageProbe(reversed, 'deep-ptc').restricted, true);
    assert.equal(packageProbe(alias, 'deep-ptc').restricted, true);
    assert.equal(packageProbe(membership, 'deep-ptc').restricted, true);
    assert.equal(packageProbe(switchGate, 'deep-ptc').restricted, true);
    assert.equal(packageProbe(commentedGate, 'deep-ptc').restricted, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a plugin updated in place is probed again', () => {
  const root = mkdtempSync(join(tmpdir(), 'deep-ptc-update-'));
  try {
    const dir = fakePackage(root, 'updated', "export const gate = preset => preset === 'ptc';\n");
    assert.equal(packageProbe(dir, 'deep-ptc').declares, false);
    assert.equal(packageProbe(dir, 'deep-ptc'), packageProbe(dir, 'deep-ptc'), 'cached while the manifest is unchanged');
    writeFileSync(join(dir, 'lib.js'), "export const PRESETS = ['deep-ptc', 'ptc'];\n");
    utimesSync(join(dir, 'package.json'), new Date(), new Date(Date.now() + 60_000));
    assert.equal(packageProbe(dir, 'deep-ptc').declares, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('host frames are recognised by official package path, not by a similar name', () => {
  const root = mkdtempSync(join(tmpdir(), 'deep-ptc-host-'));
  try {
    const dir = fakePackage(root, 'my-dsh-subagent-helper', "export const gate = preset => preset === 'ptc';\n");
    const frames = file => ['Error', '    at composedPreset (file:///x/preset-compat.mjs:1:1)', `    at gate (${file}:1:1)`].join('\n');
    assert.equal(inspectCaller(frames('file://' + join(dir, 'lib.js')), 'deep-ptc').host, false);
    assert.equal(inspectCaller(frames('file:///opt/app/node_modules/@deepseek-ai/dsh-subagent/lib/index.js'), 'deep-ptc').host, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an official plugin gating on a base preset id gets the compat layer, others stay exact', () => {
  const root = mkdtempSync(join(tmpdir(), 'deep-ptc-official-'));
  try {
    // A bundled official plugin with a configuration-driven gate. The computer-use
    // tools ship exactly this shape: agentPreset defaults to 'ptc' in the schema and the
    // runtime compares composedPreset against the configured value, so no preset literal
    // sits next to the comparison.
    const bundled = join(root, 'app.asar', 'dsh', 'node_modules');
    const cuaDir = join(bundled, '@deepseek-ai', 'dsh-cua');
    mkdirSync(cuaDir, { recursive: true });
    writeFileSync(join(cuaDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-cua', version: '0.2.2-rc.2' }));
    writeFileSync(join(cuaDir, 'lib.js'), [
      "agentPreset: Schema.union([Schema.string().min(1), Schema.const(false)]).default(\"ptc\"),",
      "if (config.agentPreset === false) register(ctx);",
      "if (presetCtx.agentPresets.composedPreset(agent.ctx) !== config.agentPreset) return;",
    ].join('\n') + '\n');
    // An official plugin that calls composedPreset without gating on an id.
    const plainDir = join(bundled, '@deepseek-ai', 'dsh-tool-manager');
    mkdirSync(plainDir, { recursive: true });
    writeFileSync(join(plainDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tool-manager', version: '1.0.0' }));
    writeFileSync(join(plainDir, 'lib.js'), "export const preset = ctx.agentPresets.composedPreset(agent.ctx);\n");
    const frames = file => ['Error', '    at composedPreset (file:///x/preset-compat.mjs:1:1)', `    at sync (${file}:1:1)`].join('\n');
    const gateInfo = inspectCaller(frames('file://' + join(cuaDir, 'lib.js')), 'deep-ptc');
    assert.equal(gateInfo.host, false, 'a gating official plugin is classified like an external plugin');
    assert.equal(gateInfo.packageName, '@deepseek-ai/dsh-cua');
    assert.equal(gateInfo.restricted, true);
    assert.deepEqual(gateInfo.accepts, ['ptc']);
    assert.equal(decidePresetId('deep-ptc', opts, gateInfo), 'ptc');
    assert.equal(inspectCaller(frames('file://' + join(plainDir, 'lib.js')), 'deep-ptc').host, true, 'a gate-free official plugin keeps the exact identity');
    assert.equal(inspectCaller(frames('file:///opt/app/app.asar/dsh/web/ui.js'), 'deep-ptc').host, true, 'bundled application code outside node_modules keeps the exact identity');
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

test('third-party callers share the native and alias layers only in Deep PTC sessions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'deep-ptc-identity-'));
  let lookups = 0;
  const registry = { composedPreset(ctx) { lookups++; return ctx.preset; } };
  const compat = installPresetCompat({ agentPresets: registry }, opts);
  try {
    const legacy = fakePackage(root, 'ptc-tool', '');
    const native = fakePackage(root, 'deep-ptc-aware-tool', '');
    const host = fakePackage(root, '@deepseek-ai/dsh-tool-schedule', '');
    writeFileSync(join(legacy, 'entry.mjs'), `
      export function identify(registry, agent) {
        const preset = registry.composedPreset(agent.ctx);
        return { preset, enabled: preset === 'ptc' };
      }
    `);
    writeFileSync(join(native, 'entry.mjs'), `
      export function identify(registry, agent) {
        const preset = registry.composedPreset(agent.ctx);
        return { preset, enabled: ['deep-ptc', 'ptc'].includes(preset) };
      }
    `);
    writeFileSync(join(host, 'entry.mjs'), `
      export const identify = (registry, agent) => registry.composedPreset(agent.ctx);
      export const invoke = (plugin, registry, agent) => plugin(registry, agent);
    `);
    const legacyPlugin = await import(pathToFileURL(join(legacy, 'entry.mjs')));
    const nativePlugin = await import(pathToFileURL(join(native, 'entry.mjs')));
    const official = await import(pathToFileURL(join(host, 'entry.mjs')));

    for (const preset of ['deep-ptc', 'ptc', 'standard', 'minimal', 'cordis', 'custom', undefined]) {
      const session = { header: Object.freeze({ agentPreset: preset }) };
      const agent = { ctx: { preset }, session };
      const visible = preset === 'deep-ptc' ? 'ptc' : preset;
      const expected = { preset: visible, enabled: visible === 'ptc' };
      const before = lookups;
      assert.deepEqual(legacyPlugin.identify(registry, agent), expected);
      assert.deepEqual(official.invoke(legacyPlugin.identify, registry, agent), expected);
      assert.deepEqual(nativePlugin.identify(registry, agent), {
        preset, enabled: preset === 'deep-ptc' || preset === 'ptc',
      });
      assert.equal(official.identify(registry, agent), preset);
      assert.equal(lookups - before, 4);
      assert.equal(agent.session.header.agentPreset, preset);
    }
  } finally {
    compat.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failed caller inspection keeps the native preset ID', () => {
  const registry = { composedPreset: () => 'deep-ptc' };
  const compat = installPresetCompat({ agentPresets: registry }, opts);
  const prepare = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = () => { throw new Error('stack unavailable'); };
    assert.equal(registry.composedPreset(), 'deep-ptc');
  } finally {
    Error.prepareStackTrace = prepare;
    compat.dispose();
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
