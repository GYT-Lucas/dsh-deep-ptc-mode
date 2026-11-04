// Regenerate the bundled fallback snapshot from the installed official PTC declaration.
// Maintainer tool: `npm run sync:snapshot [-- <preset.patch.yml>]`.
import { readFileSync, writeFileSync } from 'node:fs';
import { PRESET_META, personaFrom } from '../lib/model.mjs';
import { loadOfficialPreset } from '../lib/upstream.mjs';

const snapshotUrl = new URL('../lib/preset.json', import.meta.url);
const previous = JSON.parse(readFileSync(snapshotUrl, 'utf8'));
const persona = personaFrom(previous);
const loaded = loadOfficialPreset(process.argv[2] === undefined ? {} : { presetPath: process.argv[2] });

const plugins = structuredClone(loaded.preset.plugins);
const personaIndex = plugins.findIndex(row => row && row.name === '@deepseek-ai/dsh-persona');
if (personaIndex === -1) plugins.unshift({ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { ...persona } });
else plugins[personaIndex].config = { ...(plugins[personaIndex].config ?? {}), ...persona };

const snapshot = {
  id: PRESET_META.id,
  order: PRESET_META.order,
  plugins,
  name: PRESET_META.name,
  description: PRESET_META.description,
};
writeFileSync(snapshotUrl, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`snapshot: ${plugins.length} rows from ${loaded.source}`);
