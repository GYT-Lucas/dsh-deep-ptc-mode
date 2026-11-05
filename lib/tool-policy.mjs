import { DIRECTORY_TOOL, blankState, toolSchema, searchCatalog } from './tool-catalog.mjs';
const officialDefinitions = new WeakMap();
const validName = name => typeof name === 'string' && name.length > 0 && name.length <= 256 && !/[\u0000-\u001f]/u.test(name);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function markOfficialTool(definition, provider = 'official PTC') { officialDefinitions.set(definition, provider); return definition; }
export function isOfficialTool(definition) { return officialDefinitions.has(definition); }
export function officialToolSource(definition) { return officialDefinitions.get(definition); }
export const compatibilityPolicy = `## Efficient tool cooperation
- Search available external capabilities by function using deep_ptc_tools. Load only matching definitions; then use their actual schemas. If none fit, use an admitted official PTC tool. Provider discovery/loaders remain authoritative for provider-specific SDKs.
- An external capability that fails is quarantined for this conversation. Do not retry, probe, diagnose or repair it; promptly use a working equivalent or the official fallback and focus on finishing the task. Only the user's Reload all tool states button resets quarantine.
- At task completion, briefly list the failed tool names and their declared plugins (or unknown source) and say there may be a compatibility problem. Do not claim a root cause. Mention completed work first.
- Preserve authorization, cancellation, the selected shell and managed jobs. Empty results and running/background jobs are not failures. Before replacing a partially completed write or command, read only the task state needed to avoid duplicate effects; this is task recovery, not plugin diagnosis.
- Search skills through deep_ptc_tools(action=skills), then use the official loader named by loadWith and follow its full instructions. Reuse already-loaded instructions in the current context; discovery summaries are not skill instructions.
- Never bypass hidden tools, policy denials, cancelled work or an unavailable whole executor. Deep PTC's existing foreground/steering wrappers continue to govern official execution.`;
export function classifyToolOutcome(exec, result) {
  if (exec.signal?.aborted) return { kind: 'cancelled', effect: 'unknown' };
  const value = object(result?.value) ? result.value : undefined;
  if (value?.cancelled === true || ['cancelled', 'aborted'].includes(value?.status)) return { kind: 'cancelled', effect: 'unknown' };
  if (value?.sandbox?.denied === true) return { kind: 'denied', effect: 'unknown' };
  // Host job promotion is success even when the command has not finished yet.
  if (!result?.isError && ['background', 'promoted'].includes(value?.kind)) return undefined;
  if (!result?.isError && value?.kind === 'foreground' && typeof value.exitCode === 'number' && value.exitCode !== 0)
    return { kind: 'command', effect: 'unknown' };
  const status = typeof value?.status === 'string' ? value.status.toLowerCase() : '';
  const failure = object(value?.failure) ? value.failure : undefined;
  // A bounded read/page may be partial by design. Quarantine only a reported partial failure,
  // not an ordinary continuation result with no failure indication.
  if (!result?.isError && status === 'partial' && !failure) return undefined;
  const failed = result?.isError === true || ['failed', 'error', 'unavailable', 'partial'].includes(status);
  if (!failed) return undefined;
  const rawCode = result?.error?.code ?? failure?.code;
  const code = typeof rawCode === 'string' && /^[A-Z0-9_:-]{1,96}$/u.test(rawCode) ? rawCode : '';
  const effect = ['none', 'unknown', 'partial', 'completed'].includes(failure?.effectState)
    ? failure.effectState : 'unknown';
  if (/ABORT|CANCEL/u.test(code) || status === 'cancelled') return { kind: 'cancelled', effect };
  if (/DENIED|FORBIDDEN|POLICY|APPROVAL|PERMISSION|EACCES|EPERM|READ_ONLY/u.test(code))
    return { kind: 'denied', effect };
  if (/ARGUMENT|INVALID_ARGS|VALIDATION|ENOENT|NOT_FOUND/u.test(code) && code !== 'UNKNOWN_TOOL')
    return { kind: 'input', effect };
  if (status === 'partial') return { kind: 'partial', effect };
  if (/UNKNOWN_TOOL|UNAVAILABLE|WORKER_MISSING|RUNTIME_MISSING/u.test(code) || status === 'unavailable')
    return { kind: 'unavailable', effect };
  return { kind: 'failure', effect };
}

export function normalizePreferences(preferences = []) {
  if (!Array.isArray(preferences) || preferences.length > 32) throw new Error('toolPreferences must be an array with at most 32 entries');
  const seen = new Set();
  return preferences.map(row => {
    if (!object(row) || !validName(row.preferred) || row.preferred === 'run_code'
      || !Array.isArray(row.fallback) || row.fallback.length === 0 || row.fallback.length > 12
      || row.fallback.some(name => !validName(name) || name === 'run_code' || name === row.preferred)
      || seen.has(row.preferred)) throw new Error('Each tool preference needs a unique preferred tool and 1–12 distinct fallback names (not run_code)');
    if (new Set(row.fallback).size !== row.fallback.length) throw new Error('Duplicate fallback names in toolPreferences');
    seen.add(row.preferred);
    return { preferred: row.preferred, fallback: [...row.fallback] };
  });
}

export function createCompatibilityState(tools, preferences = [], storage = {}) {
  const routes = normalizePreferences(preferences);
  let sessions = new WeakMap();
  let calls = new WeakMap();
  const sessionOf = agent => object(agent?.session) ? agent.session : agent;
  function entry(agent) {
    if (storage.read && !object(agent?.session)) return undefined;
    const session = sessionOf(agent);
    if (!object(session)) return undefined;
    let row = sessions.get(session);
    if (!row) { row = { state: storage.read?.(session) ?? blankState(), selected: new Set() }; sessions.set(session, row); }
    const current = storage.read?.(session);
    if (current && current !== row.state) { if (current.epoch !== row.state.epoch) row.selected.clear(); row.state = current; }
    return row;
  }
  function save(agent, row, state) {
    storage.write?.(sessionOf(agent), state); // Persist first: an unsuccessful reset never clears quarantine.
    row.state = state;
  }
  function definitions(agent, toolSet) { return tools.definitions(agent, toolSet).filter(def => validName(def.name)); }
  const blocked = (agent, name) => entry(agent)?.state.blocked.some(row => row.name === name) ?? false;
  const providerOf = def => officialDefinitions.get(def) ?? (typeof def?.deepPtc?.provider === 'string' ? def.deepPtc.provider.slice(0, 160) : 'unknown plugin');
  const api = {
    dispatched(exec) {
      const row = entry(exec.agent);
      if (!row || calls.has(exec)) return;
      const definition = tools.get(exec.name, exec.agent, exec.toolSet);
      calls.set(exec, { epoch: row.state.epoch, definition, official: !!definition && isOfficialTool(definition), provider: providerOf(definition) });
    },
    guard(exec) { return blocked(exec.agent, exec.name) ? `Deep PTC: ${JSON.stringify(exec.name)} is quarantined in this conversation. Do not retry or diagnose it. Continue with another admitted equivalent or official tool. Only the user can reload all tool states.` : undefined; },
    observe(exec, result) {
      const call = calls.get(exec);
      if (!call || call.official || exec.name === DIRECTORY_TOOL || exec.name === 'run_code') return;
      const row = entry(exec.agent);
      if (!row || call.epoch !== row.state.epoch || blocked(exec.agent, exec.name)) return;
      const outcome = classifyToolOutcome(exec, result);
      // Authorization and cancelled actions must never be converted to provider failover.
      if (!outcome || ['denied', 'cancelled', 'command', 'input'].includes(outcome.kind)) return;
      const failure = { name: exec.name, provider: call.provider, kind: outcome.kind };
      save(exec.agent, row, { ...row.state, blocked: [...row.state.blocked, failure] });
      row.selected.delete(exec.name);
    },
    reset(agent) {
      const row = entry(agent);
      if (!row) throw new Error('No conversation is active');
      const count = row.state.blocked.length;
      save(agent, row, { ...blankState(), epoch: row.state.epoch + 1 });
      row.selected.clear();
      return count;
    },
    status(agent) { return entry(agent)?.state ?? blankState(); },
    sdkDefinitions(agent, toolSet, compact = true) {
      const row = entry(agent);
      const excluded = new Set(row?.state.blocked.map(item => item.name));
      return definitions(agent, toolSet).filter(def => !excluded.has(def.name)
        && (!compact || isOfficialTool(def) || def.name === DIRECTORY_TOOL || row?.selected.has(def.name)));
    },
    search(agent, args, toolSet) {
      const excluded = new Set(entry(agent)?.state.blocked.map(item => item.name));
      const visible = definitions(agent, toolSet).filter(def => def.name !== DIRECTORY_TOOL && !excluded.has(def.name));
      const external = visible.filter(def => !isOfficialTool(def));
      const result = searchCatalog(external, args.query, args.offset, args.limit);
      if (result.total) return { layer: 'external', ...result };
      return { layer: 'official', ...searchCatalog(visible.filter(isOfficialTool), args.query, args.offset, args.limit) };
    },
    load(agent, names, toolSet) {
      if (!Array.isArray(names) || names.length < 1 || names.length > 6 || names.some(name => !validName(name))) throw new Error('Load 1–6 exact tool names');
      const live = new Map(definitions(agent, toolSet).map(def => [def.name, def]));
      const row = entry(agent);
      if (!row) throw new Error('No conversation is active');
      let budget = 16000;
      const loaded = [], unavailable = [];
      for (const name of new Set(names)) {
        const def = live.get(name);
        if (!def || blocked(agent, name) || name === DIRECTORY_TOOL) { unavailable.push(name); continue; }
        const schema = toolSchema(def);
        const size = Buffer.byteLength(JSON.stringify(schema), 'utf8');
        if (size > budget) { unavailable.push(name); continue; }
        budget -= size;
        row.selected.delete(name);
        row.selected.add(name);
        if (row.selected.size > 12) row.selected.delete(row.selected.values().next().value);
        loaded.push(schema);
      }
      return { loaded, unavailable, nextStep: true, note: 'Unavailable names are hidden, quarantined, or exceed the complete-schema budget. No tool was executed. Use an equivalent or load fewer definitions.' };
    },
    text({ scope: agent, toolSet } = {}) {
      if (!object(agent)) return '';
      const row = entry(agent);
      if (!row) return '';
      const state = row.state;
      const lines = [];
      if (state.blocked.length) {
        lines.push('Quarantined for this conversation; no retries or diagnosis. Finish the task using working equivalents. At completion briefly report these tool/plugin names and a possible compatibility problem:');
        lines.push(JSON.stringify(state.blocked.slice(0, 8).map(({name,provider}) => ({name,provider}))));
        if (state.blocked.length > 8) lines.push(`${state.blocked.length} tools total; the user interface retains the full list.`);
        lines.push('Check only necessary task state before replacing a possibly partial mutation. Reset is a user action.');
      }
      const available = routes.length ? new Set(definitions(agent, toolSet).map(def => def.name)) : new Set();
      for (const route of routes) {
        if (available.has(route.preferred) && !blocked(agent, route.preferred)) lines.push(`Prefer ${JSON.stringify(route.preferred)} when applicable; visible equivalents: ${JSON.stringify(route.fallback.filter(name => available.has(name) && !blocked(agent, name)))}. Read live schemas.`);
      }
      return lines.join('\n');
    },
    dispose() { sessions = new WeakMap(); calls = new WeakMap(); },
  };
  return api;
}

export function installToolCompatibility(ctx, { enabled = true, preferences = [], storage } = {}) {
  if (!enabled) return;
  const state = createCompatibilityState(ctx.tools, preferences, storage);
  ctx.systemPrompt.section({ name: 'deep-ptc:tool-compatibility', order: 10194, text: compatibilityPolicy });
  ctx.systemPrompt.context({ name: 'deep-ptc:tool-recovery', order: 122, text: context => state.text(context) });
  ctx.tools.guard(exec => state.guard(exec));
  ctx.on('tools/execute', (exec, next) => {
    const reason = state.guard(exec);
    if (reason) return Promise.resolve({ isError: true, error: { message: reason }, content: [{ type: 'text', text: reason }] });
    state.dispatched(exec);
    return next();
  });
  ctx.on('tools/result', (exec, result) => state.observe(exec, result));
  ctx.effect(() => () => state.dispose());
  return state;
}
