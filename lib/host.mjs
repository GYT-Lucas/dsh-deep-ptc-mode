// Load host modules by the names the official declarations use. Nothing here names an official tool:
// callers pass the module name read from the installed Harness, so a rename or replacement upstream
// is followed instead of breaking a hard-coded import.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { OFFICIAL_PACKAGE } from './upstream.mjs';
import { adaptContext, registering } from './adapt.mjs';
import { markOfficialTool } from './tool-policy.mjs';

function anchor() {
  try {
    return import.meta.resolve(`${OFFICIAL_PACKAGE}/package.json`);
  } catch {
    return undefined;
  }
}

/**
 * Resolve a host module the way the installed runtime would.
 * A linked installation only routes peer-declared names to the runtime, so a name the official
 * declaration introduces later is resolved from the runtime's own package graph instead.
 * @returns a URL, or undefined when the runtime does not provide the module.
 */
export function resolveHost(specifier) {
  try {
    return import.meta.resolve(specifier);
  } catch {
    // Not routed for this plugin; ask the runtime's graph.
  }
  const from = anchor();
  if (from === undefined) return undefined;
  try {
    return pathToFileURL(createRequire(from).resolve(specifier)).href;
  } catch {
    return undefined;
  }
}

export async function importHost(specifier) {
  const url = resolveHost(specifier);
  if (url === undefined) throw new Error(`the installed Harness provides no module ${JSON.stringify(specifier)}`);
  return import(url);
}

// The Cordis plugin a module exports: the namespace itself, or its default export.
export function pluginOf(namespace) {
  if (typeof namespace?.apply === 'function') return namespace;
  return namespace?.default ?? namespace;
}

/**
 * Start the official plugin `upstream` with its own inject list and Config, giving its apply an
 * adapted context. A plugin of another shape is started unadapted, so the official behaviour stays.
 */
export async function applyOfficial(ctx, upstream, options, adapt) {
  const plugin = pluginOf(await importHost(upstream));
  const tagged = child => adapt(adaptContext(child, {
    tools: tools => registering(tools, definition => markOfficialTool(definition, upstream)),
  }));
  if (typeof plugin === 'function') {
    if (/^\s*class\b/u.test(Function.prototype.toString.call(plugin))) {
      class TaggedOfficial extends plugin { constructor(child, ...args) { super(tagged(child), ...args); } }
      return ctx.plugin(TaggedOfficial, options);
    }
    return ctx.plugin({ ...plugin, name: plugin.name || upstream, apply: (child, config) => plugin(tagged(child), config) }, options);
  }
  if (typeof plugin?.apply !== 'function') {
    ctx.logger.warn('Deep PTC: %s is not an apply-style plugin; loading it without Deep PTC wait handling', upstream);
    return ctx.plugin(plugin, options);
  }
  return ctx.plugin({
    ...plugin,
    name: plugin.name ?? upstream,
    ...plugin.inject === undefined ? {} : { inject: plugin.inject },
    ...plugin.Config === undefined ? {} : { Config: plugin.Config },
    apply: (child, config) => plugin.apply(tagged(child), config),
  }, options);
}
