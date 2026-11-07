// Rows the official creative-mode preset adds beyond the preset Deep PTC is
// derived from. Module names are copied from that declaration. A renamed
// official package is followed because this file never names one.
import { join } from 'node:path';

/** Shipped preset id, the same kind of lookup key as `ptc`. Not a module name. */
export const CREATIVE_PRESET_ID = 'cordis';

function text(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * Pick the creative preset from a live roster.
 * The published name wins, then the shipped id, then a description that says so.
 * @param {Array<{ id?: string, name?: string, description?: string }>} roster
 */
export function selectCreativePreset(roster) {
  const rows = Array.isArray(roster) ? roster.filter(row => row && typeof row === 'object') : [];
  return rows.find(row => row.name === '创造模式')
    ?? rows.find(row => row.id === CREATIVE_PRESET_ID)
    ?? rows.find(row => text(row.description).includes('创造'));
}

function isPersona(row) {
  return row?.id === 'persona' || (typeof row?.name === 'string' && row.name.includes('dsh-persona'));
}

function walk(rows, visit) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    visit(row);
    if (row.group === true && Array.isArray(row.config)) walk(row.config, visit);
  }
}

function idsOf(rows) {
  const ids = new Set();
  walk(rows, row => { if (typeof row.id === 'string') ids.add(row.id); });
  return ids;
}

function rowById(rows, id) {
  let found;
  walk(rows, row => { if (found === undefined && row.id === id) found = row; });
  return found;
}

function pinDir(entry, root) {
  if (!root || !entry || typeof entry !== 'object' || typeof entry.__jsExpr !== 'string') return entry;
  if (!entry.__jsExpr.includes('baseUrl') || !entry.__jsExpr.includes('skills')) return entry;
  return join(root, 'skills');
}

function pinDirs(dirs, root) {
  return Array.isArray(dirs) ? dirs.map(entry => pinDir(entry, root)) : dirs;
}

function sameDir(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withPinnedSkillDirs(row, root) {
  const copy = structuredClone(row);
  const dirs = copy?.config?.customSkillDirs;
  if (Array.isArray(dirs)) copy.config = { ...copy.config, customSkillDirs: pinDirs(dirs, root) };
  return copy;
}

/**
 * Rows to append when the creative preset is enabled.
 * Baseline rows stay as they are: official PTC remains the fallback.
 * @param {object[]} creativePlugins
 * @param {object[]} baselinePlugins
 * @param {{ root?: string }} [options] directory of the creative preset, used to pin skill paths
 */
export function creativeAdditions(creativePlugins, baselinePlugins, options = {}) {
  const root = typeof options.root === 'string' ? options.root : '';
  const baselineIds = idsOf(baselinePlugins);
  const additions = [];
  const seen = new Set();

  const uniqueId = preferred => {
    if (!baselineIds.has(preferred) && !seen.has(preferred)) return preferred;
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${preferred}-${suffix}`;
      if (!baselineIds.has(candidate) && !seen.has(candidate)) return candidate;
    }
  };

  const push = row => {
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    additions.push(row);
  };

  const consider = row => {
    if (!row || typeof row !== 'object' || isPersona(row)) return;
    if (row.group === true) {
      if (typeof row.id === 'string' && baselineIds.has(row.id)) {
        if (Array.isArray(row.config)) for (const child of row.config) consider(child);
        return;
      }
      push(withPinnedSkillDirs(row, root));
      return;
    }
    if (typeof row.id === 'string' && baselineIds.has(row.id)) {
      const baseline = rowById(baselinePlugins, row.id);
      const creativeDirs = row.config?.customSkillDirs;
      const baselineDirs = baseline?.config?.customSkillDirs ?? [];
      if (!Array.isArray(creativeDirs) || creativeDirs.length === 0) return;
      const pinned = pinDirs(creativeDirs, root);
      const extra = pinned.filter(entry => !baselineDirs.some(existing => sameDir(existing, entry)));
      if (extra.length === 0) return;
      const id = uniqueId(`${row.id}-creative`);
      push({ id, name: row.name, config: { customSkillDirs: extra } });
      return;
    }
    push(withPinnedSkillDirs(row, root));
  };

  if (Array.isArray(creativePlugins)) {
    for (const row of creativePlugins) consider(row);
  }
  return additions;
}
