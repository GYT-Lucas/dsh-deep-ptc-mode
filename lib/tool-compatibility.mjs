import z from '@deepseek-ai/schemastery';
import { installToolCompatibility } from './tool-policy.mjs';

export const name = 'deep-ptc-tool-compatibility';
export const inject = ['tools', 'systemPrompt'];
export const Config = z.object({ enabled: z.boolean().default(true), preferences: z.any().default([]) });
export function apply(ctx, config) { installToolCompatibility(ctx, config); }
