export const ENVIRONMENTS = ['auto', 'wsl', 'powershell', 'zsh', 'bash'];

export function availableEnvironments(platform) {
  return platform === 'win32' ? ['auto', 'wsl', 'powershell'] : ['auto', 'zsh', 'bash'];
}

export function resolveEnvironment(environment = 'auto', platform = process.platform) {
  if (!availableEnvironments(platform).includes(environment)) {
    throw new Error(`Execution environment ${JSON.stringify(environment)} is unavailable on ${platform}`);
  }
  return environment === 'auto'
    ? (platform === 'win32' ? 'powershell' : platform === 'darwin' ? 'zsh' : 'bash')
    : environment;
}

export function normalizeDistribution(value = '') {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('WSL distribution must be a name without control characters');
  }
  const distribution = value.trim();
  if (distribution.startsWith('-')) throw new Error('WSL distribution must not start with a dash');
  return distribution;
}

export function shellArgv(environment, spec, distribution = '', platform = process.platform) {
  if (environment === 'wsl') {
    if (platform !== 'win32') throw new Error('WSL requires a Windows host');
    const distro = normalizeDistribution(distribution);
    return ['wsl.exe', ...(distro ? ['--distribution', distro] : []),
      '--cd', spec.workdir, '--exec', 'bash', '-lc', spec.command];
  }
  if (environment === 'zsh') return [platform === 'darwin' ? '/bin/zsh' : 'zsh', '-lc', spec.command];
  throw new Error(`No mapped executor for ${environment}`);
}

export function assertExecutionPolicy(environment, policy) {
  if (environment === 'wsl' && policy?.mode !== 'danger-full-access') {
    throw new Error('WSL execution is not supported under a confined Windows sandbox. Select PowerShell for confined work, or use the host\'s existing approval flow for this exact command. No command was executed.');
  }
}

export function environmentText(environment, distribution = '') {
  const descriptions = {
    wsl: `Execution environment: WSL Bash${distribution ? ` (${distribution})` : ' (Windows default distribution)'}. The bash tool runs POSIX source via wsl.exe and bash -lc. File tools and the tool workdir use Windows host paths; Linux paths belong inside command source. WSL is available only in danger-full-access; a confined call fails without execution. Never silently fall back to PowerShell or another distribution.`,
    powershell: 'Execution environment: native Windows PowerShell. Use the pwsh tool and PowerShell syntax, native Windows paths and $env:NAME. This selection takes precedence over older workspace guidance that assumed WSL. The configured sandbox and approval policy still apply.',
    zsh: 'Execution environment: native Zsh. Use the zsh tool with Zsh/POSIX command source. On macOS the executor is /bin/zsh -lc; elsewhere zsh must be installed. File tools and workdir use native host paths. The configured sandbox and approval policy still apply.',
    bash: 'Execution environment: native Bash on macOS/Linux. Use the bash tool with Bash/POSIX command source and native host paths. This is not WSL. The configured sandbox and approval policy still apply.',
  };
  if (!descriptions[environment]) throw new Error(`Unknown environment ${environment}`);
  return descriptions[environment];
}

export const DEFAULT_FOREGROUND_SECONDS = 30;
export const QUESTION_SECONDS = 120;

export function normalizeForegroundSeconds(value = DEFAULT_FOREGROUND_SECONDS) {
  if (!Number.isInteger(value) || value < 5 || value > 600) throw new Error('Foreground wait must be a whole number of seconds from 5 to 600');
  return value;
}

// Official rows Deep PTC replaces with wrappers of the same package, by row id.
export const WRAPPED_ROWS = {
  'tool-jobs': '@deepseek-ai/dsh-tool-jobs',
  'tool-ask-user': '@deepseek-ai/dsh-tool-ask-user',
};

export function configuredPreset(template, options, platform = process.platform) {
  const environment = resolveEnvironment(options.environment, platform);
  const distribution = normalizeDistribution(options.wslDistribution);
  const foregroundSeconds = normalizeForegroundSeconds(options.foregroundSeconds);
  const foregroundMs = foregroundSeconds * 1000;
  const preset = structuredClone(template);
  const first = preset.plugins.findIndex(row => row.id === 'tool-bash');
  if (first < 0 || preset.plugins[first + 1]?.id !== 'tool-pwsh') throw new Error('Upstream shell layout changed; review compatibility before loading');
  for (const [id, upstream] of Object.entries(WRAPPED_ROWS)) {
    const row = preset.plugins.find(candidate => candidate.id === id);
    if (row?.name !== upstream || row.config !== undefined) throw new Error(`Upstream ${id} row changed; review compatibility before loading`);
  }
  // With background jobs available, the executor timeout only decides when a foreground command moves
  // to the background; the official tools run such commands with onExpiry: none.
  const executor = {
    id: 'executor',
    name: environment === 'powershell' ? '@deepseek-ai/dsh-pwsh-sandbox'
      : environment === 'bash' ? '@deepseek-ai/dsh-bash-sandbox' : 'dsh-deep-ptc-mode/executor',
    config: {
      ...(environment === 'wsl' || environment === 'zsh' ? { environment, wslDistribution: distribution } : {}),
      timeoutMs: foregroundMs, maxTimeoutMs: foregroundMs,
    },
  };
  const terminal = {
    id: environment === 'zsh' ? 'tool-zsh' : environment === 'powershell' ? 'tool-pwsh' : 'tool-bash',
    name: 'dsh-deep-ptc-mode/terminal',
    config: { tool: environment === 'powershell' ? 'pwsh' : 'bash', ...(environment === 'zsh' ? { dialect: 'zsh' } : {}) },
  };
  preset.plugins.splice(first, 2, {
    id: 'execution', name: 'cordis:group', group: true, isolate: { shell: true },
    config: [executor, terminal, { id: 'execution-instructions', name: 'dsh-deep-ptc-mode/environment',
      config: { environment, wslDistribution: distribution } }],
  }, {
    id: 'reachability', name: 'dsh-deep-ptc-mode/guard', config: { foregroundSeconds },
  });
  Object.assign(preset.plugins.find(row => row.id === 'tool-jobs'), {
    name: 'dsh-deep-ptc-mode/jobs-tool', config: { waitTimeoutMs: foregroundMs, maxWaitTimeoutMs: foregroundMs },
  });
  Object.assign(preset.plugins.find(row => row.id === 'tool-ask-user'), {
    name: 'dsh-deep-ptc-mode/ask-user', config: { mode: 'timed', timeout: QUESTION_SECONDS },
  });
  preset.description = `${template.description} 当前环境：${environment}${environment === 'wsl' && distribution ? ` (${distribution})` : ''}`;
  return preset;
}
