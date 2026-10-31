import z from '@deepseek-ai/schemastery';
import { apply as applyBash } from '@deepseek-ai/dsh-tool-bash';
import { apply as applyPwsh } from '@deepseek-ai/dsh-tool-pwsh';
import { adaptContext, registering } from './adapt.mjs';
import { finishPromoted, steerableJobs, steerableTool, steeringWatch } from './reachable.mjs';

export const name = 'deep-ptc-terminal';
export const inject = ['tools', 'shell', 'systemPrompt', 'shellEnv', 'workingDirectory'];
export const Config = z.object({
  tool: z.union(['bash', 'pwsh']).required(),
  dialect: z.union(['zsh']),
});

// Keep the official execution, jobs and approval implementation. Foreground waits yield to user
// messages; the Zsh dialect only renames the bash tool's public face.
export function apply(ctx, config) {
  const watch = steeringWatch(ctx);
  const zsh = config.dialect === 'zsh';
  const dialect = text => zsh ? text.replace(/\bbash\b/gu, 'zsh').replace(/\bBash\b/gu, 'Zsh') : text;
  const adapted = adaptContext(ctx, {
    tools: tools => registering(tools, definition => steerableTool({
      ...definition,
      ...zsh ? { name: definition.name === 'bash' ? 'zsh' : definition.name, description: dialect(definition.description) } : {},
    }, finishPromoted)),
    systemPrompt: prompt => zsh ? new Proxy(prompt, {
      get(target, key) {
        if (key === 'section') return section => target.section({ ...section,
          name: section.name === 'tool:bash' ? 'tool:zsh' : section.name, text: dialect(section.text) });
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) : prompt,
    jobs: jobs => steerableJobs(jobs, watch),
  });
  (config.tool === 'pwsh' ? applyPwsh : applyBash)(adapted, {});
}
