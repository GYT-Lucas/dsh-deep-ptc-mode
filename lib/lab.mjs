import z from '@deepseek-ai/schemastery';

export const name = 'deep-ptc-plugin-lab';
export const inject = ['systemPrompt'];
export const Config = z.object({});

const text = `Plugin lab is on for this Deep PTC session.
Inspect the live composition, define a syntax-checked package, then run it only through the host approval. Packages stay in memory for this process. They do not write the repository, shipped presets, the desktop composition, or this plugin's source.
Do not bypass or weaken approval. If a lab tool is missing or fails, continue with the official PTC tools.`;

export function apply(ctx) {
  ctx.systemPrompt.section({ name: 'deep-ptc:plugin-lab', order: 10192, text });
}
