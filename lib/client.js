window.__ModuleLoader__.load({ id: 'dsh-deep-ptc-mode', factory: require => {
  const React = require('react');
  const h = React.createElement;
  const NS = 'deep-ptc-settings';
  const inject = ['slots', 'locale', 'configForms'];
  const dictionaries = {
    zh: {
      title: '深度 PTC', summary: '选择执行环境，应用于之后新建的深度 PTC 会话。',
      environment: '执行环境', auto: '自动（Windows：PowerShell；macOS：Zsh；Linux：Bash）',
      wsl: 'WSL Bash（Windows）', powershell: 'PowerShell（Windows）',
      zsh: 'Zsh（macOS / Linux）', bash: '原生 Bash（macOS / Linux）',
      distribution: 'WSL 发行版', distributionHint: '留空使用 Windows 的默认发行版，例如 Ubuntu。',
      shell: 'Shell 版本', shellAuto: '自动（沿用官方查找顺序）',
      shellHint: '只列出本机已发现的常见版本。文件消失后自动回退。WSL 仍只选择发行版。',
      pluginLab: '插件实验台', pluginLabHint: '默认关闭。打开后在内存中检查、定义并经宿主批准后运行插件，不改已发布预设，也不绕过批准。',
      sessions: '保存后请新建一个“深度PTC模式”会话。已有会话与后台任务保留原环境。',
      wslHint: 'WSL 暂不支持 Windows 的受限沙箱；受限调用会明确失败，不会自动切换或绕过限制。',
      save: '保存', saving: '保存中…', saved: '已保存，新会话将使用所选环境。',
      failed: '未能保存，请检查环境是否适用于宿主、发行版名称及配置是否已被其他窗口修改。',
      readOnly: '当前设置为只读。', loading: '正在读取设置…',
    },
    en: {
      title: 'Deep PTC', summary: 'Choose the execution environment for new Deep PTC sessions.',
      environment: 'Execution environment', auto: 'Automatic (Windows: PowerShell; macOS: Zsh; Linux: Bash)',
      wsl: 'WSL Bash (Windows)', powershell: 'PowerShell (Windows)',
      zsh: 'Zsh (macOS / Linux)', bash: 'Native Bash (macOS / Linux)',
      distribution: 'WSL distribution', distributionHint: 'Leave blank for the Windows default distribution, for example Ubuntu.',
      shell: 'Shell version', shellAuto: 'Automatic (official lookup)',
      shellHint: 'Lists common executables found on this machine. A missing file falls back to automatic. WSL still selects a distribution only.',
      pluginLab: 'Plugin lab', pluginLabHint: 'Off by default. When on, inspect, define and run plugins in memory through host approval. Shipped presets stay unchanged.',
      sessions: 'After saving, create a new Deep PTC session. Existing sessions and background jobs keep their environment.',
      wslHint: 'WSL does not support the confined Windows sandbox. Confined calls fail without execution or fallback.',
      save: 'Save', saving: 'Saving…', saved: 'Saved. New sessions will use this environment.',
      failed: 'Could not save. Check host compatibility, distribution name, and concurrent configuration changes.',
      readOnly: 'Settings are read-only.', loading: 'Loading settings…',
    },
  };

  function Card({ view, form, t }) {
    const subscribe = React.useCallback(listener => form.subscribe(listener), [form]);
    const read = React.useCallback(() => form.getSnapshot(), [form]);
    const state = React.useSyncExternalStore(subscribe, read, read);
    const [environment, setEnvironment] = React.useState('auto');
    const [distribution, setDistribution] = React.useState('');
    const [shellExecutable, setShellExecutable] = React.useState('');
    const [pluginLab, setPluginLab] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [failed, setFailed] = React.useState(false);
    const draftRevision = React.useRef();
    const dirty = React.useRef(false);
    React.useEffect(() => {
      if (!state.value || dirty.current) return;
      setEnvironment(state.value.environment);
      setDistribution(state.value.wslDistribution ?? '');
      setShellExecutable(state.value.shellExecutable ?? '');
      setPluginLab(state.value.pluginLab === true);
      draftRevision.current = state.revision;
    }, [state.value, state.revision]);
    if (view === 'summary') return t('summary');
    if (state.status !== 'ready') return h('p', null, t('loading'));
    const allowed = state.value.hostPlatform === 'win32'
      ? ['auto', 'wsl', 'powershell'] : ['auto', 'zsh', 'bash'];
    const disabled = !state.writable || saving;
    const changed = () => {
      if (!dirty.current) draftRevision.current = state.revision;
      dirty.current = true;
      setMessage('');
    };
    async function save(event) {
      event.preventDefault();
      setSaving(true); setMessage(''); setFailed(false);
      try {
        const ok = await form.mutate([
          { op: 'set', path: ['environment'], value: environment },
          { op: 'set', path: ['wslDistribution'], value: distribution.trim() },
          { op: 'set', path: ['shellExecutable'], value: shellExecutable },
          { op: 'set', path: ['pluginLab'], value: pluginLab },
        ], draftRevision.current);
        if (!ok) throw new Error('Configuration was rejected');
        dirty.current = false;
        const latest = form.getSnapshot();
        draftRevision.current = latest.revision;
        setEnvironment(latest.value?.environment ?? environment);
        setDistribution(latest.value?.wslDistribution ?? distribution.trim());
        setShellExecutable(latest.value?.shellExecutable ?? shellExecutable);
        setPluginLab(latest.value?.pluginLab === true);
        setMessage(t('saved'));
      } catch {
        draftRevision.current = form.getSnapshot().revision;
        setFailed(true); setMessage(t('failed'));
      } finally { setSaving(false); }
    }
    const effective = environment === 'auto'
      ? (state.value.hostPlatform === 'win32' ? 'powershell' : state.value.hostPlatform === 'darwin' ? 'zsh' : 'bash')
      : environment;
    const choices = (Array.isArray(state.value.shellChoices) ? state.value.shellChoices : [])
      .filter(item => item && item.family === effective && typeof item.id === 'string');
    const showShell = effective !== 'wsl' && choices.length > 0;
    const control = { width: '100%', padding: '8px 10px', borderRadius: '6px',
      color: 'inherit', background: 'var(--dsw-alias-bg-base)', border: '1px solid var(--dsw-alias-border-l1)' };
    return h('form', { onSubmit: save, style: { display: 'grid', gap: '12px', maxWidth: '600px' } },
      h('label', { htmlFor: 'deep-ptc-environment' }, t('environment')),
      h('select', { id: 'deep-ptc-environment', value: environment, disabled, style: control,
        onChange: event => { changed(); setEnvironment(event.target.value); } },
      ...['auto', 'wsl', 'powershell', 'zsh', 'bash'].map(value =>
        h('option', { key: value, value, disabled: !allowed.includes(value) }, t(value)))),
      environment === 'wsl' ? h(React.Fragment, null,
        h('label', { htmlFor: 'deep-ptc-distribution' }, t('distribution')),
        h('input', { id: 'deep-ptc-distribution', value: distribution, disabled, style: control,
          onChange: event => { changed(); setDistribution(event.target.value); } }),
        h('p', null, t('distributionHint')), h('p', null, t('wslHint'))) : null,
      showShell ? h(React.Fragment, null,
        h('label', { htmlFor: 'deep-ptc-shell' }, t('shell')),
        h('select', { id: 'deep-ptc-shell', value: shellExecutable, disabled, style: control,
          onChange: event => { changed(); setShellExecutable(event.target.value); } },
        h('option', { value: '' }, t('shellAuto')),
        ...choices.map(item => h('option', { key: item.id, value: item.id }, item.label))),
        h('p', null, t('shellHint'))) : null,
      h('label', { htmlFor: 'deep-ptc-plugin-lab' },
        h('input', { id: 'deep-ptc-plugin-lab', type: 'checkbox', checked: pluginLab, disabled,
          onChange: event => { changed(); setPluginLab(event.target.checked); } }),
        ' ', t('pluginLab')),
      h('p', null, t('pluginLabHint')),
      h('p', null, t('sessions')),
      !state.writable ? h('p', { role: 'status' }, t('readOnly')) : null,
      message ? h('p', { role: failed ? 'alert' : 'status' }, message) : null,
      h('button', { type: 'submit', disabled, style: { justifySelf: 'start', padding: '7px 16px' } }, t(saving ? 'saving' : 'save')),
    );
  }

  function ToolStateControls({ useProjection, reset, t }) {
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const generation = React.useRef(0);
    React.useEffect(() => { generation.current++; setBusy(false); setMessage(''); return () => { generation.current++; }; }, [reset]);
    let preset, state;
    try {
      if (typeof useProjection !== 'function') return null;
      preset = useProjection('agentPreset');
      state = useProjection('deepPtcTools');
    } catch { return null; }
    if (preset !== 'deep-ptc' || !state || typeof state !== 'object') return null;
    const failed = state?.report?.tools ?? [];
    async function reload() {
      const current = generation.current;
      setBusy(true); setMessage('');
      try {
        const outcome = await reset();
        if (current !== generation.current) return;
        if (outcome?.ok === false) throw new Error(outcome.error?.message || t('toolResetFailed'));
        const reply = outcome?.ok === true ? outcome.value : outcome;
        const result = reply?.result ?? reply;
        if (result?.kind !== 'success') throw new Error(result?.text || t('toolResetFailed'));
        setMessage(t('toolResetDone'));
      } catch (error) { if (current === generation.current) setMessage(t('toolResetFailed') + ': ' + String(error?.message ?? error).slice(0,220)); }
      finally { if (current === generation.current) setBusy(false); }
    }
    return h('div', { style: { display: 'grid', gap: '4px', padding: '4px 0', fontSize: '12px' } },
      failed.length ? h('details', { role: 'status' },
        h('summary', null, `${t('toolFailures')} (${failed.length})`),
        h('p', null, t('toolFailureHint')),
        h('ul', null, ...failed.map(row => h('li', { key: row.name }, `${row.name} — ${row.provider}`)))) : null,
      h('button', { type: 'button', onClick: reload, disabled: busy, title: t('toolResetHint'),
        style: { justifySelf: 'start', font: 'inherit', color: 'inherit', cursor: busy ? 'wait' : 'pointer' } }, busy ? t('toolResetBusy') : t('toolReset')),
      message ? h('span', { role: 'status' }, message) : null);
  }
  Object.assign(dictionaries.zh, {
    toolReset: '重载所有工具状态', toolResetBusy: '正在重载…', toolResetDone: '本对话工具状态已重载。',
    toolResetFailed: '重载失败，请确认当前连接及操作权限。', toolResetHint: '清除本对话的故障标记和按需加载选择；正在运行的任务继续执行。',
    toolFailures: '工具适配提醒', toolFailureHint: '以下外部工具调用失败，可能存在适配问题，已在本对话中禁用。任务会优先使用其他可用工具；未进一步排查故障原因。',
  });
  Object.assign(dictionaries.en, {
    toolReset: 'Reload all tool states', toolResetBusy: 'Reloading…', toolResetDone: 'Tool states reloaded for this conversation.',
    toolResetFailed: 'Reload failed. Check the connection and access permissions.', toolResetHint: 'Clear quarantine and on-demand selections in this conversation. Running jobs continue.',
    toolFailures: 'Tool compatibility notice', toolFailureHint: 'These external tools failed and may have compatibility issues. They are disabled in this conversation. Continue with working alternatives; no root-cause investigation was performed.',
  });
  function apply(ctx) {
    const t = ctx.locale.bind('deep-ptc');
    ctx.effect(() => ctx.locale.register('deep-ptc', dictionaries));
    const form = ctx.configForms.get(NS);
    ctx.effect(() => ctx.configForms.whileServed([NS], () =>
      ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item', id: 'deep-ptc', order: 41,
        label: () => t('title'), locale: 'deep-ptc',
      }, props => h(Card, { ...props, form, t })))));
    try {
      ctx.inject?.(['remote', 'remote.commands'], child => {
        try {
          child.slots.inject('conversation.composer.dock', () => child.slots.register({
            name: 'conversation.composer.dock', id: 'deep-ptc-tool-states', order: 90,
            inject: sessionId => ({
              reset: () => {
                const execute = child.remote?.commands?.execute;
                if (typeof execute !== 'function') return Promise.resolve({ ok: false, error: { message: 'unavailable' } });
                return execute(sessionId, '/deep-ptc-reset-tools', []);
              },
            }),
          }, props => h(ToolStateControls, { ...props, t })));
        } catch { /* a broken dock must not take the composer with it */ }
      });
    } catch { /* the composer stays usable when this slot cannot register */ }
  }
  return { apply, inject };
} });
