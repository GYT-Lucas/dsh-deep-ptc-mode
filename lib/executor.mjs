import z from '@deepseek-ai/schemastery';
import { importHost, pluginOf } from './host.mjs';
import { assertExecutionPolicy, shellArgv } from './model.mjs';

export const name = 'deep-ptc-mapped-executor';
export const inject = [];
export const Config = z.object({
  environment: z.union(['wsl', 'zsh', 'bash']).required(),
  wslDistribution: z.string().default(''),
  shellExecutable: z.string().default(''),
  // The official bash executor module and its options, as the installed base declaration names them.
  base: z.string().required(),
  options: z.any(),
});

function argvOf(environment, spec, distribution, executable) {
  return shellArgv(environment, spec, distribution, process.platform, executable);
}

// Extend the official bash executor: its process handles, output retention, cancellation, jobs,
// sandbox and Config stay official; only the argv that starts the shell changes.
export function mappedExecutor(Base, environment, distribution = '', executable = '') {
  const explicit = typeof executable === 'string' && executable !== '';
  return class MappedShellExecutor extends Base {
    async execute(spec) {
      assertExecutionPolicy(environment, spec.sandboxPolicy);
      if (spec.sandboxPolicy.mode !== 'danger-full-access') return super.execute(spec);
      const process = await super.executeArgv(spec, argvOf(environment, spec, distribution, executable));
      return Base.decorateResult(process, result => ({
        ...result, sandbox: { mode: spec.sandboxPolicy.mode, denied: false },
      }));
    }

    // Current sandboxes enter through run/start. Confined calls use confine, so the chosen
    // binary stays inside the official sandbox. Full access keeps the same denial stamp as before.
    async run(spec) {
      if (!explicit || typeof super.run !== 'function') return super.run?.call(this, spec) ?? this.execute(spec);
      assertExecutionPolicy(environment, spec.sandboxPolicy);
      if (spec.sandboxPolicy?.mode !== 'danger-full-access') return super.run(spec);
      if (typeof super.runArgv !== 'function') return this.execute(spec);
      const result = await super.runArgv(spec, argvOf(environment, spec, distribution, executable));
      return { ...result, sandbox: { mode: spec.sandboxPolicy.mode, denied: false } };
    }

    start(spec) {
      if (!explicit || typeof super.start !== 'function') return super.start?.call(this, spec);
      assertExecutionPolicy(environment, spec.sandboxPolicy);
      if (spec.sandboxPolicy?.mode !== 'danger-full-access') return super.start(spec);
      if (typeof this.startArgv !== 'function') return super.start(spec);
      return this.startArgv(spec, argvOf(environment, spec, distribution, executable));
    }

    confine(command, policy, signal) {
      assertExecutionPolicy(environment, policy);
      return this.ctx.sandbox.confine(argvOf(environment,
        { command, workdir: policy.workspaceRoot }, distribution, executable), policy, signal);
    }
  };
}

export async function apply(ctx, config) {
  const Base = pluginOf(await importHost(config.base));
  if (typeof Base !== 'function' || typeof Base.decorateResult !== 'function' || typeof Base.prototype.executeArgv !== 'function')
    throw new Error(`${config.base} no longer exposes the executor API Deep PTC extends; choose PowerShell or native Bash`);
  ctx.plugin(mappedExecutor(Base, config.environment, config.wslDistribution, config.shellExecutable), config.options);
}
