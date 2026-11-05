// Task-level recovery only: observe outcomes and guide the next model step. Never invoke, rename,
// translate, hide, or replay a tool. Registrations, schemas and authorization stay with their owners.
const officialDefinitions = new WeakSet();
const MAX_FAILURES = 8;
const MAX_NAMES = 12;
const validName = name => typeof name === 'string' && /^[\w.:-]{1,128}$/u.test(name);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function markOfficialTool(definition) {
  officialDefinitions.add(definition);
  return definition;
}

export const compatibilityPolicy = `## Cooperate with tool plugins

- Tool selection has two layers. First search the available extension/plugin capabilities for the needed function, including the provider's own discovery/SDK loader when present; prefer a suitable working enhancement. Second, if that layer has no suitable capability or its tool fails, use the inherited official PTC capability as the fallback. Do not repeatedly rediscover or retry the same broken enhancement. Do not assume any plugin is installed or enabled.
- Use each provider's actual live schema and result contract; tool names, arguments, return values and execution environments are not interchangeable. A preference is a task-level routing choice, not an alias or permission to forward raw arguments between tools.
- The inherited official PTC tools are the baseline. If an enhancement is missing or fails, automatically continue the task with an available official tool that supports the operation; do not ask for permission merely to change a tool within the already-authorized task. Rebuild the call from that tool's real schema. No equivalent official capability means report the limitation instead of inventing one.
- A failed call may already have written files, submitted a request, or started a command/job. Before continuing a mutation, inspect its receipts and read back the relevant state; apply only the remaining work. Never replay a command just because its output or renderer failed. A background/promoted job is still running, not a failed call.
- Permission/approval denials, policy blocks and user cancellation remain authoritative: never switch tools, shells or credentials to evade them. Invalid arguments, missing input files and an ordinary nonzero command exit require diagnosis, not a claim that the provider is broken. Empty searches are valid results. Partial/truncated results require continuation or explicit coverage limits.
- Keep the selected execution environment and reachability rules. A plugin shell is not automatically the selected WSL/native shell. Use its real job and cancellation contract; prefer explicit background execution for long work. Do not claim Deep PTC's official-tool wait wrapper automatically controls every third-party executor.
- Keep official fallbacks available in the enhancement plugin's own configuration where supported. If another plugin or host policy hides or removes them, do not bypass its restrictions or call a captured private implementation. Explain the unavailable fallback and the configuration needed to restore it. This compatibility layer adds no tools and cannot repair an unloaded tool executor.`;

/** Only structured outcome metadata is interpreted; arbitrary result text is never prompt policy. */
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

export function createCompatibilityState(tools, preferences = []) {
  const routes = normalizePreferences(preferences);
  let failures = new WeakMap();
  let dispatched = new WeakSet();
  const definitions = (agent, toolSet) => {
    try { return tools.definitions(agent, toolSet).filter(def => validName(def.name)); }
    catch { return []; } // An unavailable executor/provider must not break prompt assembly.
  };
  return {
    dispatched(exec) { if (object(exec)) dispatched.add(exec); },
    observe(exec, result) {
      if (!object(exec?.agent) || !validName(exec.name) || exec.name === 'run_code') return;
      let outcome = classifyToolOutcome(exec, result);
      // Host guards and approval can deny with only an error message and no machine code. A call
      // that never reached around-dispatch is never treated as a failed provider to route around.
      if (result?.isError && !dispatched.has(exec) && outcome?.kind === 'failure')
        outcome = { kind: 'not-dispatched', effect: 'none' };
      let rows = failures.get(exec.agent);
      if (!outcome) { rows?.delete(exec.name); return; }
      if (!rows) failures.set(exec.agent, rows = new Map());
      rows.delete(exec.name);
      // A new provider definition invalidates evidence about its previous generation.
      let definition;
      try { definition = tools.get(exec.name, exec.agent); } catch { /* absent is evidence too */ }
      rows.set(exec.name, { ...outcome, definition, official: definition !== undefined && officialDefinitions.has(definition) });
      if (rows.size > MAX_FAILURES) rows.delete(rows.keys().next().value);
    },
    text({ scope: agent, toolSet } = {}) {
      if (!object(agent)) return '';
      const live = definitions(agent, toolSet);
      const available = new Map(live.map(def => [def.name, def]));
      const rows = failures.get(agent);
      for (const [name, failure] of rows ?? []) {
        let current;
        try { current = tools.get(name, agent); } catch { /* unavailable */ }
        if (current !== failure.definition) rows.delete(name);
      }
      const unhealthy = name => ['failure', 'unavailable'].includes(rows?.get(name)?.kind);
      const official = live.filter(def => officialDefinitions.has(def)).map(def => def.name).slice(0, MAX_NAMES);
      const enhancements = live.filter(def => !officialDefinitions.has(def) && def.name !== 'run_code' && !unhealthy(def.name)).map(def => def.name).slice(0, MAX_NAMES);
      const lines = [];
      if (enhancements.length) lines.push(`Layer 1: additional capabilities outside the inherited official PTC baseline (bounded list): ${JSON.stringify(enhancements)}. Search their real descriptions and any available provider loader for a matching function first.`);
      for (const route of routes) {
        const fallbacks = route.fallback.filter(name => available.has(name));
        if (available.has(route.preferred) || fallbacks.length) lines.push(
          `Preference: ${JSON.stringify(route.preferred)}${unhealthy(route.preferred) ? ' failed; use a fallback until repaired' : available.has(route.preferred) ? ' available' : ' unavailable'}; candidate fallbacks currently admitted: ${JSON.stringify(fallbacks)}. Check capability and schema; this is not an argument mapping.`);
      }
      for (const [name, failure] of rows ?? []) {
        const label = JSON.stringify(name);
        if (failure.kind === 'denied') lines.push(`${label}: denied. Honor the policy/approval decision; do not route around it.`);
        else if (failure.kind === 'not-dispatched') lines.push(`${label}: not dispatched. Check the original policy/guard/approval or preparation result; do not assume provider failure or switch tools around a denial.`);
        else if (failure.kind === 'cancelled') lines.push(`${label}: cancelled. Do not retry or fall back unless the user authorizes continuing.`);
        else if (failure.kind === 'input') lines.push(`${label}: input/argument failure. Diagnose the call and actual schema before choosing a recovery.`);
        else if (failure.kind === 'command') lines.push(`${label}: foreground command exited unsuccessfully. Diagnose the command and its effects; do not switch shells or treat a nonzero exit alone as provider failure.`);
        else if (failure.kind === 'partial') lines.push(`${label}: partial completion. Preserve completed work and inspect continuation/receipts before completing the remainder.`);
        else if (failure.official) lines.push(`${label}: official fallback failed. Diagnose the actual error and effects; do not loop through the same failed call. Report a precise blocker if no other appropriate admitted capability exists.`);
        else lines.push(`${label}: ${failure.kind}; reported effect state ${failure.effect}. Continue with an equivalent admitted official tool when possible. Inspect state before any mutation/command retry; never copy arguments between schemas.`);
      }
      if (!lines.length) return '';
      lines.push(`Layer 2: visible official baseline tools (bounded list): ${JSON.stringify(official)}. Use an appropriate fallback when layer 1 has no matching working capability. Missing/hidden/step-inactive tools are unavailable; this layer never lifts restrictions.`);
      return lines.join('\n');
    },
    dispose() { failures = new WeakMap(); dispatched = new WeakSet(); },
  };
}

export function installToolCompatibility(ctx, { enabled = true, preferences = [] } = {}) {
  if (!enabled) return;
  const state = createCompatibilityState(ctx.tools, preferences);
  ctx.systemPrompt.section({ name: 'deep-ptc:tool-compatibility', order: 10194, text: compatibilityPolicy });
  ctx.systemPrompt.context({ name: 'deep-ptc:tool-recovery', order: 122, text: context => state.text(context) });
  ctx.on('tools/execute', (exec, next) => { state.dispatched(exec); return next(); });
  ctx.on('tools/result', (exec, result) => state.observe(exec, result));
  ctx.effect(() => () => state.dispose());
}
