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
        ], draftRevision.current);
        if (!ok) throw new Error('Configuration was rejected');
        dirty.current = false;
        const latest = form.getSnapshot();
        draftRevision.current = latest.revision;
        setEnvironment(latest.value?.environment ?? environment);
        setDistribution(latest.value?.wslDistribution ?? distribution.trim());
        setShellExecutable(latest.value?.shellExecutable ?? shellExecutable);
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
      h('p', null, t('sessions')),
      !state.writable ? h('p', { role: 'status' }, t('readOnly')) : null,
      message ? h('p', { role: failed ? 'alert' : 'status' }, message) : null,
      h('button', { type: 'submit', disabled, style: { justifySelf: 'start', padding: '7px 16px' } }, t(saving ? 'saving' : 'save')),
    );
  }

  function ToolStateControls({ sessionId, useProjection, reset, t }) {
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const generation = React.useRef(0);
    React.useEffect(() => { generation.current++; setBusy(false); setMessage(''); return () => { generation.current++; }; }, [sessionId]);
    let preset, state;
    try {
      if (typeof useProjection !== 'function') return null;
      preset = useProjection('agentPreset');
      state = useProjection('deepPtcTools');
    } catch { return null; }
    if (preset !== 'deep-ptc') return null;
    // The failure list needs the tool-state projection; the reset command does not.
    const failed = state && typeof state === 'object' ? state.report?.tools ?? [] : [];
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
    return h('section', { className: 'dpt-side-section dpt-side-tools', 'aria-label': t('toolsSection') },
      h('div', { className: 'dpt-side-label' }, h('span', null, t('toolsSection')),
        failed.length ? h('span', { className: 'dpt-side-hint', 'data-tone': 'warn' }, `${t('toolFailures')} ${failed.length}`) : null),
      failed.length ? h('div', { className: 'dpt-tool-failures', role: 'status' },
        h('p', null, t('toolFailureHint')),
        h('ul', null, ...failed.map(row => h('li', { key: row.name }, h('code', null, row.name), ` — ${row.provider}`)))) : null,
      h('button', { type: 'button', className: 'dpt-btn dpt-btn-block', onClick: reload, disabled: busy, title: t('toolResetHint'), 'aria-busy': busy },
        busy ? t('toolResetBusy') : t('toolReset')),
      h('p', { className: 'dpt-side-note', role: 'status', 'data-tone': message ? (message === t('toolResetDone') ? 'ok' : 'error') : undefined },
        message || t('toolResetHint')));
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
  Object.assign(dictionaries.zh, {
    skillTitle: '当前上下文中的 Skill', skillLoaded: '{count} 个已加载', skillClosing: '{count} 个将在下一条消息后移除',
    skillHint: '关闭的 Skill 会在你发送下一条消息时移出上下文，历史记录不受影响。',
    skillKeepAll: '全部保留', skillCloseAll: '全部关闭', skillNoDescription: '无描述', skillThisTurn: '本轮',
    skillShowAll: '显示全部 {count} 个', skillShowLess: '收起',
    agentsTitle: '子代理', agentsRunning: '{count} 个运行中', agentsCompleted: '{count} 个已完成', agentsIdle: '{count} 个空闲',
    agentRunning: '运行中', agentCompleted: '已完成', agentIdle: '空闲', agentExternal: '外部',
    agentsCollapse: '收起侧边卡片', agentsExpand: '展开侧边卡片', agentOpen: '在右侧栏打开这个子代理的对话',
    sideTitle: '深度 PTC', toolsSection: '工具状态', envAuto: '自动', envForNew: '新会话生效', envThisSession: '本会话保持创建时的环境。',
    envAutoNow: '当前按自动选择：{env}。本会话保持创建时的环境。', envSaved: '已保存，之后新建的会话使用 {env}。',
    envFailed: '未能保存，请检查发行版名称或设置是否已在别处修改。', envDefaultDistribution: '默认发行版',
    durationSeconds: '{s} 秒', durationMinutes: '{m} 分 {s} 秒', durationHours: '{h} 小时 {m} 分', tokens: '{value} tokens',
    palTitle: '命令面板', palPlaceholder: '搜索会话，或输入命令…', palEmpty: '没有匹配的结果', palFoot: '↑↓ 选择　↵ 打开　Esc 关闭',
    palCommand: '命令', palEffect: '特效', palSession: '会话', palNewSub: '开始一个新的对话', palPluginsSub: '打开插件页面',
    palAutomationSub: '打开自动化任务', palAgents: '侧边卡片：展开 / 收起', palAgentsSub: '执行环境与子代理',
    palFireworks: '放烟花', palFireworksSub: '庆祝一下',
  });
  Object.assign(dictionaries.en, {
    skillTitle: 'Skills in context', skillLoaded: '{count} loaded', skillClosing: '{count} leave after your next message',
    skillHint: 'A closed skill leaves the model context when you send your next message. The history stays complete.',
    skillKeepAll: 'Keep all', skillCloseAll: 'Close all', skillNoDescription: 'No description', skillThisTurn: 'this turn',
    skillShowAll: 'Show all {count}', skillShowLess: 'Show less',
    agentsTitle: 'Subagents', agentsRunning: '{count} running', agentsCompleted: '{count} done', agentsIdle: '{count} idle',
    agentRunning: 'Running', agentCompleted: 'Done', agentIdle: 'Idle', agentExternal: 'External',
    agentsCollapse: 'Collapse the side card', agentsExpand: 'Expand the side card', agentOpen: 'Open this subagent in the right sidebar',
    sideTitle: 'Deep PTC', toolsSection: 'Tool state', envAuto: 'Auto', envForNew: 'for new sessions', envThisSession: 'This session keeps the environment it was created with.',
    envAutoNow: 'Automatic picks {env}. This session keeps the environment it was created with.', envSaved: 'Saved. New sessions use {env}.',
    envFailed: 'Could not save. Check the distribution name, or whether settings changed elsewhere.', envDefaultDistribution: 'Default distribution',
    durationSeconds: '{s}s', durationMinutes: '{m}m {s}s', durationHours: '{h}h {m}m', tokens: '{value} tokens',
    palTitle: 'Command palette', palPlaceholder: 'Search sessions or type a command…', palEmpty: 'No matches', palFoot: '↑↓ select   ↵ open   Esc close',
    palCommand: 'Command', palEffect: 'Effect', palSession: 'Session', palNewSub: 'Start a new conversation', palPluginsSub: 'Open plugins',
    palAutomationSub: 'Open automations', palAgents: 'Side card: expand / collapse', palAgentsSub: 'Execution environment and subagents',
    palFireworks: 'Fireworks', palFireworksSub: 'Celebrate',
  });

  // Placeholders are filled here, so the text is right whether or not the host locale interpolates.
  const fill = (text, values) => String(text).replace(/\{(\w+)\}/gu, (whole, key) => values[key] === undefined ? whole : String(values[key]));
  const tf = (t, key, values) => fill(t(key, values), values);
  let T = key => key;
  let hostCtx;
  let ReactDOM;
  try { ReactDOM = require('react-dom'); } catch { ReactDOM = undefined; }
  const canPortal = () => typeof ReactDOM?.createPortal === 'function' && typeof document !== 'undefined';

  // ---------------------------------------------------------------------------------------------
  // Stylesheet. The cards are only rendered in Deep PTC sessions. The refined look and its motion
  // (ported from dsh-refined-ui, without its floating task windows) apply only while the
  // conversation on screen is a Deep PTC session: every rule is scoped by body[data-dpt-ui].
  // ---------------------------------------------------------------------------------------------
  const PLUGIN = 'dsh-deep-ptc-mode';
  const ON = 'body[data-dpt-ui]';
  const ON0 = ':where(body[data-dpt-ui])';
  const DARK = 'body[data-ds-dark-theme]:not([data-ds-dark-theme="false"])';
  const ON_DARK = 'body[data-dpt-ui][data-ds-dark-theme]:not([data-ds-dark-theme="false"])';
  const CARD_CSS = `
.dpt-card,.dpt-agents,.dpt-agents-pill{--dpt-accent:var(--dpt-brand,#3370ff);--dpt-ease:cubic-bezier(.22,1,.36,1)}
.dpt-card{--dpt-card-fill:var(--dsw-static-neutral-50,#f7f8fa);box-sizing:border-box;width:100%;margin:2px 0 4px;border:.5px solid var(--dsw-alias-border-l2,#d6dce6);border-radius:var(--dsw-radius-lg,16px);background:var(--dpt-card-fill);color:var(--dsw-alias-label-primary,#101828);font-size:13px;line-height:20px;overflow:hidden;animation:dpt-rise 220ms var(--dpt-ease) both}
${DARK} .dpt-card{--dpt-card-fill:var(--dsw-static-neutral-850,#1a1f29)}
.dpt-card-head{display:flex;align-items:center;gap:10px;padding:10px 12px 6px}
.dpt-card-icon{flex:none;display:grid;place-items:center;width:32px;height:32px;box-sizing:border-box;border-radius:10px;border:.5px solid color-mix(in srgb,var(--dpt-accent) 22%,transparent);background:color-mix(in srgb,var(--dpt-accent) 10%,transparent);color:var(--dpt-accent)}
.dpt-card-titles{flex:1;min-width:0;display:flex;flex-direction:column}
.dpt-card-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpt-card-sub{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#667085);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpt-card-sub [data-tone="warn"]{color:var(--dsw-alias-state-warn-primary,#b45309)}
.dpt-card-actions{flex:none;display:flex;gap:6px}
.dpt-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:26px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l3,#c9d0db);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-button-floating-fill,#fff);color:var(--dsw-alias-label-primary,#101828);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer;transition:background-color 120ms,border-color 120ms,opacity 120ms}
.dpt-btn:hover:not(:disabled){background:var(--dsw-alias-button-floating-hover,var(--dsw-alias-interactive-bg-hover,rgba(16,24,40,.05)))}
.dpt-btn:disabled{opacity:.45;cursor:default}
.dpt-btn[aria-busy="true"]{cursor:wait}
.dpt-btn:focus-visible,.dpt-switch:focus-visible,.dpt-agent:focus-visible,.dpt-icon-btn:focus-visible,.dpt-link:focus-visible,.dpt-agents-pill:focus-visible{outline:2px solid var(--dpt-accent,#3370ff);outline-offset:2px}
.dpt-skill-list{list-style:none;margin:0;padding:0 4px 4px;display:flex;flex-direction:column;gap:2px}
.dpt-skill{display:flex;align-items:center;gap:12px;padding:7px 8px 7px 10px;border-radius:10px;transition:background-color 120ms}
.dpt-skill:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(16,24,40,.05))}
.dpt-skill-text{flex:1;min-width:0;display:flex;flex-direction:column;transition:opacity 160ms}
.dpt-skill[data-off] .dpt-skill-text{opacity:.5}
.dpt-skill-name{display:flex;align-items:center;gap:6px;min-width:0;font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:12.5px;font-weight:500;line-height:20px}
.dpt-skill-name>span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpt-skill[data-off] .dpt-skill-name>span:first-child{text-decoration:line-through;text-decoration-color:var(--dsw-alias-label-tertiary,#667085)}
.dpt-tag{flex:none;font-family:var(--ds-font-family,inherit);font-size:10px;line-height:16px;padding:0 6px;border-radius:999px;font-weight:500;background:color-mix(in srgb,var(--dpt-accent) 12%,transparent);color:var(--dpt-accent)}
.dpt-skill-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#667085);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpt-switch{position:relative;flex:none;width:32px;height:18px;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-border-l2,#cfd5df);cursor:pointer;transition:background-color 160ms var(--dpt-ease,ease)}
.dpt-switch[aria-checked="true"]{background:var(--dpt-accent,#3370ff)}
.dpt-switch:disabled{opacity:.5;cursor:default}
.dpt-switch-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.28);transition:transform 160ms var(--dpt-ease,ease)}
.dpt-switch[aria-checked="true"] .dpt-switch-thumb{transform:translateX(14px)}
.dpt-card-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0;padding:8px 14px 10px;border-top:.5px solid var(--dsw-alias-border-l1,#e3e7ee);font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#667085)}
.dpt-link{flex:none;border:0;background:none;padding:0;font:inherit;color:var(--dpt-accent,#3370ff);cursor:pointer}
.dpt-agents{position:fixed;z-index:40;box-sizing:border-box;width:248px;display:flex;flex-direction:column;border-radius:16px;border:.5px solid var(--dsw-alias-border-l2,#d6dce6);background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 88%,transparent);-webkit-backdrop-filter:blur(16px) saturate(1.2);backdrop-filter:blur(16px) saturate(1.2);box-shadow:0 10px 30px rgba(16,24,40,.08),0 1px 3px rgba(16,24,40,.06);color:var(--dsw-alias-label-primary,#101828);font-size:13px;line-height:20px;overflow:hidden;animation:dpt-rise 220ms var(--dpt-ease) both}
${DARK} .dpt-agents,${DARK} .dpt-agents-pill{box-shadow:0 10px 30px rgba(0,0,0,.45),0 1px 3px rgba(0,0,0,.35)}
.dpt-agents-head{display:flex;align-items:center;gap:8px;padding:10px 8px 6px 14px}
.dpt-agents-title{flex:none;font-weight:600}
.dpt-agents-count{flex:1;min-width:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#667085);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpt-icon-btn{flex:none;display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#4a5565);cursor:pointer}
.dpt-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(16,24,40,.05))}
.dpt-side-body{overflow:auto;min-height:0}
.dpt-side-section{padding:2px 14px 12px}
.dpt-side-section+.dpt-side-section{border-top:.5px solid var(--dsw-alias-border-l1,#e3e7ee);padding-top:10px}
.dpt-side-agents{padding-left:8px;padding-right:8px}
.dpt-side-agents>.dpt-side-label{padding:0 6px}
.dpt-side-label{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-secondary,#4a5565)}
.dpt-side-hint{min-width:0;font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary,#667085);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpt-seg{display:flex;gap:2px;padding:2px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover,rgba(16,24,40,.05))}
.dpt-seg-btn{flex:1;min-width:0;height:26px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#4a5565);font:inherit;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:background-color 120ms,color 120ms,box-shadow 120ms}
.dpt-seg-btn:hover:not(:disabled):not([aria-checked="true"]){color:var(--dsw-alias-label-primary,#101828)}
.dpt-seg-btn[aria-checked="true"]{background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#101828);font-weight:600;box-shadow:0 1px 2px rgba(16,24,40,.12),0 0 0 .5px var(--dsw-alias-border-l1,#e3e7ee)}
.dpt-seg-btn:disabled{cursor:default}
.dpt-seg-btn:focus-visible,.dpt-input:focus-visible,.dpt-select:focus-visible{outline:2px solid var(--dpt-accent,#3370ff);outline-offset:1px}
.dpt-field{display:flex;gap:6px;margin-top:8px}
.dpt-input,.dpt-select{flex:1;min-width:0;box-sizing:border-box;height:28px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2,#d6dce6);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;font-size:12px}
.dpt-btn-block{display:flex;width:100%}
.dpt-side-hint[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary,#b45309)}
.dpt-tool-failures{margin:0 0 8px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 10%,transparent);font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#4a5565)}
.dpt-tool-failures p{margin:0 0 4px}
.dpt-tool-failures ul{margin:0;padding-left:16px}
.dpt-tool-failures code{font-family:var(--ds-font-family-code,ui-monospace,monospace)}
.dpt-side-note{margin:6px 0 0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#667085)}
.dpt-side-note[data-tone="ok"]{color:var(--dsw-alias-state-success-primary,#0f7a4f)}
.dpt-side-note[data-tone="error"]{color:var(--dsw-alias-state-error-primary,#c4321f)}
.dpt-agents-list{list-style:none;margin:0;padding:0;overflow:visible;min-height:0}
.dpt-agent{display:flex;align-items:flex-start;gap:10px;width:100%;box-sizing:border-box;padding:7px 8px 7px calc(8px + var(--dpt-depth,0) * 14px);border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background-color 120ms}
.dpt-agent:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(16,24,40,.05))}
.dpt-agent:disabled{cursor:default}
.dpt-agent-dot{flex:none;width:8px;height:8px;margin-top:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#98a2b3)}
.dpt-agent[data-state="running"] .dpt-agent-dot{background:var(--dpt-accent,#3370ff);animation:dpt-ping 1.4s ease-out infinite}
.dpt-agent[data-state="completed"] .dpt-agent-dot{background:var(--dsw-alias-state-success-primary,#0f7a4f)}
.dpt-agent-main{flex:1;min-width:0;display:flex;flex-direction:column}
.dpt-agent-name{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpt-agent-meta{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#667085);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpt-agent[data-state="running"] .dpt-agent-meta{color:var(--dpt-accent,#3370ff)}
.dpt-agents-pill{position:fixed;z-index:40;display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 12px;box-sizing:border-box;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2,#d6dce6);background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 88%,transparent);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);box-shadow:0 6px 20px rgba(16,24,40,.08);color:var(--dsw-alias-label-primary,#101828);font:inherit;font-size:12px;cursor:pointer;animation:dpt-rise 220ms var(--dpt-ease) both}
.dpt-agents-pill .dpt-agent-dot{margin-top:0}
.dpt-agents-pill[data-state="running"] .dpt-agent-dot{background:var(--dpt-accent,#3370ff);animation:dpt-ping 1.4s ease-out infinite}
[data-conversation-region="chat"][data-dpt-docked] [data-conversation-scroll]{box-sizing:border-box;padding-right:268px}
[data-chat-flow-kind="command"]:has([data-dpt-hidden-command]){display:none!important}
.dpt-command-error{padding:4px 2px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#c4321f)}
@keyframes dpt-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes dpt-ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dpt-accent,#3370ff) 45%,transparent)}100%{box-shadow:0 0 0 6px color-mix(in srgb,var(--dpt-accent,#3370ff) 0%,transparent)}}
@media (prefers-reduced-motion:reduce){.dpt-card,.dpt-agents,.dpt-agents-pill,.dpt-agent-dot,.dpt-switch,.dpt-switch-thumb{animation:none!important;transition:none!important}}
`;
  const THEME_CSS = `
${ON}{--dpt-dur-fast:120ms;--dpt-dur-base:200ms;--dpt-ease-out:cubic-bezier(0.22,1,0.36,1);--dpt-brand:#3370ff;--dpt-brand-ink:#1f4fc4;--dpt-brand-light:color-mix(in srgb,var(--dpt-brand) 70%,#7fd0ff)}
${ON}{
  --dsw-alias-bg-base:#ffffff !important;--dsw-alias-surface-2:#f5f7fa !important;
  --dsw-alias-label-primary:#101828 !important;--dsw-alias-label-secondary:#4a5565 !important;--dsw-alias-label-tertiary:#667085 !important;
  --dsw-alias-text-primary:#101828 !important;--dsw-alias-text-secondary:#4a5565 !important;
  --dsw-alias-border-l1:#e3e7ee !important;--dsw-alias-border-l2:#d6dce6 !important;--dsw-alias-border-l2-darkmode-thin:#d6dce6 !important;
  --dsw-alias-interactive-bg-hover:rgba(16,24,40,0.05) !important;--dsw-alias-bg-hover:rgba(16,24,40,0.05) !important;
  --dsw-alias-interactive-bg-hover-danger:rgba(196,50,31,0.10) !important;--dsw-alias-bg-danger:rgba(196,50,31,0.10) !important;
  --dsw-alias-state-error-primary:#c4321f !important;--dsw-alias-text-danger:#c4321f !important;--dsw-alias-border-danger:#c4321f !important;
  --dsw-alias-state-success-primary:#0f7a4f !important;--dsw-alias-text-success:#0f7a4f !important;
  --dsw-alias-state-warning-primary:#8a5a00 !important;--dsw-alias-text-warning:#8a5a00 !important;
  --dsw-specific-bubble:#eaf1ff !important;--dsw-specific-input-major:#ffffff !important;
  --dsw-shadow-lv1:0 1px 2px rgba(16,24,40,0.06),0 4px 14px rgba(16,24,40,0.06) !important;
  --dsh-scrollbar-thumb:rgba(16,24,40,0.16) !important;--dsh-scrollbar-thumb-hover:rgba(16,24,40,0.32) !important;
  --ds-font-family:"Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI","PingFang SC","HarmonyOS Sans SC",system-ui,sans-serif !important;
  --ds-font-family-code:"JetBrains Mono","Cascadia Code","SF Mono",ui-monospace,Consolas,monospace !important;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
${ON_DARK}{
  --dsw-alias-bg-base:#0e1117 !important;--dsw-alias-surface-2:#161b24 !important;
  --dsw-alias-label-primary:#eef2f8 !important;--dsw-alias-label-secondary:#a3adbd !important;--dsw-alias-label-tertiary:#8a94a6 !important;
  --dsw-alias-text-primary:#eef2f8 !important;--dsw-alias-text-secondary:#a3adbd !important;
  --dsw-alias-border-l1:#263041 !important;--dsw-alias-border-l2:#2f3b50 !important;--dsw-alias-border-l2-darkmode-thin:#2f3b50 !important;
  --dsw-alias-interactive-bg-hover:rgba(238,242,248,0.07) !important;--dsw-alias-bg-hover:rgba(238,242,248,0.07) !important;
  --dsw-alias-interactive-bg-hover-danger:rgba(255,123,104,0.14) !important;--dsw-alias-bg-danger:rgba(255,123,104,0.14) !important;
  --dsw-alias-state-error-primary:#ff7b68 !important;--dsw-alias-text-danger:#ff7b68 !important;--dsw-alias-border-danger:#ff7b68 !important;
  --dsw-alias-state-success-primary:#4cc38a !important;--dsw-alias-text-success:#4cc38a !important;
  --dsw-alias-state-warning-primary:#e0a93b !important;--dsw-alias-text-warning:#e0a93b !important;
  --dsw-specific-bubble:#1b2f5c !important;--dsw-specific-input-major:#161b24 !important;
  --dsw-shadow-lv1:0 1px 2px rgba(0,0,0,0.4),0 4px 14px rgba(0,0,0,0.35) !important;
  --dsh-scrollbar-thumb:rgba(238,242,248,0.18) !important;--dsh-scrollbar-thumb-hover:rgba(238,242,248,0.34) !important;
  --dpt-brand:#5b8cff;--dpt-brand-ink:#9dbcff;
}
${ON0} :where(button,[role="button"],[role="menuitem"],[role="tab"],a,summary,select,input,textarea){
  transition:background-color var(--dpt-dur-fast) var(--dpt-ease-out),color var(--dpt-dur-fast) var(--dpt-ease-out),border-color var(--dpt-dur-fast) var(--dpt-ease-out),box-shadow var(--dpt-dur-base) var(--dpt-ease-out),opacity var(--dpt-dur-fast) var(--dpt-ease-out);
}
${ON0} :where(button:active:not(:disabled),[role="button"]:active:not([aria-disabled="true"])){transform:scale(0.98)}
${ON} ::selection{background:color-mix(in srgb,var(--dpt-brand) 24%,transparent)}
${ON} [data-dpt-composer]{box-shadow:0 10px 30px rgba(16,24,40,0.07),0 2px 6px rgba(16,24,40,0.05);transition:border-color var(--dpt-dur-base) var(--dpt-ease-out),box-shadow var(--dpt-dur-base) var(--dpt-ease-out),transform var(--dpt-dur-base) var(--dpt-ease-out)}
${ON_DARK} [data-dpt-composer]{box-shadow:0 10px 30px rgba(0,0,0,0.45),0 2px 6px rgba(0,0,0,0.35)}
${ON} [data-dpt-composer]::before{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1.5px;pointer-events:none;background:linear-gradient(115deg,var(--dpt-brand),var(--dpt-brand-light),var(--dpt-brand),var(--dpt-brand-light));background-size:300% 100%;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:0;transition:opacity var(--dpt-dur-base) var(--dpt-ease-out)}
${ON} [data-dpt-composer]:focus-within::before{opacity:1;animation:dpt-sheen 5s linear infinite}
${ON} [data-dpt-composer]:focus-within{box-shadow:0 0 0 4px color-mix(in srgb,var(--dpt-brand) 10%,transparent),0 14px 38px color-mix(in srgb,var(--dpt-brand) 16%,transparent) !important}
${ON} [data-dpt-composer]:hover:not(:focus-within){background-image:radial-gradient(360px circle at var(--dpt-mx,50%) var(--dpt-my,50%),color-mix(in srgb,var(--dpt-brand) 7%,transparent),transparent 70%)}
@keyframes dpt-sheen{from{background-position:0% 0}to{background-position:300% 0}}
${ON} [data-dpt-send]:not(:disabled):not([aria-disabled="true"]){background-image:linear-gradient(135deg,var(--dpt-brand-light),var(--dpt-brand)) !important;color:#fff !important;box-shadow:0 4px 14px color-mix(in srgb,var(--dpt-brand) 38%,transparent);transition:transform 160ms var(--dpt-ease-out),box-shadow 160ms var(--dpt-ease-out),filter var(--dpt-dur-fast) var(--dpt-ease-out) !important}
${ON} [data-dpt-send]:not(:disabled):not([aria-disabled="true"]):hover{transform:translateY(-1px);box-shadow:0 8px 20px color-mix(in srgb,var(--dpt-brand) 46%,transparent);filter:saturate(1.08)}
${ON} [data-dpt-send]:not(:disabled):not([aria-disabled="true"]):active{transform:translateY(0) scale(0.94);transition-duration:60ms}
${ON} [data-dpt-bubble]{background-image:linear-gradient(90deg,color-mix(in srgb,var(--dpt-brand) 20%,transparent),color-mix(in srgb,var(--dpt-brand) 7%,transparent)) !important;background-color:transparent !important;color:var(--dsw-alias-label-primary) !important;border-radius:18px 18px 6px 18px !important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dpt-brand) 16%,transparent);animation:dpt-bubble-rise var(--dpt-dur-base) var(--dpt-ease-out) both}
${ON} [data-dpt-bubble] *{color:inherit}
@keyframes dpt-bubble-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
${ON} [data-chat-flow-kind="assistant-step"]{font-size:15px}
${ON} [data-chat-flow-kind="assistant-step"] :is(p,li){line-height:1.82}
${ON} [data-chat-flow-kind="assistant-step"] p{margin-block:0.7em}
${ON} [data-chat-flow-kind="assistant-step"] pre{border-radius:14px;border:1px solid var(--dsw-alias-border-l1);box-shadow:0 1px 2px rgba(16,24,40,0.04)}
${ON} [data-chat-flow-kind="assistant-step"] blockquote{border-radius:0 10px 10px 0}
${ON} [data-row-key^="session:"][role="treeitem"]{transition:background-color var(--dpt-dur-fast) var(--dpt-ease-out),color var(--dpt-dur-fast) var(--dpt-ease-out)}
${ON} [data-row-key^="session:"][role="treeitem"]:hover{background-color:color-mix(in srgb,var(--dpt-brand) 7%,transparent)}
${ON} [data-row-key^="session:"][role="treeitem"]:hover:not(:is([aria-selected="true"],[aria-current="true"],[data-selected="true"],.ld-row-selected)){background-image:radial-gradient(160px circle at var(--dpt-mx,50%) var(--dpt-my,50%),color-mix(in srgb,var(--dpt-brand) 18%,transparent),transparent 72%)}
${ON} [data-row-key^="session:"][role="treeitem"]:is([aria-selected="true"],[aria-current="true"],[data-selected="true"],.ld-row-selected){background-image:linear-gradient(90deg,color-mix(in srgb,var(--dpt-brand) 15%,transparent),color-mix(in srgb,var(--dpt-brand) 3%,transparent));font-weight:500}
${ON}[data-dpt-busy] [data-dpt-composer]::before{opacity:1;padding:2.5px;animation:dpt-sheen 1.6s linear infinite}
${ON}[data-dpt-busy] [data-dpt-composer]{animation:dpt-breathe 1.9s ease-in-out infinite}
@keyframes dpt-breathe{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dpt-brand) 0%,transparent),0 0 18px 0 color-mix(in srgb,var(--dpt-brand) 22%,transparent)}50%{box-shadow:0 0 0 7px color-mix(in srgb,var(--dpt-brand) 20%,transparent),0 0 56px 6px color-mix(in srgb,var(--dpt-brand) 48%,transparent)}}
${ON} [data-dpt-composer][data-dpt-done]{animation:dpt-done 900ms var(--dpt-ease-out) 1}
@keyframes dpt-done{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dpt-brand) 60%,transparent)}100%{box-shadow:0 0 0 26px color-mix(in srgb,var(--dpt-brand) 0%,transparent)}}
${ON}[data-dpt-busy] [data-dpt-send]{position:relative}
${ON}[data-dpt-busy] [data-dpt-send]::after{content:"";position:absolute;inset:-4px;border-radius:50%;padding:2.5px;pointer-events:none;background:conic-gradient(from 0deg,transparent 0 40%,var(--dpt-brand-light) 70%,#fff 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:dpt-spin 1.1s linear infinite}
@keyframes dpt-spin{to{transform:rotate(360deg)}}
.dpt-pal-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;justify-content:center;align-items:flex-start;padding-top:14vh;background:color-mix(in srgb,#0b1220 32%,transparent);-webkit-backdrop-filter:blur(8px) saturate(1.1);backdrop-filter:blur(8px) saturate(1.1);animation:dpt-fade 200ms cubic-bezier(.22,1,.36,1) both}
.dpt-pal{position:relative;width:min(600px,92vw);overflow:hidden;border-radius:20px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#101828);border:1px solid var(--dsw-alias-border-l2,#d6dce6);box-shadow:0 24px 70px rgba(11,18,32,0.35);font:14px/1.5 var(--ds-font-family,system-ui,sans-serif);animation:dpt-pop 200ms cubic-bezier(.22,1,.36,1) both}
.dpt-pal::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,var(--dpt-brand,#3370ff),var(--dpt-brand-light,#7fb0ff),var(--dpt-brand,#3370ff));background-size:200% 100%;animation:dpt-sheen 6s linear infinite}
.dpt-pal-input{display:block;width:100%;box-sizing:border-box;padding:18px 20px;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:16px;border-bottom:1px solid var(--dsw-alias-border-l1,#e3e7ee)}
.dpt-pal-input::placeholder{color:var(--dsw-alias-label-tertiary,#667085)}
.dpt-pal-list{max-height:min(52vh,420px);overflow:auto;padding:8px}
.dpt-pal-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:12px;cursor:pointer;transition:background-color 120ms}
.dpt-pal-item[aria-selected="true"]{background-image:linear-gradient(90deg,color-mix(in srgb,var(--dpt-brand,#3370ff) 20%,transparent),color-mix(in srgb,var(--dpt-brand,#3370ff) 7%,transparent))}
.dpt-pal-kind{flex:none;font-size:11px;line-height:18px;padding:0 8px;border-radius:999px;background:color-mix(in srgb,var(--dpt-brand,#3370ff) 12%,transparent);color:var(--dpt-brand-ink,#1f4fc4)}
.dpt-pal-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpt-pal-sub{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary,#667085)}
.dpt-pal-empty{padding:22px;text-align:center;color:var(--dsw-alias-label-tertiary,#667085)}
.dpt-pal-foot{display:flex;gap:16px;padding:9px 20px;font-size:12px;color:var(--dsw-alias-label-tertiary,#667085);border-top:1px solid var(--dsw-alias-border-l1,#e3e7ee)}
@keyframes dpt-fade{from{opacity:0}to{opacity:1}}
@keyframes dpt-pop{from{opacity:0;transform:translateY(8px) scale(0.98)}to{opacity:1;transform:none}}
.dpt-ripple{position:fixed;z-index:2147483000;pointer-events:none;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:2px solid color-mix(in srgb,var(--dpt-brand,#3370ff) 75%,transparent);background:radial-gradient(circle,color-mix(in srgb,var(--dpt-brand,#3370ff) 45%,transparent),color-mix(in srgb,var(--dpt-brand,#3370ff) 12%,transparent) 60%,transparent 72%);animation:dpt-ripple 650ms cubic-bezier(.22,1,.36,1) forwards}
@keyframes dpt-ripple{0%{transform:scale(.3);opacity:1}100%{transform:scale(7);opacity:0}}
.dpt-fx{position:fixed;inset:0;width:100vw;height:100vh;z-index:2147482000;pointer-events:none}
@media (prefers-reduced-motion:reduce){
  ${ON} *,${ON} *::before,${ON} *::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;scroll-behavior:auto !important}
}
`;

  function injectCss() {
    if (typeof document === 'undefined') return () => {};
    const id = `${PLUGIN}/style.css`;
    document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`)?.remove();
    const tag = document.createElement('style');
    tag.dataset.plugin = PLUGIN;
    tag.dataset.pluginCss = id;
    tag.textContent = CARD_CSS + THEME_CSS;
    document.head.appendChild(tag);
    return () => tag.remove();
  }

  // ---------------------------------------------------------------------------------------------
  // Which session is on screen. Each conversation header mounts a hidden bridge; the visible one
  // in the main conversation decides whether the refined look is on and whether the agent works.
  // ---------------------------------------------------------------------------------------------
  const SESSIONS = {
    map: new Map(), subs: new Set(),
    set(id, value) { this.map.set(id, value); this.emit(); },
    del(id) { this.map.delete(id); this.emit(); },
    emit() { for (const listener of this.subs) { try { listener(); } catch (error) { console.warn(`[${PLUGIN}]`, error); } } },
    current() {
      let pick, fallback;
      for (const value of this.map.values()) {
        const shown = value.el?.parentElement?.getClientRects?.().length > 0;
        if (!shown) { fallback ??= value; continue; }
        const main = value.el.closest?.('[data-slot="main.conversation"]');
        if (main || pick === undefined) pick = value;
      }
      return pick ?? fallback;
    },
  };
  const BUSY = { bridge: false, dom: false, was: false, timer: 0 };
  // The standalone dsh-refined-ui draws the same look; never stack both.
  const refinedPresent = () => typeof document !== 'undefined' && document.querySelector('style[data-plugin="dsh-refined-ui"]') !== null;
  const uiOn = () => typeof document !== 'undefined' && document.body?.hasAttribute('data-dpt-ui');
  function applyBusy() {
    if (typeof document === 'undefined') return;
    const busy = uiOn() && (BUSY.bridge || BUSY.dom);
    document.body.toggleAttribute('data-dpt-busy', busy);
    if (BUSY.was && !busy) {
      const card = document.querySelector('[data-dpt-composer]');
      if (card) {
        card.setAttribute('data-dpt-done', '');
        clearTimeout(BUSY.timer);
        BUSY.timer = setTimeout(() => card.removeAttribute('data-dpt-done'), 1000);
      }
    }
    BUSY.was = busy;
  }
  function watchActiveSession() {
    if (typeof document === 'undefined') return () => {};
    const update = () => {
      const current = SESSIONS.current();
      const on = current?.preset === 'deep-ptc' && !refinedPresent();
      document.body.toggleAttribute('data-dpt-ui', on);
      BUSY.bridge = on && current?.busy === true;
      applyBusy();
    };
    SESSIONS.subs.add(update);
    // Visibility changes without a remount (split views, tab switches) are caught here.
    const timer = setInterval(update, 1000);
    update();
    return () => {
      SESSIONS.subs.delete(update);
      clearInterval(timer);
      document.body.removeAttribute('data-dpt-ui');
      document.body.removeAttribute('data-dpt-busy');
    };
  }

  // Tag the composer card, its send button and the user bubbles so the CSS needs no hashed class
  // names. Only data-dpt-* attributes (and position:relative on a static composer) are written.
  function watchSurfaces() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
    const tagged = new Set();
    const relativized = new Set();
    let frame = 0;
    const mark = (node, attribute) => { node.setAttribute(attribute, ''); tagged.add([node, attribute]); };
    const findComposer = input => {
      for (let node = input.parentElement, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth++) {
        const style = getComputedStyle(node);
        const round = parseFloat(style.borderTopLeftRadius) >= 14;
        const framed = style.boxShadow !== 'none' || parseFloat(style.borderTopWidth) > 0;
        if (round && framed) return node;
      }
      return null;
    };
    function tagComposer() {
      for (const input of document.querySelectorAll('[data-composer-input]')) {
        let card = input.closest('[data-dpt-composer]');
        if (!card) {
          card = findComposer(input);
          if (!card) continue;
          mark(card, 'data-dpt-composer');
          if (getComputedStyle(card).position === 'static') { card.style.position = 'relative'; relativized.add(card); }
        }
        if (card.querySelector('[data-dpt-send]')) continue;
        // The send button is the right-most button in the card.
        let best = null, bestRight = -1;
        for (const button of card.querySelectorAll('button,[role="button"]')) {
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.right >= bestRight) { best = button; bestRight = rect.right; }
        }
        if (best) mark(best, 'data-dpt-send');
      }
    }
    function tagBubbles() {
      for (const row of document.querySelectorAll('[data-chat-flow-kind="user"],[data-chat-flow-kind="steering"]')) {
        if (row.querySelector('[data-dpt-bubble]')) continue;
        const nodes = row.querySelectorAll('*');
        for (let index = 0; index < nodes.length && index < 60; index++) {
          const node = nodes[index];
          if (node.tagName === 'BUTTON' || node.tagName === 'SVG' || !node.textContent?.trim()) continue;
          const style = getComputedStyle(node);
          const filled = style.backgroundColor && style.backgroundColor !== 'transparent' && style.backgroundColor !== 'rgba(0, 0, 0, 0)';
          if (filled && parseFloat(style.borderTopLeftRadius) >= 10) { mark(node, 'data-dpt-bubble'); break; }
        }
      }
    }
    function onMove(event) {
      const host = event.target?.closest?.('[data-row-key^="session:"],[data-dpt-composer]');
      if (!host || !uiOn()) return;
      const rect = host.getBoundingClientRect();
      host.style.setProperty('--dpt-mx', `${event.clientX - rect.left}px`);
      host.style.setProperty('--dpt-my', `${event.clientY - rect.top}px`);
    }
    const run = () => {
      frame = 0;
      tagComposer();
      tagBubbles();
      BUSY.dom = document.querySelector('[data-streaming="true"]') !== null;
      applyBusy();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-streaming'] });
    document.addEventListener('pointermove', onMove, { capture: true, passive: true });
    schedule();
    return () => {
      observer.disconnect();
      document.removeEventListener('pointermove', onMove, true);
      if (frame) cancelAnimationFrame(frame);
      BUSY.dom = false;
      applyBusy();
      for (const [node, attribute] of tagged) node.removeAttribute(attribute);
      tagged.clear();
      for (const node of relativized) node.style.position = '';
      relativized.clear();
    };
  }

  // Ctrl/Cmd+K palette. It only clicks entries the host already renders.
  const PANEL = { toggle() {}, state: {} };
  const FX = { burst() {} };
  function findClickable(labels) {
    let fallback = null;
    for (const node of document.querySelectorAll('button,[role="button"],[role="treeitem"],[role="menuitem"],a,div,span')) {
      if (!labels.includes((node.textContent ?? '').trim()) || node.closest('[data-dpt-palette]')) continue;
      const role = node.getAttribute('role');
      if (node.tagName === 'BUTTON' || node.tagName === 'A' || role === 'button' || role === 'treeitem' || role === 'menuitem') return node;
      fallback ??= node;
    }
    return fallback;
  }
  function paletteItems() {
    const items = [];
    for (const [labels, sub] of [[['新会话', 'New session'], 'palNewSub'], [['插件', 'Plugins'], 'palPluginsSub'], [['自动化任务', 'Automations'], 'palAutomationSub']]) {
      const node = findClickable(labels);
      if (node) items.push({ kind: T('palCommand'), title: (node.textContent ?? '').trim(), sub: T(sub), run: () => node.click() });
    }
    items.push({ kind: T('palEffect'), title: T('palAgents'), sub: T('palAgentsSub'), run: () => PANEL.toggle() });
    items.push({ kind: T('palEffect'), title: T('palFireworks'), sub: T('palFireworksSub'), run: () => FX.burst() });
    const rows = document.querySelectorAll('[data-row-key^="session:"]');
    for (let index = 0; index < rows.length && index < 80; index++) {
      const row = rows[index];
      const lines = (row.innerText ?? '').split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length) items.push({ kind: T('palSession'), title: lines[0], sub: lines.length > 1 ? lines.at(-1) : '', run: () => row.click() });
    }
    return items;
  }
  function watchPalette() {
    if (typeof document === 'undefined') return () => {};
    let backdrop = null, input = null, list = null, items = [], shown = [], index = 0;
    const close = () => { backdrop?.remove(); backdrop = null; };
    function mark() {
      for (let at = 0; at < list.children.length; at++) list.children[at].setAttribute('aria-selected', at === index ? 'true' : 'false');
      list.children[index]?.scrollIntoView?.({ block: 'nearest' });
    }
    function render() {
      list.textContent = '';
      if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'dpt-pal-empty';
        empty.textContent = T('palEmpty');
        list.appendChild(empty);
        return;
      }
      shown.forEach((item, at) => {
        const row = document.createElement('div');
        row.className = 'dpt-pal-item';
        row.setAttribute('role', 'option');
        const kind = document.createElement('span'); kind.className = 'dpt-pal-kind'; kind.textContent = item.kind;
        const title = document.createElement('span'); title.className = 'dpt-pal-title'; title.textContent = item.title;
        const sub = document.createElement('span'); sub.className = 'dpt-pal-sub'; sub.textContent = item.sub;
        row.append(kind, title, sub);
        row.addEventListener('pointermove', () => { if (index !== at) { index = at; mark(); } });
        row.addEventListener('click', () => choose(at));
        list.appendChild(row);
      });
      mark();
    }
    function filter() {
      const query = input.value.trim().toLowerCase();
      shown = query ? items.filter(item => `${item.title} ${item.kind}`.toLowerCase().includes(query)) : items.slice(0, 12);
      index = 0;
      render();
    }
    function choose(at) {
      const item = shown[at];
      if (!item) return;
      close();
      setTimeout(() => { try { item.run(); } catch (error) { console.warn(`[${PLUGIN}] palette action failed:`, error); } }, 30);
    }
    function open() {
      items = paletteItems();
      backdrop = document.createElement('div');
      backdrop.className = 'dpt-pal-backdrop';
      backdrop.setAttribute('data-dpt-palette', '');
      const panel = document.createElement('div');
      panel.className = 'dpt-pal';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', T('palTitle'));
      input = document.createElement('input');
      input.className = 'dpt-pal-input';
      input.placeholder = T('palPlaceholder');
      input.setAttribute('aria-label', T('palPlaceholder'));
      list = document.createElement('div');
      list.className = 'dpt-pal-list';
      list.setAttribute('role', 'listbox');
      const foot = document.createElement('div');
      foot.className = 'dpt-pal-foot';
      foot.textContent = T('palFoot');
      panel.append(input, list, foot);
      backdrop.appendChild(panel);
      document.body.appendChild(backdrop);
      backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop) close(); });
      input.addEventListener('input', filter);
      input.addEventListener('keydown', event => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'ArrowDown') { event.preventDefault(); index = Math.min(index + 1, shown.length - 1); mark(); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); index = Math.max(index - 1, 0); mark(); }
        else if (event.key === 'Enter') { event.preventDefault(); choose(index); }
        else if (event.key === 'Escape') { event.preventDefault(); close(); }
      });
      filter();
      input.focus();
    }
    function onKey(event) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || (event.key !== 'k' && event.key !== 'K')) return;
      if (!backdrop && !uiOn()) return;
      event.preventDefault();
      event.stopPropagation();
      if (backdrop) close(); else open();
    }
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); close(); };
  }

  // Click ripple, magnetic send button, "/" focuses the composer, Alt+Up/Down switches sessions.
  function watchInteractions() {
    if (typeof document === 'undefined') return () => {};
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    let magnet = null;
    const typing = target => target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/u.test(target.tagName));
    function onDown(event) {
      if (event.button !== 0 || reduce || !uiOn()) return;
      if (!event.target?.closest?.('button,a,[role=button],[role=treeitem],[role=tab],[role=menuitem],[role=option],summary')) return;
      const ripple = document.createElement('div');
      ripple.className = 'dpt-ripple';
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    }
    function onMove(event) {
      const button = uiOn() ? document.querySelector('[data-dpt-send]') : null;
      if (magnet && magnet !== button) { magnet.style.translate = ''; magnet = null; }
      if (!button || reduce) return;
      const rect = button.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2), dy = event.clientY - (rect.top + rect.height / 2);
      if (Math.hypot(dx, dy) < 70) { button.style.translate = `${(dx * 0.18).toFixed(1)}px ${(dy * 0.18).toFixed(1)}px`; magnet = button; }
      else if (magnet) { button.style.translate = ''; magnet = null; }
    }
    function onKey(event) {
      if (event.isComposing || event.keyCode === 229 || !uiOn() || document.querySelector('.dpt-pal-backdrop')) return;
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !typing(event.target)) {
        const input = document.querySelector('[data-composer-input]');
        if (input) { event.preventDefault(); input.focus(); }
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const rows = [...document.querySelectorAll('[data-row-key^="session:"][role="treeitem"]')];
        if (!rows.length) return;
        const current = rows.findIndex(row => row.matches('[aria-selected="true"],[aria-current="true"],[data-selected="true"]'));
        const next = rows[Math.max(0, Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))];
        if (next && next !== rows[current]) { event.preventDefault(); next.click(); next.scrollIntoView({ block: 'nearest' }); }
      }
    }
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('keydown', onKey, true);
      if (magnet) magnet.style.translate = '';
      for (const node of document.querySelectorAll('.dpt-ripple')) node.remove();
    };
  }

  // Send burst, completion sparkle and embers while the agent works.
  function watchFx() {
    if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') return () => {};
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const canvas = document.createElement('canvas');
    canvas.className = 'dpt-fx';
    canvas.setAttribute('aria-hidden', 'true');
    const paint = canvas.getContext('2d');
    if (!paint) return () => {};
    document.body.appendChild(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0, height = 0, parts = [], raf = 0, lastEmber = 0, wasBusy = false;
    const hues = ['#3370ff', '#5b8cff', '#7fd0ff', '#9dbcff', '#b48cff', '#ffffff'];
    const busy = () => document.body.hasAttribute('data-dpt-busy');
    function resize() {
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = width * dpr; canvas.height = height * dpr;
      paint.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function burst(x, y, count, power) {
      if (reduce || !uiOn()) return;
      for (let index = 0; index < count; index++) {
        const angle = Math.random() * Math.PI * 2, speed = (0.4 + Math.random()) * power;
        parts.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - power * 0.35, life: 1,
          decay: 0.014 + Math.random() * 0.016, r: 1.4 + Math.random() * 2.4, color: hues[(Math.random() * hues.length) | 0] });
      }
      kick();
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    function frame() {
      raf = 0;
      paint.clearRect(0, 0, width, height);
      paint.globalCompositeOperation = 'lighter';
      const composer = document.querySelector('[data-dpt-composer]');
      const now = performance.now();
      if (busy() && !reduce && composer && now - lastEmber > 70) {
        lastEmber = now;
        const rect = composer.getBoundingClientRect();
        parts.push({ x: rect.left + 12 + Math.random() * (rect.width - 24), y: rect.top + 2, vx: (Math.random() - 0.5) * 0.5,
          vy: -(0.5 + Math.random() * 1.1), gravity: -0.004, life: 1, decay: 0.009 + Math.random() * 0.01,
          r: 1.2 + Math.random() * 2, color: hues[(Math.random() * 4) | 0] });
      }
      parts = parts.filter(part => part.life > 0);
      for (const part of parts) {
        part.x += part.vx; part.y += part.vy; part.vy += part.gravity ?? 0.09; part.vx *= 0.985; part.life -= part.decay;
        paint.globalAlpha = Math.max(part.life, 0);
        paint.fillStyle = part.color;
        paint.beginPath();
        paint.arc(part.x, part.y, part.r * (0.4 + part.life * 0.6), 0, 6.3);
        paint.fill();
      }
      paint.globalAlpha = 1;
      paint.globalCompositeOperation = 'source-over';
      if (parts.length || busy()) kick();
    }
    const center = node => { const rect = node.getBoundingClientRect(); return [rect.left + rect.width / 2, rect.top + rect.height / 2]; };
    function onDown(event) {
      const button = event.target?.closest?.('[data-dpt-send]');
      if (button && event.button === 0) burst(...center(button), 34, 4.2);
    }
    function onKey(event) {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      if (!event.target?.closest?.('[data-composer-input]')) return;
      const button = document.querySelector('[data-dpt-send]');
      if (button) burst(...center(button), 34, 4.2);
    }
    const observer = new MutationObserver(() => {
      const now = busy();
      if (wasBusy && !now) {
        const composer = document.querySelector('[data-dpt-composer]');
        if (composer) {
          const rect = composer.getBoundingClientRect();
          burst(rect.left + rect.width / 2, rect.top, 22, 3.2);
          burst(rect.left + rect.width * 0.25, rect.top, 10, 2.4);
          burst(rect.left + rect.width * 0.75, rect.top, 10, 2.4);
        }
      }
      if (now) kick();
      wasBusy = now;
    });
    resize();
    window.addEventListener('resize', resize);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-dpt-busy'] });
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    FX.burst = () => {
      [[0.3, 0.45], [0.5, 0.3], [0.7, 0.45]].forEach(([x, y], index) => setTimeout(() => burst(width * x, height * y, 60, 5.6), index * 220));
    };
    return () => {
      FX.burst = () => {};
      window.removeEventListener('resize', resize);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
      canvas.remove();
    };
  }

  // Ctrl+Alt+D shows and copies a read-only outline of the markers this plugin relies on.
  function diagnostics() {
    const count = selector => document.querySelectorAll(selector).length;
    const current = SESSIONS.current();
    const lines = [
      `${PLUGIN} client | ui=${uiOn()} busy=${document.body.hasAttribute('data-dpt-busy')} session=${current?.id ?? '-'} preset=${current?.preset ?? '-'} refined-ui=${refinedPresent()}`,
      `tags: composer=${count('[data-dpt-composer]')} send=${count('[data-dpt-send]')} bubble=${count('[data-dpt-bubble]')} docked=${count('[data-dpt-docked]')}`,
      `markers: composer-input=${count('[data-composer-input]')} user-rows=${count('[data-chat-flow-kind="user"]')} assistant=${count('[data-chat-flow-kind="assistant-step"]')} session-rows=${count('[data-row-key^="session:"]')} chat-regions=${count('[data-conversation-region="chat"]')} main=${count('[data-slot="main.conversation"]')}`,
      `cards: skills=${count('.dpt-skills')} side=${count('.dpt-agents')} pill=${count('.dpt-agents-pill')} side-state=${JSON.stringify(PANEL.state)}`,
    ];
    return lines.join('\n');
  }
  function watchDiagnostics() {
    if (typeof document === 'undefined') return () => {};
    let panel = null;
    const close = () => { panel?.remove(); panel = null; };
    function onKey(event) {
      if (!(event.ctrlKey && event.altKey && (event.key === 'd' || event.key === 'D'))) return;
      if (!panel && !uiOn()) return;
      event.preventDefault();
      if (panel) { close(); return; }
      const text = diagnostics();
      try { navigator.clipboard?.writeText(text); } catch { /* copying is a convenience */ }
      panel = document.createElement('pre');
      panel.dataset.plugin = PLUGIN;
      panel.textContent = text;
      panel.style.cssText = 'position:fixed;z-index:2147483647;right:12px;bottom:12px;max-width:760px;max-height:70vh;overflow:auto;margin:0;padding:10px 12px;background:#0b1220;color:#dbe7ff;font:11px/1.45 ui-monospace,Consolas,monospace;border-radius:10px;white-space:pre-wrap;box-shadow:0 10px 30px rgba(0,0,0,.4)';
      document.body.appendChild(panel);
    }
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); close(); };
  }

  // ---------------------------------------------------------------------------------------------
  // Skill card, at the end of the latest turn in the conversation.
  // ---------------------------------------------------------------------------------------------
  const SKILL_ROWS = 4;
  const SkillIcon = () => h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: 'M3.5 2.75h6.25L12.5 5.5v7.75H3.5z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }),
    h('path', { d: 'M9.5 2.75V5.75h3M5.75 8.5h4.5M5.75 10.75h3', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }));

  function SkillSwitch({ on, disabled, label, onChange }) {
    return h('button', { type: 'button', role: 'switch', className: 'dpt-switch', 'aria-checked': on, 'aria-label': label, title: label, disabled,
      onClick: () => { if (!disabled) onChange(!on); } }, h('span', { className: 'dpt-switch-thumb', 'aria-hidden': 'true' }));
  }

  function SkillCard({ turn, useProjection, useChat, setSkill, setAll, t }) {
    const [busy, setBusy] = React.useState(false);
    const [expanded, setExpanded] = React.useState(false);
    // Projection failures are not caught: a silent null would make a broken card look like "no skills".
    const state = useProjection('deepPtcSkills');
    const lastTurn = typeof useChat === 'function' ? useChat(snapshot => snapshot?.timeline?.turnOrder?.at?.(-1)) : undefined;
    const turnNumber = typeof turn === 'number' ? turn : turn?.turn;
    const latest = turnNumber === undefined || (lastTurn !== undefined ? lastTurn === turnNumber : state?.turn === turnNumber);
    if (!state || state.phase !== 'idle' || !Array.isArray(state.skills) || state.skills.length === 0 || !latest) return null;
    async function run(action) {
      setBusy(true);
      try { await action(); } catch { /* the projection is authoritative */ } finally { setBusy(false); }
    }
    const closing = state.skills.filter(row => !row.enabled).length;
    const rows = expanded ? state.skills : state.skills.slice(0, SKILL_ROWS);
    return h('section', { className: 'dpt-card dpt-skills', 'aria-label': t('skillTitle') },
      h('header', { className: 'dpt-card-head' },
        h('span', { className: 'dpt-card-icon' }, h(SkillIcon)),
        h('div', { className: 'dpt-card-titles' },
          h('span', { className: 'dpt-card-title' }, t('skillTitle')),
          h('span', { className: 'dpt-card-sub' }, tf(t, 'skillLoaded', { count: state.skills.length }),
            closing ? h(React.Fragment, null, ' · ', h('span', { 'data-tone': 'warn' }, tf(t, 'skillClosing', { count: closing }))) : null)),
        h('div', { className: 'dpt-card-actions' },
          h('button', { type: 'button', className: 'dpt-btn', disabled: busy || closing === 0, 'aria-busy': busy,
            onClick: () => { void run(() => setAll(true)); } }, t('skillKeepAll')),
          h('button', { type: 'button', className: 'dpt-btn', disabled: busy || closing === state.skills.length, 'aria-busy': busy,
            onClick: () => { void run(() => setAll(false)); } }, t('skillCloseAll')))),
      h('ul', { className: 'dpt-skill-list' }, ...rows.map(row => h('li', { key: row.name, className: 'dpt-skill', 'data-off': row.enabled ? undefined : '' },
        h('div', { className: 'dpt-skill-text' },
          h('span', { className: 'dpt-skill-name' }, h('span', null, row.name),
            row.loadedTurn === state.turn ? h('span', { className: 'dpt-tag' }, t('skillThisTurn')) : null),
          h('span', { className: 'dpt-skill-desc', title: row.description || t('skillNoDescription') }, row.description || t('skillNoDescription'))),
        h(SkillSwitch, { on: row.enabled, disabled: busy, label: row.name, onChange: value => { void run(() => setSkill(row.name, value)); } })))),
      h('footer', { className: 'dpt-card-foot' }, h('span', null, t('skillHint')),
        state.skills.length > SKILL_ROWS ? h('button', { type: 'button', className: 'dpt-link', onClick: () => setExpanded(!expanded) },
          expanded ? t('skillShowLess') : tf(t, 'skillShowAll', { count: state.skills.length })) : null));
  }

  function SkillTail(props) {
    // Registered for every session; only Deep PTC sessions read the skill projection.
    let preset;
    try { preset = props.useProjection('agentPreset'); } catch { return null; }
    if (preset !== 'deep-ptc') return null;
    return h(SkillCard, props);
  }

  // ---------------------------------------------------------------------------------------------
  // Subagent panel beside the main conversation. Rows follow the official subagent catalog and
  // timing projections; a row opens the official subagent chat in the right sidebar.
  // ---------------------------------------------------------------------------------------------
  const AGENT_ROWS = 24;
  const PANEL_WIDTH = 248;
  const DOCK_MIN_WIDTH = 960;
  const COLLAPSED_KEY = `${PLUGIN}:subagents-collapsed`;
  const readCollapsed = () => { try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; } };
  const writeCollapsed = value => { try { localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0'); } catch { /* per-viewer convenience only */ } };

  function subagentRows(sessions, rootId, now) {
    const catalogOf = id => {
      const value = sessions?.projectionsBySession?.[id]?.values?.subagentCatalog ?? sessions?.byId?.[id]?.projectionValues?.subagentCatalog;
      return Array.isArray(value) ? value : [];
    };
    const rows = [];
    const seen = new Set([rootId]);
    const visit = (parentId, depth) => {
      if (depth > 2) return;
      for (const entry of catalogOf(parentId)) {
        if (rows.length >= AGENT_ROWS) return;
        if (typeof entry?.id !== 'string' || seen.has(entry.id)) continue;
        seen.add(entry.id);
        const summary = sessions?.byId?.[entry.id];
        const timing = summary?.projectionValues?.subagentTiming;
        const external = entry.mode === 'external';
        const running = !external && entry.activity === 'running';
        const completed = !external && entry.activity === 'inactive' && timing?.lastTurnCompleted === true;
        const duration = timing === undefined || external ? undefined : timing.active === undefined ? timing.settledMs
          : timing.settledMs + Math.max(0, (running ? now : timing.active.through) - timing.active.since);
        const usage = summary?.projectionValues?.tokenUsage;
        const tokens = usage ? usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens : undefined;
        rows.push({ id: entry.id, parentId, mode: entry.mode, depth,
          label: entry.label ?? summary?.title ?? summary?.displayTitle ?? entry.id,
          state: external ? 'external' : running ? 'running' : completed ? 'completed' : 'idle',
          duration: Number.isFinite(duration) ? duration : undefined, tokens: Number.isFinite(tokens) ? tokens : undefined });
        visit(entry.id, depth + 1);
      }
    };
    visit(rootId, 0);
    return rows;
  }

  function formatDuration(ms, t) {
    const total = Math.floor(Math.max(0, ms) / 1000);
    const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
    if (h > 0) return tf(t, 'durationHours', { h, m });
    if (total >= 60) return tf(t, 'durationMinutes', { m: Math.floor(total / 60), s });
    return tf(t, 'durationSeconds', { s });
  }
  function formatTokens(value) {
    if (value < 1000) return String(value);
    const scaled = value < 1e6 ? value / 1000 : value / 1e6;
    return `${scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10}${value < 1e6 ? 'k' : 'M'}`;
  }

  function openSubagent(row) {
    const sidebar = hostCtx?.get?.('sidebarRight');
    if (typeof sidebar?.openResource === 'function') {
      const query = new URLSearchParams({ parent: row.parentId, mode: row.mode ?? 'unknown' });
      sidebar.openResource(`dsh-resource://subagentchat/session/${encodeURIComponent(row.id)}?${query}`, { kind: 'subagentchat', preferNewPane: true });
      return;
    }
    const workspace = hostCtx?.get?.('uiWorkspace');
    if (typeof workspace?.openSession === 'function') {
      workspace.openSession({ parentSessionId: row.parentId, childSessionId: row.id, mode: row.mode });
      return;
    }
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(row.id) : row.id;
    document.querySelector(`[data-row-key="session:${escaped}"]`)?.click();
  }

  // Where the panel sits: the right edge of this session's chat region, above the composer.
  function useChatRegion(sessionId, enabled) {
    const [layout, setLayout] = React.useState(undefined);
    React.useEffect(() => {
      if (!enabled || typeof document === 'undefined') { setLayout(undefined); return undefined; }
      let last = '';
      let lastRegion;
      const measure = () => {
        const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(sessionId) : sessionId;
        const regions = [...document.querySelectorAll(`[data-conversation-region="chat"][data-conversation-session="${escaped}"]`)];
        const anyMain = document.querySelector('[data-slot="main.conversation"]') !== null;
        const region = regions.find(node => !anyMain || node.closest('[data-slot="main.conversation"]'));
        const rect = region?.getBoundingClientRect();
        if (!region || !rect || rect.width === 0) { if (last !== '-') { last = '-'; lastRegion = undefined; setLayout(undefined); } return; }
        const composer = region.querySelector('[data-composer-seat]')?.getBoundingClientRect();
        const bottom = composer && composer.top > rect.top ? composer.top - 12 : rect.bottom - 12;
        const next = { region, top: Math.round(rect.top + 12), right: Math.round(window.innerWidth - rect.right + 16),
          maxHeight: Math.max(120, Math.round(bottom - rect.top - 12)), wide: rect.width >= DOCK_MIN_WIDTH };
        const key = `${next.top}|${next.right}|${next.maxHeight}|${next.wide}`;
        if (key !== last || region !== lastRegion) { last = key; lastRegion = region; setLayout(next); }
      };
      measure();
      const timer = setInterval(measure, 400);
      window.addEventListener('resize', measure);
      return () => { clearInterval(timer); window.removeEventListener('resize', measure); };
    }, [sessionId, enabled]);
    return layout;
  }

  // The execution environment for Deep PTC sessions created from now on. It writes the same host
  // settings form as the plugin settings page; a session keeps the environment it was created with.
  const ENV_SHORT = { auto: 'envAuto', wsl: 'WSL', powershell: 'PowerShell', zsh: 'Zsh', bash: 'Bash' };
  const NO_FORM = { status: 'unavailable' };
  const noSubscribe = () => () => {};
  const noSnapshot = () => NO_FORM;
  const allowedEnvironments = platform => platform === 'win32' ? ['auto', 'wsl', 'powershell'] : ['auto', 'zsh', 'bash'];
  const effectiveEnvironment = (environment, platform) => environment !== 'auto' ? environment
    : platform === 'win32' ? 'powershell' : platform === 'darwin' ? 'zsh' : 'bash';
  const envLabel = (value, t) => value === 'auto' ? t('envAuto') : ENV_SHORT[value] ?? value;

  function useSettingsForm(form) {
    const subscribe = React.useCallback(listener => form ? form.subscribe(listener) : () => {}, [form]);
    const read = React.useCallback(() => form ? form.getSnapshot() : NO_FORM, [form]);
    return React.useSyncExternalStore(form ? subscribe : noSubscribe, form ? read : noSnapshot, form ? read : noSnapshot);
  }

  function EnvironmentSection({ form, t }) {
    const state = useSettingsForm(form);
    const [saving, setSaving] = React.useState(false);
    const [message, setMessage] = React.useState(null);
    const [distribution, setDistribution] = React.useState(undefined);
    if (!form || state.status === 'unavailable') return null;
    if (state.status !== 'ready' || !state.value) return h('section', { className: 'dpt-side-section' }, h('p', { className: 'dpt-side-note' }, t('loading')));
    const value = state.value;
    const platform = value.hostPlatform;
    const environment = value.environment ?? 'auto';
    const effective = effectiveEnvironment(environment, platform);
    const choices = (Array.isArray(value.shellChoices) ? value.shellChoices : []).filter(item => item && typeof item.id === 'string');
    const disabled = !state.writable || saving;
    const savedDistribution = value.wslDistribution ?? '';
    const draft = distribution ?? savedDistribution;
    async function save(ops, label) {
      setSaving(true); setMessage(null);
      try {
        const ok = await form.mutate(ops, form.getSnapshot().revision);
        if (!ok) throw new Error('rejected');
        setMessage({ tone: 'ok', text: tf(t, 'envSaved', { env: label }) });
        return true;
      } catch {
        setMessage({ tone: 'error', text: t('envFailed') });
        return false;
      } finally { setSaving(false); }
    }
    function choose(next) {
      if (next === environment) return;
      const family = effectiveEnvironment(next, platform);
      const current = choices.find(item => item.id === value.shellExecutable);
      const ops = [{ op: 'set', path: ['environment'], value: next }];
      // A shell picked for another family would not apply; fall back to the official lookup.
      if (value.shellExecutable && current?.family !== family) ops.push({ op: 'set', path: ['shellExecutable'], value: '' });
      void save(ops, envLabel(next, t));
    }
    async function saveDistribution(event) {
      event?.preventDefault?.();
      const next = draft.trim();
      if (next === savedDistribution) { setDistribution(undefined); return; }
      if (await save([{ op: 'set', path: ['wslDistribution'], value: next }], next ? `WSL (${next})` : 'WSL')) setDistribution(undefined);
    }
    const familyChoices = choices.filter(item => item.family === effective);
    return h('section', { className: 'dpt-side-section', 'aria-label': t('environment') },
      h('div', { className: 'dpt-side-label' }, h('span', null, t('environment')), h('span', { className: 'dpt-side-hint' }, t('envForNew'))),
      h('div', { className: 'dpt-seg', role: 'radiogroup', 'aria-label': t('environment') },
        ...allowedEnvironments(platform).map(option => h('button', { key: option, type: 'button', role: 'radio', className: 'dpt-seg-btn',
          'aria-checked': option === environment, disabled, title: t(option), onClick: () => choose(option) }, envLabel(option, t)))),
      effective === 'wsl' ? h('form', { className: 'dpt-field', onSubmit: saveDistribution },
        h('input', { className: 'dpt-input', value: draft, disabled, placeholder: t('envDefaultDistribution'), 'aria-label': t('distribution'),
          title: t('distributionHint'), onChange: event => { setDistribution(event.target.value); setMessage(null); } }),
        draft.trim() !== savedDistribution ? h('button', { type: 'submit', className: 'dpt-btn', disabled }, t('save')) : null) : null,
      effective !== 'wsl' && familyChoices.length > 0 ? h('div', { className: 'dpt-field' },
        h('select', { className: 'dpt-select', value: value.shellExecutable ?? '', disabled, 'aria-label': t('shell'), title: t('shellHint'),
          onChange: event => { const item = familyChoices.find(choice => choice.id === event.target.value);
            void save([{ op: 'set', path: ['shellExecutable'], value: event.target.value }], item ? item.label : t('shellAuto')); } },
        h('option', { value: '' }, t('shellAuto')), ...familyChoices.map(item => h('option', { key: item.id, value: item.id }, item.label)))) : null,
      h('p', { className: 'dpt-side-note', role: 'status', 'data-tone': message?.tone },
        message ? message.text : !state.writable ? t('readOnly') : environment === 'auto' ? tf(t, 'envAutoNow', { env: envLabel(effective, t) }) : t('envThisSession')));
  }

  function SidePanel({ sessionId, useSessions, useProjection, reset, form, t }) {
    const sessions = typeof useSessions === 'function' ? useSessions(state => state) : undefined;
    let tools;
    try { tools = typeof useProjection === 'function' ? useProjection('deepPtcTools') : undefined; } catch { tools = undefined; }
    const hasTools = typeof reset === 'function';
    const toolFailures = tools && typeof tools === 'object' ? (tools.report?.tools ?? []).length : 0;
    PANEL.state = { tools: tools === null ? 'null' : typeof tools, reset: typeof reset, form: form ? 'yes' : 'no' };
    const settings = useSettingsForm(form);
    const [now, setNow] = React.useState(() => Date.now());
    const [collapsed, setCollapsed] = React.useState(readCollapsed);
    const [peek, setPeek] = React.useState(false);
    const rows = subagentRows(sessions, sessionId, now);
    const running = rows.filter(row => row.state === 'running').length;
    const completed = rows.filter(row => row.state === 'completed').length;
    const hasEnvironment = !!form && settings.status !== 'unavailable';
    const layout = useChatRegion(sessionId, (rows.length > 0 || hasEnvironment || hasTools) && canPortal());
    const docked = !!layout && layout.wide && !collapsed;
    React.useEffect(() => {
      if (running === 0) return undefined;
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }, [running > 0]);
    React.useEffect(() => {
      const region = layout?.region;
      if (!region) return undefined;
      region.toggleAttribute('data-dpt-docked', docked);
      return () => region.removeAttribute('data-dpt-docked');
    }, [layout?.region, docked]);
    React.useEffect(() => {
      PANEL.toggle = () => {
        if (layout && !layout.wide) { setPeek(value => !value); return; }
        setCollapsed(value => { writeCollapsed(!value); return !value; });
      };
      return () => { PANEL.toggle = () => {}; };
    }, [layout?.wide]);
    if (!layout || (rows.length === 0 && !hasEnvironment && !hasTools) || !canPortal()) return null;
    const position = { top: `${layout.top}px`, right: `${layout.right}px` };
    const summary = [running ? tf(t, 'agentsRunning', { count: running }) : null, completed ? tf(t, 'agentsCompleted', { count: completed }) : null,
      rows.length - running - completed > 0 ? tf(t, 'agentsIdle', { count: rows.length - running - completed }) : null].filter(Boolean).join(' · ');
    const environment = settings.status === 'ready' && settings.value ? envLabel(settings.value.environment ?? 'auto', t) : undefined;
    if (!docked && !peek) {
      const expand = () => { if (layout.wide) { writeCollapsed(false); setCollapsed(false); } else setPeek(true); };
      const label = [environment, rows.length ? `${t('agentsTitle')} ${rows.length}` : null, toolFailures ? `${t('toolFailures')} ${toolFailures}` : null].filter(Boolean).join(' · ');
      return ReactDOM.createPortal(h('button', { type: 'button', className: 'dpt-agents-pill', style: position, 'data-state': running ? 'running' : 'idle',
        'aria-label': t('agentsExpand'), title: summary || t('agentsExpand'), onClick: expand },
        h('span', { className: 'dpt-agent-dot', 'aria-hidden': 'true' }), label || t('sideTitle')), document.body);
    }
    const stateText = row => row.state === 'running' ? t('agentRunning') : row.state === 'completed' ? t('agentCompleted') : row.state === 'external' ? t('agentExternal') : t('agentIdle');
    const collapse = () => { if (layout.wide) { writeCollapsed(true); setCollapsed(true); } setPeek(false); };
    return ReactDOM.createPortal(h('aside', { className: 'dpt-agents', 'aria-label': t('sideTitle'), style: { ...position, maxHeight: `${layout.maxHeight}px`, width: `${PANEL_WIDTH}px` } },
      h('header', { className: 'dpt-agents-head' },
        h('span', { className: 'dpt-agents-title' }, t('sideTitle')),
        h('span', { className: 'dpt-agents-count' }),
        h('button', { type: 'button', className: 'dpt-icon-btn', 'aria-label': t('agentsCollapse'), title: t('agentsCollapse'), onClick: collapse },
          h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
            h('path', { d: 'M6 4l4 4-4 4', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })))),
      h('div', { className: 'dpt-side-body' },
        hasEnvironment ? h(EnvironmentSection, { form, t }) : null,
        rows.length ? h('section', { className: 'dpt-side-section dpt-side-agents', 'aria-label': t('agentsTitle') },
          h('div', { className: 'dpt-side-label' }, h('span', null, t('agentsTitle')), h('span', { className: 'dpt-side-hint', title: summary }, summary)),
          h('ol', { className: 'dpt-agents-list' }, ...rows.map(row => {
            const meta = [stateText(row), row.duration !== undefined ? formatDuration(row.duration, t) : null,
              row.tokens !== undefined ? tf(t, 'tokens', { value: formatTokens(row.tokens) }) : null].filter(Boolean).join(' · ');
            return h('li', { key: row.id }, h('button', { type: 'button', className: 'dpt-agent', 'data-state': row.state, style: { '--dpt-depth': row.depth },
              disabled: row.state === 'external', title: t('agentOpen'), onClick: () => openSubagent(row) },
              h('span', { className: 'dpt-agent-dot', 'aria-hidden': 'true' }),
              h('span', { className: 'dpt-agent-main' }, h('span', { className: 'dpt-agent-name', title: row.label }, row.label),
                h('span', { className: 'dpt-agent-meta' }, meta))));
          }))) : null,
        hasTools ? h(ToolStateControls, { sessionId, useProjection, reset, t }) : null)), document.body);
  }

  // A boundary keeps a failing bridge or panel from taking the conversation header with it.
  class Boundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false }; }
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error) { console.warn(`[${PLUGIN}] conversation extras disabled:`, error); }
    render() { return this.state.failed ? null : this.props.children; }
  }

  function SessionBridge(props) {
    const { sessionId } = props;
    const marker = React.useRef(null);
    let preset;
    try { preset = typeof props.useProjection === 'function' ? props.useProjection('agentPreset') : undefined; } catch { preset = undefined; }
    const statuses = typeof props.useSessionStatus === 'function' ? props.useSessionStatus(state => state) : undefined;
    const busy = statuses?.get?.(sessionId)?.running === true;
    React.useEffect(() => { SESSIONS.set(sessionId, { id: sessionId, preset, busy, el: marker.current }); }, [sessionId, preset, busy]);
    React.useEffect(() => () => SESSIONS.del(sessionId), [sessionId]);
    return h('span', { ref: marker, hidden: true, 'aria-hidden': 'true', 'data-dpt-bridge': sessionId });
  }

  function SideCardHost(props) {
    // Registered for every session; only Deep PTC sessions read their projections or draw the card.
    let preset;
    try { preset = props.useProjection('agentPreset'); } catch { return null; }
    if (preset !== 'deep-ptc') return null;
    return h(Boundary, null, h(SidePanel, props));
  }

  // The skill switches run a host command, and the host logs every command. The log keeps it; the
  // conversation shows nothing for a success and a short line for a failure.
  function SkillCommandRow({ node }) {
    const outcome = node?.outcome;
    if (outcome?.kind === 'error') return h('div', { className: 'dpt-command-error', role: 'status' }, outcome.text);
    return h('span', { hidden: true, 'data-dpt-hidden-command': SKILL_COMMAND_NAME });
  }

  const SKILL_COMMAND_NAME = 'deep-ptc-skill-state';
  function runSkillCommand(child, sessionId, payload) {
    const execute = child.remote?.commands?.execute;
    if (typeof execute !== 'function') return Promise.resolve({ ok: false, error: { message: 'unavailable' } });
    // The remote command API takes the full line plus attachments. The JSON payload is command input.
    return execute(sessionId, `/${SKILL_COMMAND_NAME} ` + JSON.stringify(payload), []);
  }

  function apply(ctx) {
    hostCtx = ctx;
    const t = ctx.locale.bind('deep-ptc');
    T = key => t(key);
    ctx.effect(() => ctx.locale.register('deep-ptc', dictionaries));
    ctx.effect(() => injectCss(), `${PLUGIN}: style`);
    ctx.effect(() => watchActiveSession(), `${PLUGIN}: active session`);
    ctx.effect(() => watchSurfaces(), `${PLUGIN}: surface tags`);
    ctx.effect(() => watchPalette(), `${PLUGIN}: command palette`);
    ctx.effect(() => watchInteractions(), `${PLUGIN}: interactions`);
    ctx.effect(() => watchFx(), `${PLUGIN}: effects`);
    ctx.effect(() => watchDiagnostics(), `${PLUGIN}: diagnostics`);
    const form = ctx.configForms.get(NS);
    ctx.effect(() => ctx.configForms.whileServed([NS], () =>
      ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item', id: 'deep-ptc', order: 41,
        label: () => t('title'), locale: 'deep-ptc',
      }, props => h(Card, { ...props, form, t })))));
    try {
      ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
        name: 'conversation.chat.commandview', key: SKILL_COMMAND_NAME,
      }, SkillCommandRow));
    } catch { /* without the renderer the host shows its generic command row */ }
    try {
      // Each conversation header reports which session is on screen and whether it works.
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions', id: 'deep-ptc-session', order: 31,
      }, props => h(Boundary, null, h(SessionBridge, props))));
    } catch { /* the conversation keeps working without the look */ }
    try {
      ctx.inject?.(['remote', 'remote.commands'], child => {
        try {
          child.slots.inject('conversation.chat.turnTail', () => child.slots.register({
            name: 'conversation.chat.turnTail', id: 'deep-ptc-skills', order: 20,
            inject: sessionId => ({
              setSkill: (name, enabled) => runSkillCommand(child, sessionId, { action: 'set', name, enabled }),
              setAll: enabled => runSkillCommand(child, sessionId, { action: 'all', enabled }),
            }),
          }, props => h(SkillTail, { ...props, t })));
        } catch { /* a broken card must not take the conversation with it */ }
        try {
          // The side card draws beside the conversation through a portal; nothing shows under the composer.
          child.slots.inject('conversation.composer.dock', () => child.slots.register({
            name: 'conversation.composer.dock', id: 'deep-ptc-side', order: 89,
            inject: sessionId => ({
              reset: () => {
                const execute = child.remote?.commands?.execute;
                if (typeof execute !== 'function') return Promise.resolve({ ok: false, error: { message: 'unavailable' } });
                return execute(sessionId, '/deep-ptc-reset-tools', []);
              },
            }),
          }, props => h(SideCardHost, { ...props, form, t })));
        } catch { /* the composer stays usable when this slot cannot register */ }
      });
    } catch { /* the composer stays usable when this slot cannot register */ }
  }
  return { apply, inject };
} });
