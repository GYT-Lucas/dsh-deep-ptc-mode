import z from '@deepseek-ai/schemastery';
import snapshot from './preset.json' with { type: 'json' };
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CREATIVE_PRESET_ID } from './creative.mjs';
import { normalizePreferences } from './tool-policy.mjs';
import { availableEnvironments, BASE_SNAPSHOT, DEFAULT_FOREGROUND_SECONDS, deriveDeepPtc, normalizeDistribution, resolveEnvironment } from './model.mjs';
import { discoverShells, resolveShellExecutable, shellNote } from './shells.mjs';
import { BASE_DECLARATION_SPECIFIER, creativePresetUrl, loadCreativePreset, loadCurrentPreset, officialPresetUrl, parseOfficialExecutors } from './upstream.mjs';
import { importHost, pluginOf, resolveHost } from './host.mjs';
import { presetLifecycle } from './lifecycle.mjs';
import { installPresetCompat } from './preset-compat.mjs';
import { checkBeforeResolve } from './freshness.mjs';
import { apply as applySkillContext } from './skill-context.mjs';
import { applyRoot as applyToolStateRoot } from './tool-state.mjs';

function whereExecutable(name) {
  try {
    const command = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = spawnSync(command, [name], { encoding: 'utf8', timeout: 2000, windowsHide: true });
    if (result.status !== 0 || typeof result.stdout !== 'string') return [];
    return result.stdout.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const discoveredShells = discoverShells({
  platform: process.platform,
  env: process.env,
  exists: existsSync,
  where: whereExecutable,
});

function shellFamily(environment) {
  return environment === 'powershell' || environment === 'bash' || environment === 'zsh' ? environment : '';
}

export const name = 'deep-ptc-settings';
export const inject = ['agentPresets'];
export const Config = z.object({
  environment: z.union(availableEnvironments(process.platform)).default('auto').volatile(),
  wslDistribution: z.string().pattern(/^(?!\s*-)[^\u0000-\u001f\u007f]*$/u).default('').volatile(),
  shellExecutable: z.string().default('').volatile(),
  // Creative mode is always on. Keep the key so existing profiles still validate; its value is ignored.
  pluginLab: z.boolean().default(true).volatile(),
  shellChoices: z.array(z.object({
    id: z.string(), label: z.string(), path: z.string(), family: z.string(),
  })).default(discoveredShells).volatile(),
  foregroundSeconds: z.number().step(1).min(5).max(600).default(DEFAULT_FOREGROUND_SECONDS).volatile(),
  toolCompatibility: z.boolean().default(true).volatile(),
  toolPreferences: z.any().default([]).volatile(),
  compactToolCatalog: z.boolean().default(true).volatile(),
  hostPlatform: z.const(process.platform).default(process.platform).volatile(),
  // Session-scoped preset identity compatibility (native id first, base fallback).
  presetCompat: z.boolean().default(true).volatile(),
  presetFallback: z.string().default('ptc').volatile(),
  presetSupport: z.any().default({}).volatile(),
});

// Tool preferences are advice for the model, so a malformed list must not cost the preset.
function preferencesOf(ctx, config) {
  try {
    return normalizePreferences(config.toolPreferences.get());
  } catch (error) {
    ctx.logger.warn('Deep PTC: ignoring toolPreferences (%s)', error.message);
    return [];
  }
}

function settingsOf(ctx, config) {
  return {
    environment: config.environment.get(),
    wslDistribution: normalizeDistribution(config.wslDistribution.get()),
    shellExecutable: config.shellExecutable.get(),
    pluginLab: true,
    foregroundSeconds: config.foregroundSeconds.get(),
    toolCompatibility: config.toolCompatibility.get(),
    toolPreferences: preferencesOf(ctx, config),
    compactToolCatalog: config.compactToolCatalog.get(),
  };
}

// The shell executors the installed Harness declares in its base deployment, by kind.
function officialExecutors(ctx) {
  try {
    const url = resolveHost(BASE_DECLARATION_SPECIFIER);
    if (url === undefined) throw new Error(`cannot resolve ${BASE_DECLARATION_SPECIFIER}`);
    const executors = parseOfficialExecutors(readFileSync(fileURLToPath(url), 'utf8'));
    for (const kind of ['bash', 'pwsh']) if (executors[kind] === undefined)
      ctx.logger.warn('Deep PTC: %s declares no %s executor; using the bundled snapshot entry', url, kind);
    return { ...BASE_SNAPSHOT, ...executors };
  } catch (error) {
    ctx.logger.warn('Deep PTC: official executors unavailable (%s); using the bundled snapshot', error.message);
    return BASE_SNAPSHOT;
  }
}

// WSL and Zsh extend the official bash executor class. Probe it before choosing that path so an
// incompatible Harness falls back to the official shell rows instead of a preset that cannot mount.
async function canExtend(ctx, executor) {
  try {
    const Base = pluginOf(await importHost(executor.name));
    if (typeof Base === 'function' && typeof Base.decorateResult === 'function'
      && typeof Base.prototype.executeArgv === 'function') return true;
    ctx.logger.warn('Deep PTC: %s no longer exposes the executor API WSL/Zsh extend', executor.name);
  } catch (error) {
    ctx.logger.warn('Deep PTC: cannot load %s (%s)', executor.name, error.message);
  }
  return false;
}

// Derive Deep PTC from the PTC preset the installed Harness declares, so an
// official change is inherited instead of leaving a stale frozen row behind.
// The bundled snapshot is only a fallback when the installed declaration
// cannot be read or cannot be composed.
async function buildPreset(ctx, config, safeMode) {
  const settings = { ...settingsOf(ctx, config), safeMode };
  const executors = officialExecutors(ctx);
  const environment = resolveEnvironment(settings.environment);
  const family = shellFamily(environment);
  if (family) {
    const requested = typeof settings.shellExecutable === 'string' ? settings.shellExecutable : '';
    const resolved = resolveShellExecutable(requested, { family, discovered: discoveredShells, exists: existsSync });
    if (requested && requested !== 'auto' && !resolved) {
      ctx.logger.warn('Deep PTC: selected shell %s is not available; using the automatic executable', requested);
    }
    settings.shellExecutable = resolved;
    const note = shellNote({ family, executable: resolved });
    if (note) settings.shellNote = note;
  } else {
    settings.shellExecutable = '';
  }
  if (environment === 'wsl' || environment === 'zsh' || (environment === 'bash' && settings.shellExecutable)) {
    settings.mappedExecutor = await canExtend(ctx, executors.bash);
  }
  settings.pluginLab = !safeMode;
  if (settings.pluginLab) {
    try {
      const creative = await loadCreativePreset(ctx.agentPresets);
      settings.creativePlugins = creative.plugins;
      settings.creativeRoot = creative.root;
      ctx.logger.info('Deep PTC: plugin lab reading %s', creative.source);
    } catch (error) {
      settings.pluginLab = false;
      ctx.logger.warn('Deep PTC: creative preset unavailable (%s); continuing with the PTC tools', error.message);
    }
  }
  settings.executors = executors;
  let upstream = snapshot;
  let source = 'bundled snapshot';
  try {
    const official = await loadCurrentPreset(ctx.agentPresets);
    upstream = official.preset;
    source = official.source;
  } catch (error) {
    ctx.logger.warn('Deep PTC: official PTC preset unavailable (%s); deriving from the bundled snapshot', error.message);
  }
  try {
    const { preset, report } = deriveDeepPtc(upstream, settings);
    ctx.logger.info(
      'Deep PTC preset derived from %s: %d official rows; persona %s; environment %s; shell rows [%s]; wrapped [%s]; skipped [%s]',
      source, report.upstreamRows, report.persona, report.environment,
      report.replacedShellRows.join('; ') || '-', report.wrapped.join(', ') || '-', report.skipped.join('; ') || '-',
    );
    return preset;
  } catch (error) {
    if (upstream === snapshot) throw error;
    ctx.logger.warn('Deep PTC: deriving from %s failed (%s); deriving from the bundled snapshot', source, error.message);
    return deriveDeepPtc(snapshot, settings).preset;
  }
}

export async function apply(ctx, config) {
  let safeMode = false;
  // The skill card is a profile-level session projection, not an agent-preset row:
  // that keeps it available in existing Deep PTC sessions after an upgrade. Its
  // command and pre-step paths are gated to deep-ptc sessions below.
  await applySkillContext(ctx);
  // The tool state and its reset command follow the same rule, so the side card works in idle sessions too.
  await applyToolStateRoot(ctx);
  const lifecycle = presetLifecycle(
    definition => ctx.agentPresets.register(definition),
    () => buildPreset(ctx, config, safeMode),
    error => ctx.logger.error('Deep PTC environment update failed: %s', error.message),
  );
  ctx.effect(() => () => lifecycle.dispose());
  // Session-scoped preset identity: report the native deep-ptc id first; an external
  // consumer that does not declare support for it gets the base preset id instead.
  const compat = installPresetCompat(ctx, () => {
    if (config.presetCompat.get() === false) return { enabled: false };
    let support = {};
    try {
      const raw = config.presetSupport.get();
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) support = raw;
    } catch { /* keep the empty override list */ }
    return { enabled: true, nativeIds: ['deep-ptc'], fallback: config.presetFallback.get() || 'ptc', support };
  });
  ctx.effect(() => () => compat.dispose(), 'Deep PTC: session-scoped preset identity');
  // A preset the host refuses to mount would leave its sessions unusable, so fall back to the official
  // composition with the persona. Not awaited: reading the diagnosis waits for the host tree.
  const verify = async () => {
    const row = (await ctx.agentPresets.compositionInventory?.())?.find(candidate => candidate.id === 'deep-ptc');
    if (safeMode || !row?.broken) return;
    ctx.logger.warn('Deep PTC: preset cannot mount (%s); using safe mode', row.broken);
    safeMode = true;
    await lifecycle.refresh();
  };
  const refreshed = () => lifecycle.refresh().then(() => { void verify().catch(() => {}); });
  // Read the installed declarations, not fixture versions. Refresh only when our settings or
  // upstream declaration bytes change. Existing sessions keep their leased preset generation.
  // The check runs when settings change and once before each Deep PTC conversation starts; no timer.
  const signature = async () => {
    const read = url => {
      try { return readFileSync(fileURLToPath(url), 'utf8'); } catch { return ''; }
    };
    const document = async id => {
      try { return JSON.stringify(await ctx.agentPresets.readDocument?.(id)); } catch { return ''; }
    };
    return [JSON.stringify(settingsOf(ctx, config)), await document('ptc'), await document(CREATIVE_PRESET_ID),
      read(officialPresetUrl()), read(resolveHost(BASE_DECLARATION_SPECIFIER)), read(creativePresetUrl())].join('\0');
  };
  let previous = await signature();
  let detecting;
  let active = true;
  // Concurrent callers share one check, so several conversations opening together read once.
  const detect = () => detecting ??= (async () => {
    try {
      const current = await signature();
      if (!active || current === previous) return;
      previous = current;
      safeMode = false;
      await refreshed().catch(() => {});
    } catch (error) {
      ctx.logger.warn('Deep PTC: upstream detection failed (%s); retaining the active preset', error.message);
    } finally {
      detecting = undefined;
    }
  })();
  ctx.on('loader/volatile-update', () => { void detect(); });
  const restoreResolve = checkBeforeResolve(ctx.agentPresets, detect);
  ctx.effect(() => () => { active = false; restoreResolve(); });
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  // A failure to publish the preset is reported above; it must not take the
  // settings service (or the rest of the profile) down with it.
  await refreshed().catch(() => {});
}
