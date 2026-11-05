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
  const { Session } = await load('@deepseek-ai/dsh-session');
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
  await mount((await load('@deepseek-ai/dsh-commands')).default);
  await mount((await load('@deepseek-ai/dsh-session-projection')).default);
  await mount(await local('official-tools'), { upstream: pathToFileURL(path.join(__dirname, 'fixtures', 'class-tool-provider.mjs')).href });
  await mount(await load('@deepseek-ai/dsh-tool-executor-native'));
  await mount(await local('official-tools'), { upstream: '@deepseek-ai/dsh-tool-web' });
  const agent = { id: 'compatibility-test', ctx: root, session: Session.create('compatibility-test') };
  const other = { id: 'other-test', ctx: root, session: Session.create('other-test') };
  for (let i = 0; i < 100 && !root.tools.get('web_fetch', agent); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(root.tools.get('web_fetch', agent), 'the wrapped official plugin must actually mount');
  const { isOfficialTool } = await local('tool-policy');
  assert.ok(isOfficialTool(root.tools.get('class_official_probe', agent)), 'class-style official tools retain declaration provenance');
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
  for (let i = 0; i < 100 && !root.tools.get('deep_ptc_tools', agent); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(root.tools.get('deep_ptc_tools', agent), 'directory mounted');
  assert.deepEqual(root.tools.schemas(agent).filter(row => row.name !== 'deep_ptc_tools'), before, 'task schemas must stay unchanged');
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
  const directory = await run('deep_ptc_tools', { action: 'search', query: 'fetch' });
  assert.equal(directory.value.layer, 'external');
  const failed = await run('extension_fetch', { target: 'https://example.test/' });
  assert.equal(failed.isError, true);
  assert.match(await context(agent), /Quarantined/);
  const restoredSession = Session.create(agent.session.id, agent.session.snapshotEvents());
  const restoredAgent = { ...agent, session: restoredSession };
  const restoredResult = (await root.tools.execute({ calls: [{ id: 'restored-call', name: 'extension_fetch', arguments: JSON.stringify({target:'https://example.test/'}) }], agent: restoredAgent, signal: controller.signal })).results[0].result;
  assert.equal(restoredResult.isError, true);
  assert.equal(extensionCalls, 1, 'quarantine survives restoring the same conversation');
  assert.equal(officialCalls, 0, 'observer must never silently replay a failed call');
  assert.doesNotMatch(await context(other), /Quarantined/);
  // Simulate the model's next schema-aware choice. The official body and renderer stay official.
  const recovered = await run('web_fetch', { url: 'https://example.test/' });
  assert.equal(recovered.isError, false);
  assert.equal(recovered.value.body.content, 'official fallback content');
  assert.equal(officialCalls, 1);
  assert.equal(extensionCalls, 1);
  const retry = await run('extension_fetch', { target: 'https://example.test/' });
  assert.equal(retry.isError, true);
  assert.equal(extensionCalls, 1, 'failed tools must not execute again');
  const reset = await root.commands.execute(agent, '/deep-ptc-reset-tools', [], controller.signal);
  assert.equal(reset.result.kind, 'success');
  assert.doesNotMatch(await context(agent), /Quarantined/);
  const releaseGuard = root.tools.guard(exec => exec.name === 'extension_fetch' ? 'test guard denial without a code' : undefined);
  const denied = await run('extension_fetch', { target: 'https://example.test/' });
  assert.equal(denied.isError, true);
  assert.equal(extensionCalls, 1, 'a guard-denied body must never start');
  assert.doesNotMatch(await context(agent), /Quarantined/);
  releaseGuard();
  let skillBodiesRead = 0;
  class TestSkills extends Service {
    constructor(ctx) { super(ctx, 'skills'); }
    async list() { return [{ name: 'build-helper', description: 'Build and test a project', invocation: {modelInvocable:true,userInvocable:true} }, {name:'hidden-build',description:'Build hidden',invocation:{modelInvocable:false,userInvocable:true}}]; }
    async get() { skillBodiesRead++; throw new Error('Discovery must not read skill bodies'); }
  }
  await mount(TestSkills);
  const { markOfficialTool } = await local('tool-policy');
  const removeSkill = root.tools.register(markOfficialTool(defineTool({ name: 'skill', description: 'Test official skill loader',
    parameters: { name: {type:'string',required:true} }, output: {schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    execute: () => 'skill instructions' }), '@deepseek-ai/dsh-tool-skill'));
  const skillStep = await admission();
  const skillDiscovery = await root.tools.get('deep_ptc_tools', agent, skillStep).execute({action:'skills',query:'build'}, {agent,toolSet:skillStep,signal:controller.signal});
  assert.equal(skillDiscovery.results[0].name, 'build-helper');
  assert.equal(skillDiscovery.total, 1, 'user-only skills must not leak into model discovery');
  assert.equal(skillDiscovery.loadWith, 'skill');
  assert.equal(skillBodiesRead, 0);
  skillStep.dispose(); removeSkill();
  const extraRemovers = [];
  for (let i=0;i<40;i++) extraRemovers.push(root.tools.register(defineTool({name:`catalog_probe_${i}`,description:'Repository helper '+ 'documentation '.repeat(40),parameters:{path:{type:'string',required:true}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:()=> 'unused'})));
  // Exercise the actual official PTC SDK renderer without making a model/API request.
  class TestPtcRuntime extends Service { constructor(ctx) { super(ctx, 'ptcRuntime'); this.language = 'typescript'; this.programFormat = 'function-body'; } }
  await mount(TestPtcRuntime);
  const { createScope } = await load('@deepseek-ai/dsh-scope');
  const ptcAgent = { id: 'ptc-catalog', session: Session.create('ptc-catalog') };
  const scoped = createScope(root, ptcAgent); ptcAgent.ctx = scoped.ctx;
  const ptcFiber = scoped.ctx.plugin(await load('@deepseek-ai/dsh-tool-executor-ptc'));
  await ptcFiber;
  const { renderToolsSdk } = await load('@deepseek-ai/dsh-tool-executor-ptc');
  const { toolSchema } = await local('tool-catalog');
  const ptcStep = await root.tools.resolve({ agent: ptcAgent, modelSelection: {provider:'test'}, signal: controller.signal });
  const fullSdk = renderToolsSdk(root.tools.definitions(ptcAgent, ptcStep).map(toolSchema));
  const compactAssembly = await root.systemPrompt.assemble({scope:ptcAgent,toolSet:ptcStep});
  const compactSdk = compactAssembly.sections.find(section => section.name === 'tools:sdk').text;
  assert.ok(compactSdk.length < fullSdk.length, 'actual PTC prompt must get smaller');
  assert.ok(!compactSdk.includes('"extension_fetch"'), 'unselected extension schema omitted');
  const directoryDefinition = root.tools.get('deep_ptc_tools', ptcAgent, ptcStep);
  const loaded = await directoryDefinition.execute({action:'load',names:['extension_fetch']}, {agent:ptcAgent,toolSet:ptcStep,signal:controller.signal});
  assert.equal(loaded.loaded[0].name, 'extension_fetch');
  const expanded = await root.systemPrompt.assemble({scope:ptcAgent,toolSet:ptcStep});
  assert.ok(expanded.sections.find(section=>section.name==='tools:sdk').text.includes('extension_fetch'));
  const removeCustom = root.on('system-prompt/assemble', async (_assembly, context, next) => {
    const value = await next();
    return { ...value, sections: value.sections.map(section => section.name === 'tools:sdk' ? {...section,text:section.text+'\nCUSTOM_PROVIDER_SDK'} : section) };
  });
  const customized = await root.systemPrompt.assemble({scope:ptcAgent,toolSet:ptcStep});
  assert.ok(customized.sections.find(section=>section.name==='tools:sdk').text.includes('CUSTOM_PROVIDER_SDK'), 'provider-owned sections must survive');
  assert.ok(customized.sections.find(section=>section.name==='tools:sdk').text.includes('catalog_probe_39'), 'do not rewrite customized SDK contents');
  removeCustom();
  console.log(`Actual PTC SDK: ${fullSdk.length} -> ${compactSdk.length} chars before selecting a test extension; selected schema restored.`);
  ptcStep.dispose(); await ptcFiber.dispose(); await scoped.dispose();
  for (const remove of extraRemovers) remove();
  step.dispose();
  removeExtension();
  await observer.dispose();
  assert.equal((await root.systemPrompt.assemble({ scope: agent })).contexts.some(row => row.name === 'deep-ptc:tool-recovery'), false);
  console.log('Actual DSH pipeline: provider failure -> scoped recovery guidance -> official web_fetch: passed');
  console.log('Persistent quarantine, user reset, official conditions, schemas, policy denial, session isolation, no replay and disposal: passed');
  for (const fiber of fibers.reverse()) await fiber.dispose();
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
