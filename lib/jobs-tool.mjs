import { Config, apply as applyJobs, inject } from '@deepseek-ai/dsh-tool-jobs';
import { adaptContext, registering } from './adapt.mjs';
import { steerableJobs, steerableTool, steeringWatch } from './reachable.mjs';

export const name = 'deep-ptc-tool-jobs';
export { Config, inject };

// The official job tools, with job_output waits ending when the user sends a message.
export function apply(ctx, config) {
  const watch = steeringWatch(ctx);
  applyJobs(adaptContext(ctx, {
    tools: tools => registering(tools, definition => definition.name === 'job_output' ? steerableTool(definition) : definition),
    jobs: jobs => steerableJobs(jobs, watch),
  }), config);
}
