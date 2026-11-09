import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBeforeResolve } from '../lib/freshness.mjs';

function registry(defaultId = 'ptc') {
  const calls = [];
  return { calls, defaultId, async resolve(id) { calls.push(id); return { id: id ?? this.defaultId }; } };
}

test('a Deep PTC conversation is checked once before its preset resolves; others are not', async () => {
  const host = registry('deep-ptc');
  const order = [];
  checkBeforeResolve(host, async () => { order.push('check'); });
  const original = host.calls;
  await host.resolve('deep-ptc');
  await host.resolve(undefined);
  await host.resolve('ptc');
  assert.deepEqual(order, ['check', 'check'], 'deep-ptc and the deep-ptc default are checked, ptc is not');
  assert.deepEqual(original, ['deep-ptc', undefined, 'ptc']);
});

test('the check runs before resolution, and a slow or failing check never blocks the conversation', async () => {
  const host = registry();
  const order = [];
  checkBeforeResolve(host, async () => { await new Promise(done => setTimeout(done, 20)); order.push('check'); });
  const real = host.resolve;
  const before = host.calls.length;
  await real.call(host, 'deep-ptc');
  order.push('resolved');
  assert.deepEqual(order, ['check', 'resolved']);
  assert.equal(host.calls.length, before + 1);

  const slow = registry();
  checkBeforeResolve(slow, () => new Promise(() => {}), { timeoutMs: 30 });
  const started = Date.now();
  assert.deepEqual(await slow.resolve('deep-ptc'), { id: 'deep-ptc' });
  assert.ok(Date.now() - started < 1000, 'a hung check gives up at its timeout');

  const failing = registry();
  checkBeforeResolve(failing, async () => { throw new Error('unreadable'); });
  assert.deepEqual(await failing.resolve('deep-ptc'), { id: 'deep-ptc' });
});

test('installing twice wraps once, and disposing restores the original method', async () => {
  const host = registry();
  const original = host.resolve;
  let checks = 0;
  const dispose = checkBeforeResolve(host, async () => { checks++; });
  const second = checkBeforeResolve(host, async () => { checks += 100; });
  await host.resolve('deep-ptc');
  assert.equal(checks, 1);
  second();
  dispose();
  assert.equal(host.resolve, original);
  assert.deepEqual(checkBeforeResolve({}, async () => {})(), undefined, 'a registry without resolve is left alone');
});
