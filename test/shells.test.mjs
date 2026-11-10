import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_SHELL, discoverShells, resolveShellExecutable, resolveWindowsBash, shellNote } from '../lib/shells.mjs';

const PS51 = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const PWSH7 = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
const PWSH7_PREVIEW = 'C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe';

test('Windows Bash requires an absolute path to an existing bash.exe file', () => {
  const exe = 'C:\\Program Files\\Niubash\\winuxcmd\\bin\\bash.exe';
  assert.equal(resolveWindowsBash(` ${exe} `, path => path === exe), exe);
  for (const invalid of ['bash.exe', 'C:bash.exe', 'C:/Niubash/pwsh.exe', 'C:/Missing/bash.exe'])
    assert.equal(resolveWindowsBash(invalid, path => path === exe), '');
});

function discover(platform, { env = {}, files = [], found = {}, onWhere } = {}) {
  const key = filePath => platform === 'win32'
    ? String(filePath).replace(/[\\/]+/gu, '\\').toLowerCase()
    : String(filePath);
  const present = new Set(files.map(key));
  return discoverShells({
    platform,
    env,
    exists: filePath => present.has(key(filePath)),
    where(name) {
      onWhere?.(name);
      const value = found[name];
      if (value instanceof Error) throw value;
      return value ?? [];
    },
  });
}

test('windows discovers PowerShell 5.1 and 7 as distinct shells', () => {
  const calls = [];
  const shells = discover('win32', {
    env: { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files' },
    files: [PS51, PWSH7, PWSH7_PREVIEW],
    onWhere: name => calls.push(name),
  });
  assert.deepEqual(calls, ['pwsh.exe', 'pwsh']);
  assert.deepEqual(shells, [
    { id: `path:${PS51}`, label: 'Windows PowerShell 5.1', path: PS51, family: 'powershell' },
    { id: `path:${PWSH7}`, label: 'PowerShell 7', path: PWSH7, family: 'powershell' },
    { id: `path:${PWSH7_PREVIEW}`, label: 'PowerShell 7 Preview', path: PWSH7_PREVIEW, family: 'powershell' },
  ]);
  assert.notEqual(shells[0].path, shells[1].path);
  assert.equal(AUTO_SHELL, '');
});

test('a missing PowerShell 7 install is omitted', () => {
  const shells = discover('win32', {
    env: { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files' },
    files: [PS51, PWSH7_PREVIEW],
  });
  assert.deepEqual(shells.map(item => item.path), [PS51, PWSH7_PREVIEW]);
  assert.equal(shells.some(item => item.label === 'PowerShell 7'), false);
});

test('where() pwsh results dedupe the Program Files install and skip missing paths', () => {
  const extra = 'D:\\Tools\\pwsh.exe';
  const shells = discover('win32', {
    env: { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files' },
    files: [PS51, PWSH7, extra],
    found: {
      'pwsh.exe': ['C:/Program Files/PowerShell/7/pwsh.exe', extra, 'D:\\Missing\\pwsh.exe'],
      pwsh: ['c:\\program files\\powershell\\7\\pwsh.exe', extra],
    },
  });
  assert.deepEqual(shells, [
    { id: `path:${PS51}`, label: 'Windows PowerShell 5.1', path: PS51, family: 'powershell' },
    { id: `path:${PWSH7}`, label: 'PowerShell 7', path: PWSH7, family: 'powershell' },
    { id: `path:${extra}`, label: 'PowerShell (pwsh)', path: extra, family: 'powershell' },
  ]);
});

test('a throwing where() adds no extra PowerShell hits', () => {
  const shells = discover('win32', {
    env: {},
    files: [PS51, PWSH7],
    found: { 'pwsh.exe': new Error('where failed'), pwsh: new Error('where failed') },
  });
  assert.deepEqual(shells.map(item => item.label), ['Windows PowerShell 5.1', 'PowerShell 7']);
});

test('ProgramW6432 is checked only when it differs from ProgramFiles', () => {
  const alt = 'D:\\PF\\PowerShell\\7\\pwsh.exe';
  const altPreview = 'D:\\PF\\PowerShell\\7-preview\\pwsh.exe';
  const distinct = discover('win32', {
    env: { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', ProgramW6432: 'D:\\PF' },
    files: [PWSH7, alt, altPreview],
  });
  assert.deepEqual(distinct.map(item => [item.label, item.path]), [
    ['PowerShell 7', PWSH7],
    ['PowerShell 7', alt],
    ['PowerShell 7 Preview', altPreview],
  ]);
  const same = discover('win32', {
    env: { ProgramFiles: 'C:\\Program Files', ProgramW6432: 'c:/program files/' },
    files: [PWSH7],
  });
  assert.deepEqual(same.map(item => item.path), [PWSH7]);
});

test('darwin lists bash and then zsh, with system labels only for /bin', () => {
  const calls = [];
  const shells = discover('darwin', {
    files: ['/bin/bash', '/opt/homebrew/bin/bash', '/usr/local/bin/bash', '/bin/zsh', '/usr/local/bin/zsh', '/custom/bin/zsh'],
    found: {
      bash: ['/bin/bash', '/opt/homebrew/bin/bash', '/usr/local/bin/bash'],
      zsh: ['/bin/zsh', '/custom/bin/zsh'],
    },
    onWhere: name => calls.push(name),
  });
  assert.deepEqual(calls, ['bash', 'zsh']);
  assert.deepEqual(shells, [
    { id: 'path:/bin/bash', label: 'bash (system)', path: '/bin/bash', family: 'bash' },
    { id: 'path:/usr/local/bin/bash', label: 'bash', path: '/usr/local/bin/bash', family: 'bash' },
    { id: 'path:/opt/homebrew/bin/bash', label: 'bash', path: '/opt/homebrew/bin/bash', family: 'bash' },
    { id: 'path:/bin/zsh', label: 'zsh (system)', path: '/bin/zsh', family: 'zsh' },
    { id: 'path:/usr/local/bin/zsh', label: 'zsh', path: '/usr/local/bin/zsh', family: 'zsh' },
    { id: 'path:/custom/bin/zsh', label: 'zsh', path: '/custom/bin/zsh', family: 'zsh' },
  ]);
});

test('linux labels /bin/bash as bash and does not discover PowerShell', () => {
  const calls = [];
  const shells = discover('linux', {
    env: { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files' },
    files: [PS51, PWSH7, '/bin/bash', '/bin/zsh'],
    onWhere: name => calls.push(name),
  });
  assert.deepEqual(calls, ['bash', 'zsh']);
  assert.deepEqual(shells, [
    { id: 'path:/bin/bash', label: 'bash', path: '/bin/bash', family: 'bash' },
    { id: 'path:/bin/zsh', label: 'zsh (system)', path: '/bin/zsh', family: 'zsh' },
  ]);
  assert.deepEqual(discover('freebsd', { files: ['/bin/bash', PS51] }), []);
});

test('resolveShellExecutable treats auto and a vanished path as automatic', () => {
  const discovered = [
    { id: `path:${PS51}`, label: 'Windows PowerShell 5.1', path: PS51, family: 'powershell' },
    { id: `path:${PWSH7}`, label: 'PowerShell 7', path: PWSH7, family: 'powershell' },
    { id: 'path:/bin/bash', label: 'bash (system)', path: '/bin/bash', family: 'bash' },
  ];
  const gone = { family: 'powershell', discovered, exists: () => false };
  assert.equal(resolveShellExecutable(undefined, gone), '');
  assert.equal(resolveShellExecutable('', gone), '');
  assert.equal(resolveShellExecutable('auto', gone), '');
  assert.equal(resolveShellExecutable(AUTO_SHELL, gone), '');
  assert.equal(resolveShellExecutable(PWSH7, gone), '');
  assert.equal(resolveShellExecutable(`path:${PS51}`, gone), '');
  assert.equal(resolveShellExecutable('C:\\missing\\pwsh.exe', { ...gone, exists: () => true }), '');
  assert.equal(resolveShellExecutable(PWSH7, { family: 'bash', discovered, exists: () => true }), '');
});

test('resolveShellExecutable returns a selected PowerShell 7 path that still exists', () => {
  const discovered = [
    { id: `path:${PS51}`, label: 'Windows PowerShell 5.1', path: PS51, family: 'powershell' },
    { id: `path:${PWSH7}`, label: 'PowerShell 7', path: PWSH7, family: 'powershell' },
  ];
  const exists = filePath => filePath === PWSH7;
  assert.equal(resolveShellExecutable(PWSH7, { family: 'powershell', discovered, exists }), PWSH7);
  assert.equal(resolveShellExecutable(`path:${PWSH7}`, { family: 'powershell', discovered, exists }), PWSH7);
  assert.equal(resolveShellExecutable(PS51, { family: 'powershell', discovered, exists }), '');
});

test('shellNote describes the executable in one sentence', () => {
  assert.equal(shellNote({ family: 'powershell', executable: '' }), '');
  const windows = shellNote({ family: 'powershell', executable: PS51 });
  assert.equal(windows, `Windows PowerShell 5.1 at ${PS51} uses Windows PowerShell syntax, not PowerShell 7.`);
  const modern = shellNote({ family: 'powershell', executable: PWSH7 });
  assert.equal(modern, `PowerShell 7+ at ${PWSH7} uses pwsh syntax.`);
  assert.equal(shellNote({ family: 'bash', executable: '/bin/bash' }), 'The bash tool uses /bin/bash with bash -c.');
  assert.equal(shellNote({ family: 'zsh', executable: '/bin/zsh' }), 'The zsh tool uses /bin/zsh with zsh -lc.');
});
