// Offline integration check with the installed DSH pipeline and official web tools. The web
// service is a deterministic test double: no network, API credentials or model requests are used.
const { createRequire, registerHooks } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');

const modules = process.env.PTC_RUNTIME_MODULES
  || path.join(path.dirname(process.execPath), 'resources', 'app.asar', 'dsh', 'node_modules');
const from = createRequire(path.join(modules, 'package.json'));
const parentURL = pathToFileURL(path.join(modules, '__compatibility__.mjs')).href;
registerHooks({ resolve(specifier, context, next) {
  return specifier.startsWith('@deepseek-ai/') ? next(specifier, { ...context, parentURL }) : next(specifier, context);
} });
const load = name => import(pathToFileURL(from.resolve(name)));
const local = name => import(pathToFileURL(path.join(__dirname, '..', 'lib', name + '.mjs')));

(async () => {
  const { Context, Service } = await load('@deepseek-ai/cordis');
  const { default: Prompt } = await load('@deepseek-ai/dsh-system-prompt');
  const { ToolRuntime, defineTool } = await load('@deepseek-ai/dsh-tools');
  const root = new Context();
  const fibers = [];
  const mount = async (plugin, config) => { const fiber = root.plugin(plugin, config); fibers.push(fiber); await fiber; };
  let available = false;
  let officialCalls = 0;
  let extensionCalls = 0;
  class Web extends Service {
    constructor(ctx) { super(ctx, 'web'); }
    searchReady() { return available; }
    fetchReady() { return available; }
    async fetch({ url }) {
      officialCalls++;
      return { url, statusCode: 200, body: { kind: 'text', content: 'official fallback content' }, truncated: false };
    }
  }
  await mount(Prompt, {});
  await mount(Web);
  await mount(ToolRuntime, {});
  await mount(await load('@deepseek-ai/dsh-tool-executor-native'));
  await mount(await local('official-tools'), { upstream: '@deepseek-ai/dsh-tool-web' });
  const agent = { id: 'compatibility-test', ctx: root, session: { id: 'compatibility-test', append() {} } };
  const other = { id: 'other-test', ctx: root, session: { id: 'other-test', append() {} } };
  for (let i = 0; i < 100 && !root.tools.get('web_fetch', agent); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(root.tools.get('web_fetch', agent), 'the wrapped official plugin must actually mount');
  const controller = new AbortController();
  const admission = () => root.tools.resolve({ agent, modelSelection: { provider: 'test' }, signal: controller.signal });
  const disabled = await admission();
  assert.equal(root.tools.get('web_fetch', agent, disabled), undefined, 'official when() must remain effective');
  disabled.dispose();
  available = true;
  const extension = defineTool({ name: 'extension_fetch', description: 'Test-only replacement fetch provider',
    parameters: { target: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute() { extensionCalls++; throw new Error('test worker unavailable'); } });
  const removeExtension = root.tools.register(extension);
  const before = root.tools.schemas(agent);
  const observer = root.plugin(await local('tool-compatibility'), { preferences: [{ preferred: 'extension_fetch', fallback: ['web_fetch'] }] });
  await observer;
  assert.deepEqual(root.tools.schemas(agent), before, 'compatibility must not add, replace or mutate schemas');
  const step = await admission();
  let serial = 0;
  const run = async (name, args) => (await root.tools.execute({
    calls: [{ id: `compat-${++serial}`, name, arguments: JSON.stringify(args) }], agent,
    toolSet: step, signal: controller.signal,
  })).results[0].result;
  const context = async scope => {
    const assembly = await root.systemPrompt.assemble({ scope, ...scope === agent ? { toolSet: step } : {} });
    return assembly.contexts.find(row => row.name === 'deep-ptc:tool-recovery')?.text ?? '';
  };
  assert.match(await context(agent), /Layer 1:.*extension_fetch/);
  assert.match(await context(agent), /Layer 2:.*web_fetch/);
  const failed = await run('extension_fetch', { target: 'https://example.test/' });
  assert.equal(failed.isError, true);
  assert.match(await context(agent), /extension_fetch.*failure/);
  assert.equal(officialCalls, 0, 'observer must never silently replay a failed call');
  assert.doesNotMatch(await context(other), /reported effect state/);
  // Simulate the model's next schema-aware choice. The official body and renderer stay official.
  const recovered = await run('web_fetch', { url: 'https://example.test/' });
  assert.equal(recovered.isError, false);
  assert.equal(recovered.value.body.content, 'official fallback content');
  assert.equal(officialCalls, 1);
  assert.equal(extensionCalls, 1);
  const releaseGuard = root.tools.guard(exec => exec.name === 'extension_fetch' ? 'test guard denial without a code' : undefined);
  const denied = await run('extension_fetch', { target: 'https://example.test/' });
  assert.equal(denied.isError, true);
  assert.equal(extensionCalls, 1, 'a guard-denied body must never start');
  assert.match(await context(agent), /not dispatched/);
  releaseGuard();
  step.dispose();
  removeExtension();
  await observer.dispose();
  assert.equal((await root.systemPrompt.assemble({ scope: agent })).contexts.some(row => row.name === 'deep-ptc:tool-recovery'), false);
  console.log('Actual DSH pipeline: provider failure -> scoped recovery guidance -> official web_fetch: passed');
  console.log('Official activation conditions, schemas, policy denial, agent isolation, no replay and disposal: passed');
  for (const fiber of fibers.reverse()) await fiber.dispose();
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
