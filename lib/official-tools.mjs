import z from '@deepseek-ai/schemastery';
import { applyOfficial } from './host.mjs';

export const name = 'deep-ptc-official-tools';
export const inject = [];
export const Config = z.object({ upstream: z.string().required(), options: z.any() });
// Preserve official schemas, bodies, options and lifecycle; record their provenance for recovery.
export function apply(ctx, config) { return applyOfficial(ctx, config.upstream, config.options, child => child); }
