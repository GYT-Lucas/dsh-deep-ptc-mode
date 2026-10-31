import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import { configuredPreset, WRAPPED_ROWS } from '../lib/model.mjs';

const root = new URL('../', import.meta.url);
const expression = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar', construct: value => ({ __jsExpr: value }),
});
export const schema = yaml.JSON_SCHEMA.extend(expression);
export function parsePreset(text) { return yaml.load(text, { schema })[0].insert[0].config; }
export function checkCompatibility(template, upstream) {
  const actual = structuredClone(template.plugins);
  const expected = structuredClone(upstream.plugins);
  assert.equal(actual[0].id, 'persona');
  assert.equal(typeof actual[0].config.prefix, 'string');
  assert.equal(typeof actual[0].config.suffix, 'string');
  assert.ok(actual[0].config.suffix.length > 100);
  actual[0].config = expected[0].config;
  assert.deepEqual(actual, expected,
    'Official PTC composition changed outside persona; review tools, planning, pruning and delegation before upgrading.');
  for (const [platform, modes] of Object.entries({ win32: ['auto', 'wsl', 'powershell'], darwin: ['auto', 'zsh', 'bash'], linux: ['auto', 'bash', 'zsh'] })) {
    for (const environment of modes) {
      const preset = configuredPreset(template, { environment, wslDistribution: '' }, platform);
      const execution = preset.plugins.find(row => row.id === 'execution');
      assert.deepEqual(execution.isolate, { shell: true });
      const wrapped = Object.keys(WRAPPED_ROWS);
      const unchanged = preset.plugins.filter(row => !['execution', 'reachability', ...wrapped].includes(row.id));
      assert.deepEqual(unchanged, template.plugins.filter(row => !['tool-bash', 'tool-pwsh', ...wrapped].includes(row.id)));
      for (const id of wrapped) assert.match(preset.plugins.find(row => row.id === id).name, /^dsh-deep-ptc-mode\//u);
    }
  }
}

export function check(upstreamPath) {
  const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  const provenance = JSON.parse(readFileSync(new URL('compatibility.json', root), 'utf8'));
  const template = JSON.parse(readFileSync(new URL('lib/preset.json', root), 'utf8'));
  const upstreamBytes = readFileSync(upstreamPath ?? new URL(`test/fixtures/ptc-${provenance.verifiedUpstream}.patch.yml`, root));
  if (!upstreamPath) assert.equal(createHash('sha256').update(upstreamBytes).digest('hex'), provenance.sha256);
  checkCompatibility(template, parsePreset(upstreamBytes.toString('utf8')));
  assert.equal(template.id, 'deep-ptc');
  const bundle = yaml.load(readFileSync(new URL('cordis.patch.yml', root), 'utf8'), { schema });
  assert.equal(bundle[0].insert[0].id, 'deep-ptc-settings');
  assert.equal(bundle[0].insert[0].name, manifest.name);
  for (const path of Object.values(manifest.exports)) readFileSync(new URL(path, root));
  return { version: manifest.version, verifiedUpstream: provenance.verifiedUpstream,
    officialTopLevelRows: template.plugins.length,
    personaWords: (template.plugins[0].config.prefix + ' ' + template.plugins[0].config.suffix).split(/\s+/u).length,
    environmentsChecked: 9 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf('--upstream');
  if (flag >= 0 && !process.argv[flag + 1]) throw new Error('Usage: npm run check:upstream -- /path/to/ptc.patch.yml');
  console.log(JSON.stringify(check(flag >= 0 ? process.argv[flag + 1] : undefined), null, 2));
}
