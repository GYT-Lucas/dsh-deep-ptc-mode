// Deep PTC owns a session-scoped preset identity compatibility layer.
//
// Two attempts for a session's identity:
//   1. native deep-ptc -- the plugin may pass if it does not limit preset names;
//   2. base ptc       -- a plugin that limits preset names to the built-in ids passes here.
//
// Each external plugin is asked once, so the layer is chosen before returning: inspect
// the calling plugin's own package. A package that does not gate on preset ids, or
// that declares deep-ptc, gets the native id. A package that gates on preset ids but
// does not declare deep-ptc gets the base id immediately. The second layer is the one
// that is guaranteed to pass for a plugin whose allowlist includes ptc (dsh-ops maps
// minimal/standard/ptc/cordis). A plugin that excludes ptc can pass neither.
//
// Why not retry at runtime: composedPreset() returns one string and the host gives no
// rejection callback; a plugin whose gate misses simply stays inert. So the two
// attempts are resolved per caller before the value is returned.
//
// Host internals that must keep the exact identity (subagent child headers, scheduled
// session creation, the registry itself) are recognised from the immediate frames.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'deep-ptc-preset-compat';
export const inject = ['agentPresets'];

const PATCH_MARK = Symbol.for('dsh-deep-ptc-mode.preset-compat.patch');
const HOST_CALLERS = /(?:dsh-subagent|dsh-tool-schedule|dsh-agent-preset-registry)/u;
const SELF = 'preset-compat.mjs';
const CODE_EXTENSIONS = ['.mjs', '.cjs', '.js', '.mts', '.cts', '.ts'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'docs', 'test', 'tests']);
const MAX_FILES = 800;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

const packageCache = new Map();
const callerCache = new Map();
const logged = new Set();

// Diagnostics go to the host logger of the plugin that installed the layer.
let sink = () => {};
function log(line) {
  try { sink(line); } catch { /* diagnostics only */ }
}

function fileOf(value) {
  try {
    const file = value.startsWith('file:') ? fileURLToPath(value) : value;
    // fileURLToPath yields /C:/... under a POSIX runtime and C:\... on Windows.
    return /^\/[A-Za-z]:[\\/]/u.test(file) ? file.slice(1) : file;
  } catch { return ''; }
}

function isCodeFile(name) {
  return CODE_EXTENSIONS.some(extension => name.endsWith(extension));
}

function isNumber(text) {
  return text.length > 0 && Number.isFinite(Number(text)) && /^[0-9]+$/u.test(text);
}

/** First stack frame outside this module, as an absolute file path. */
export function callerFile(stack) {
  for (const raw of String(stack ?? '').split('\n').slice(1)) {
    if (raw.includes(SELF)) continue;
    // Cordis service proxies insert one infrastructure frame (Object.apply in the
    // host's cordis package) between this wrapper and the real caller. Skip it so
    // the caller's own package, not the proxy, decides the layer.
    if (raw.includes('@deepseek-ai/cordis/')) continue;
    let text = raw.trim();
    if (text.startsWith('at ')) text = text.slice(3).trim();
    if (text.startsWith('async ')) text = text.slice(6).trim();
    const open = text.lastIndexOf('(');
    if (open !== -1 && text.endsWith(')')) text = text.slice(open + 1, -1);
    const parts = text.split(':');
    if (parts.length < 3) continue;
    const col = parts.pop();
    const line = parts.pop();
    if (!isNumber(line) || !isNumber(col)) continue;
    const file = fileOf(parts.join(':'));
    if (file) return file;
  }
  return '';
}

/** Nearest ancestor package.json carrying a name. */
export function packageOf(file) {
  let dir = dirname(file);
  const { root } = parse(dir);
  for (let depth = 0; depth < 12 && dir && dir !== root; depth++) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (manifest && typeof manifest.name === 'string') return { root: dir, name: manifest.name };
    } catch { /* keep walking */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const GATE_MARKERS = [
  'MODE_PRESET',
  "=== 'ptc'", '=== "ptc"', "!== 'ptc'", '!== "ptc"',
  "=== 'standard'", '=== "standard"', "=== 'cordis'", '=== "cordis"',
  "=== 'minimal'", '=== "minimal"',
  "case 'ptc'", 'case "ptc"',
  ".includes('ptc')", '.includes("ptc")',
];

const CREATIVE_PRESET_ID = 'cordis';
const KNOWN_PRESET_IDS = ['deep-ptc', CREATIVE_PRESET_ID, 'ptc', 'standard', 'minimal'];

function presetRestricted(text) {
  return GATE_MARKERS.some(marker => text.includes(marker));
}

/** Quoted preset ids this code mentions; the base id a restricted plugin accepts. */
function acceptedPresetIds(text) {
  const found = [];
  for (const id of KNOWN_PRESET_IDS) {
    if (text.includes("'" + id + "'") || text.includes('"' + id + '"')) found.push(id);
  }
  return found;
}

/**
 * Probe one plugin package for the two identity layers. Bounded and cached.
 * @param root - package root.
 * @param nativeId - the native preset id, normally deep-ptc.
 * @returns declares: the package knows the native id; restricted: the package gates on preset ids.
 */
export function packageProbe(root, nativeId) {
  const key = root + '|' + nativeId;
  if (packageCache.has(key)) return packageCache.get(key);
  let files = 0;
  let bytes = 0;
  const result = { declares: false, restricted: false, accepts: [] };
  const accepts = new Set();
  const visit = directory => {
    if (result.declares || files >= MAX_FILES || bytes >= MAX_TOTAL_BYTES) return;
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (result.declares || files >= MAX_FILES || bytes >= MAX_TOTAL_BYTES) return;
      if (entry.name.startsWith('.')) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(full);
        continue;
      }
      if (!entry.isFile() || !isCodeFile(entry.name)) continue;
      let size = 0;
      try { size = statSync(full).size; } catch { continue; }
      if (size <= 0 || size > MAX_FILE_BYTES) continue;
      let text;
      try { text = readFileSync(full, 'utf8'); } catch { continue; }
      if (text.includes(nativeId)) result.declares = true;
      if (presetRestricted(text)) result.restricted = true;
      for (const id of acceptedPresetIds(text)) accepts.add(id);
      files += 1;
      bytes += size;
    }
  };
  visit(root);
  result.accepts = [...accepts];
  packageCache.set(key, result);
  return result;
}

/**
 * Resolve the identity one external consumer should see.
 * @param exact - the live composed preset id.
 * @param options - enabled, nativeIds, fallback, creativeFallback and support overrides.
 * @param info - host flag, package name and declaration probe result.
 * @returns the id to report.
 */
export function decidePresetId(exact, options = {}, info = {}) {
  const nativeIds = Array.isArray(options.nativeIds) && options.nativeIds.length > 0
    ? options.nativeIds : ['deep-ptc'];
  if (typeof exact !== 'string' || !nativeIds.includes(exact)) return exact;
  if (options.enabled === false) return exact;
  if (info.host === true) return exact;
  const support = options.support && typeof options.support === 'object' && !Array.isArray(options.support)
    ? options.support : {};
  const override = info.packageName === undefined ? undefined : support[info.packageName];
  if (override === 'native') return exact;
  const fallback = options.fallback || 'ptc';
  if (override === 'base') return fallback;
  // Layer 1: a plugin that does not limit preset names, or that declares the native
  // id itself, keeps deep-ptc.
  if (info.declares === true) return exact;
  if (info.restricted !== true) return exact;
  // Layer 2: a plugin that limits preset names gets a base id. ptc is the normal
  // base; a creative-mode row mounted by the plugin lab may accept only cordis,
  // so use the id its own code actually mentions.
  const accepts = Array.isArray(info.accepts) ? info.accepts : [];
  if (accepts.includes(fallback)) return fallback;
  if (accepts.includes(CREATIVE_PRESET_ID)) return CREATIVE_PRESET_ID;
  return fallback;
}

/** Inspect one call: host frame, or the calling plugin package and its declaration. */
export function inspectCaller(stack, nativeId) {
  const head = String(stack ?? '').split('\n').slice(0, 4).join('\n');
  if (HOST_CALLERS.test(head)) return { host: true };
  const file = callerFile(stack);
  if (!file) return { host: true };
  if (file.includes('app.asar')) return { host: true };
  if (callerCache.has(file)) return callerCache.get(file);
  const pkg = packageOf(file);
  if (pkg === undefined) return { host: true };
  if (pkg.name.startsWith('@deepseek-ai/')) return { host: true };
  const probe = packageProbe(pkg.root, nativeId);
  const info = { host: false, packageName: pkg.name, packageRoot: pkg.root, declares: probe.declares, restricted: probe.restricted, accepts: probe.accepts };
  callerCache.set(file, info);
  return info;
}

function logDecision(info, id) {
  if (!info || typeof info.packageName !== 'string') return;
  const key = info.packageName + '|' + id;
  if (logged.has(key)) return;
  logged.add(key);
  log('decision ' + new Date().toISOString() + ' ' + info.packageName + ' -> ' + id + (info.declares ? ' (declares native)' : info.restricted ? ' (preset restricted -> ' + id + ')' : ' (unrestricted -> native)'));
}

/**
 * Install the identity layer on the live registry. Idempotent: a second mount
 * (plugin startup plus an explicit compatibility row) keeps the first owner and
 * becomes a no-op.
 * @param ctx - plugin context carrying agentPresets.
 * @param options - options object or a getter returning one.
 * @returns owner handle; dispose() restores the unpatched method.
 */
export function installPresetCompat(ctx, options) {
  if (typeof ctx?.logger?.debug === 'function') sink = line => ctx.logger.debug('Deep PTC preset identity: %s', line);
  const registry = ctx?.agentPresets;
  const current = registry?.composedPreset;
  if (typeof current !== 'function') {
    log('skip ' + new Date().toISOString() + ': agentPresets.composedPreset unavailable');
    return { active: false, owner: false, dispose() {} };
  }
  if (current[PATCH_MARK] === true) return { active: true, owner: false, dispose() {} };
  const hadOwn = Object.hasOwn(registry, 'composedPreset');
  const original = current;
  const patched = function composedPreset(agentCtx) {
    const exact = original.call(registry, agentCtx);
    const now = typeof options === 'function' ? options() : options;
    if (!now || now.enabled === false) return exact;
    const nativeIds = Array.isArray(now.nativeIds) && now.nativeIds.length > 0 ? now.nativeIds : ['deep-ptc'];
    if (typeof exact !== 'string' || !nativeIds.includes(exact)) return exact;
    // A failed probe means 'does not declare the native id', so the consumer still
    // receives the usable base id instead of losing the plugin surface.
    let info = { host: false, declares: false, restricted: true };
    try { info = inspectCaller(new Error().stack ?? '', nativeIds[0]); } catch (error) { log('inspect-error ' + error.message); }
    const id = decidePresetId(exact, now, info);
    logDecision(info, id);
    return id;
  };
  Object.defineProperty(patched, PATCH_MARK, { value: true });
  Object.defineProperty(registry, 'composedPreset', { value: patched, configurable: true, writable: true });
  log('installed ' + new Date().toISOString());
  return {
    active: true,
    owner: true,
    dispose() {
      if (registry.composedPreset !== patched) return;
      if (hadOwn) Object.defineProperty(registry, 'composedPreset', { value: original, configurable: true, writable: true });
      else delete registry.composedPreset;
      log('disposed ' + new Date().toISOString());
    },
  };
}

// Compatibility row entry: mount the same layer explicitly (idempotent).
export function apply(ctx, config) {
  const compat = installPresetCompat(ctx, {
    enabled: true,
    nativeIds: ['deep-ptc'],
    fallback: config?.fallback ?? 'ptc',
    support: config?.support && typeof config.support === 'object' ? config.support : {},
  });
  ctx.effect(() => () => compat.dispose(), 'Deep PTC: preset identity compatibility');
}
