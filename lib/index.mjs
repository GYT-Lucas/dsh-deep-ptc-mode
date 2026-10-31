import z from '@deepseek-ai/schemastery';
import template from './preset.json' with { type: 'json' };
import { availableEnvironments, configuredPreset, DEFAULT_FOREGROUND_SECONDS, normalizeDistribution } from './model.mjs';
import { presetLifecycle } from './lifecycle.mjs';

export const name = 'deep-ptc-settings';
export const inject = ['agentPresets'];
export const Config = z.object({
  environment: z.union(availableEnvironments(process.platform)).default('auto').volatile(),
  wslDistribution: z.string().pattern(/^(?!\s*-)[^\u0000-\u001f\u007f]*$/u).default('').volatile(),
  foregroundSeconds: z.number().step(1).min(5).max(600).default(DEFAULT_FOREGROUND_SECONDS).volatile(),
  hostPlatform: z.const(process.platform).default(process.platform).volatile(),
});

export async function apply(ctx, config) {
  const lifecycle = presetLifecycle(
    definition => ctx.agentPresets.register(definition),
    () => configuredPreset(template, {
      environment: config.environment.get(),
      wslDistribution: normalizeDistribution(config.wslDistribution.get()),
      foregroundSeconds: config.foregroundSeconds.get(),
    }),
    error => ctx.logger.error('Deep PTC environment update failed: %s', error.message),
  );
  ctx.effect(() => () => lifecycle.dispose());
  ctx.on('loader/volatile-update', () => { void lifecycle.refresh().catch(() => {}); });
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  await lifecycle.refresh();
}
