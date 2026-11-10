// The mapped executor extends the official bash executor: only the argv that starts the shell
// changes. A stand-in base class with the official surface shows which official path each call takes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensible, mappedExecutor } from '../lib/mapped-shell.mjs';

const FULL = { mode: 'danger-full-access', workspaceRoot: '/work' };
const CONFINED = { mode: 'workspace-write', workspaceRoot: '/work' };

function officialBase() {
  const calls = [];
  class Base {
    constructor() {
      this.ctx = {
        sandbox: {
          confine: (argv, policy, signal) => { calls.push(['sandbox.confine', argv, policy, signal]); return argv; },
        },
      };
    }

    static decorateResult(handle, decorate) {
      return { ...handle, result: decorate(handle.result) };
    }

    async execute(spec) {
      calls.push(['execute', spec]);
      return { result: { output: 'official', sandbox: { mode: spec.sandboxPolicy.mode, denied: false } } };
    }

    async executeArgv(spec, argv) {
      calls.push(['executeArgv', argv]);
      return { result: { output: 'mapped' } };
    }

    confine(command) {
      calls.push(['official confine', command]);
    }
  }
  return { Base, calls };
}

test('only an executor with the official surface is extended', () => {
  const { Base } = officialBase();
  assert.equal(extensible(Base), true);
  assert.equal(extensible(class { async execute() {} }), false, 'the pre-executeArgv generation');
  assert.equal(extensible(class { static decorateResult() {} }), false);
  assert.equal(extensible(undefined), false);
  assert.equal(extensible({ decorateResult() {}, prototype: { executeArgv() {} } }), false, 'not a class');
});

test('full access starts the chosen shell and stamps the result as the official executor does', async () => {
  const { Base, calls } = officialBase();
  const executor = new (mappedExecutor(Base, 'zsh', '', '/opt/bin/zsh'))();
  const handle = await executor.execute({ command: 'echo hi', workdir: '/work', sandboxPolicy: FULL });
  assert.deepEqual(calls, [['executeArgv', ['/opt/bin/zsh', '-lc', 'echo hi']]]);
  assert.deepEqual(handle.result, { output: 'mapped', sandbox: { mode: 'danger-full-access', denied: false } });
});

test('a confined call takes the official path and confines the chosen shell', async () => {
  const { Base, calls } = officialBase();
  const executor = new (mappedExecutor(Base, 'zsh', '', '/opt/bin/zsh'))();
  const spec = { command: 'ls', workdir: '/work', sandboxPolicy: CONFINED };
  const handle = await executor.execute(spec);
  assert.deepEqual(calls, [['execute', spec]]);
  assert.equal(handle.result.output, 'official');

  const signal = AbortSignal.abort();
  assert.deepEqual(executor.confine('ls', CONFINED, signal), ['/opt/bin/zsh', '-lc', 'ls']);
  assert.deepEqual(calls.at(-1), ['sandbox.confine', ['/opt/bin/zsh', '-lc', 'ls'], CONFINED, signal]);
});

test('WSL refuses a confined call before anything runs', async () => {
  const { Base, calls } = officialBase();
  const executor = new (mappedExecutor(Base, 'wsl', 'Ubuntu'))();
  await assert.rejects(
    executor.execute({ command: 'ls', workdir: 'C:\\work', sandboxPolicy: CONFINED }),
    /No command was executed/u,
  );
  assert.throws(() => executor.confine('ls', CONFINED), /No command was executed/u);
  assert.deepEqual(calls, []);
});

test('the mapped class adds no method the official executor lacks', () => {
  const { Base } = officialBase();
  const own = Object.getOwnPropertyNames(mappedExecutor(Base, 'zsh').prototype).filter(key => key !== 'constructor');
  for (const key of own) assert.equal(typeof Base.prototype[key], 'function', `${key} exists on the official executor`);
});
