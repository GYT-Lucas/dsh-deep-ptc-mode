import z from '@deepseek-ai/schemastery';
import snapshot from './preset.json' with { type: 'json' };
import { availableEnvironments, DEFAULT_FOREGROUND_SECONDS, deriveDeepPtc, normalizeDistribution } from './model.mjs';
import { loadOfficialPreset } from './upstream.mjs';
import { presetLifecycle } from './lifecycle.mjs';

export const name = 'deep-ptc-settings';
export const inject = ['agentPresets'];
export const Config = z.object({
  environment: z.union(availableEnvironments(process.platform)).default('auto').volatile(),
  wslDistribution: z.string().pattern(/^(?!\s*-)[^\u0000-\u001f\u007f]*$/u).default('').volatile(),
  foregroundSeconds: z.number().step(1).min(5).max(600).default(DEFAULT_FOREGROUND_SECONDS).volatile(),
  hostPlatform: z.const(process.platform).default(process.platform).volatile(),
});

function settingsOf(config) {
  return {
    environment: config.environment.get(),
    wslDistribution: normalizeDistribution(config.wslDistribution.get()),
    foregroundSeconds: config.foregroundSeconds.get(),
  };
}

// Derive Deep PTC from the PTC preset the installed Harness declares, so an
// official change is inherited instead of leaving a stale frozen row behind.
// The bundled snapshot is only a fallback when the installed declaration
// cannot be read or cannot be composed.
function buildPreset(ctx, config) {
  const settings = settingsOf(config);
  let upstream = snapshot;
  let source = 'bundled snapshot';
  try {
    const official = loadOfficialPreset();
    upstream = official.preset;
    source = official.source;
  } catch (error) {
    ctx.logger.warn('Deep PTC: official PTC preset unavailable (%s); deriving from the bundled snapshot', error.message);
  }
  try {
    const { preset, report } = deriveDeepPtc(upstream, settings);
    ctx.logger.info(
      'Deep PTC preset derived from %s: %d official rows; persona %s; shell rows [%s]; wrapped [%s]; skipped [%s]',
      source, report.upstreamRows, report.persona,
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
  const lifecycle = presetLifecycle(
    definition => ctx.agentPresets.register(definition),
    () => buildPreset(ctx, config),
    error => ctx.logger.error('Deep PTC environment update failed: %s', error.message),
  );
  ctx.effect(() => () => lifecycle.dispose());
  ctx.on('loader/volatile-update', () => { void lifecycle.refresh().catch(() => {}); });
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  // A failure to publish the preset is reported above; it must not take the
  // settings service (or the rest of the profile) down with it.
  await lifecycle.refresh().catch(() => {});
}
