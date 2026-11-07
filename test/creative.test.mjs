import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { creativeAdditions, selectCreativePreset } from '../lib/creative.mjs';

const skillExpr = { __jsExpr: "fileURLToPath(new URL('skills/', baseUrl))" };

function creativeFixture() {
  return [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'creative' } },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'skill-filesystem', name: '@vendor/skill-filesystem-next', config: { customSkillDirs: [skillExpr] } },
    { id: 'tool-future', name: '@someone/renamed-runtime-tool', config: { keep: true } },
  ];
}

const baseline = [
  { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'ptc' } },
  { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
  { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
];

test('copies only rows the creative declaration adds, using that declaration\'s module name', () => {
  const root = 'C:\\presets\\cordis';
  const additions = creativeAdditions(creativeFixture(), baseline, { root });
  const future = additions.find(row => row.id === 'tool-future');
  assert.equal(future.name, '@someone/renamed-runtime-tool');
  assert.deepEqual(future.config, { keep: true });
  const skill = additions.find(row => row.id === 'skill-filesystem-creative');
  assert.equal(skill.name, '@vendor/skill-filesystem-next');
  assert.deepEqual(skill.config.customSkillDirs, [join(root, 'skills')]);
  assert.equal(additions.some(row => row.id === 'tool-fs' || row.id === 'persona'), false);
});

test('a renamed creative module is copied under the new name', () => {
  const plugins = creativeFixture();
  plugins.find(row => row.id === 'tool-future').name = '@someone/runtime-tool-v2';
  const additions = creativeAdditions(plugins, baseline);
  assert.equal(additions.find(row => row.id === 'tool-future').name, '@someone/runtime-tool-v2');
});

test('rows already in the baseline are not added again', () => {
  const additions = creativeAdditions([
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', config: { extra: true } },
  ], baseline);
  assert.deepEqual(additions, []);
});

test('selectCreativePreset prefers the published name', () => {
  const chosen = selectCreativePreset([
    { id: 'cordis', name: 'Cordis', description: 'old' },
    { id: 'author', name: '创造模式', description: 'copy' },
  ]);
  assert.equal(chosen.id, 'author');
});
