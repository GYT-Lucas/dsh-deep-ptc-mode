// Static checks for waiting written into commands or run_code programs. Short literal pauses (readiness
// loops, debounce) stay legal; anything longer, or a delay whose length cannot be read, is reported.
export const MAX_PAUSE_SECONDS = 5;

const UNIT_SECONDS = { '': 1, s: 1, m: 60, h: 3600, d: 86400 };

// Longest literal pause in a bash/zsh/PowerShell/cmd command, in seconds; 0 when there is none.
export function shellPauseSeconds(command) {
  let longest = 0;
  const take = seconds => { if (!Number.isNaN(seconds)) longest = Math.max(longest, seconds); };
  for (const m of command.matchAll(/(?:^|[\s;&|({`])sleep\s+(infinity|[0-9]*\.?[0-9]+)([smhd]?)(?=$|[\s;&|)}`])/gu))
    take(m[1] === 'infinity' ? Infinity : Number(m[1]) * UNIT_SECONDS[m[2]]);
  for (const m of command.matchAll(/\b(?:Start-Sleep|sleep)\s+(?:-(s|seconds|m|milliseconds|duration)\s+)?([0-9]*\.?[0-9]+)/giu)) {
    const flag = (m[1] ?? 's').toLowerCase();
    if (flag === 'duration') continue;
    take(flag.startsWith('m') ? Number(m[2]) / 1000 : Number(m[2]));
  }
  for (const m of command.matchAll(/\btimeout(?:\.exe)?\s+\/t\s+(-?\d+)/giu)) take(Number(m[1]) < 0 ? Infinity : Number(m[1]));
  return longest;
}

// Read the argument list of the call whose opening parenthesis is at `open`.
function callArguments(source, open) {
  const args = [];
  let depth = 0;
  let start = open + 1;
  let quote;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = undefined;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      depth--;
      if (depth === 0) {
        args.push(source.slice(start, i).trim());
        return args.filter(arg => arg !== '');
      }
    } else if (c === ',' && depth === 1) {
      args.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  return undefined;
}

const numeric = text => /^[0-9][0-9_]*(?:\.[0-9_]+)?(?:e[0-9]+)?$/iu.test(text) ? Number(text.replaceAll('_', '')) : undefined;

// A reason when a run_code program sleeps longer than allowed, polls on a timer, or blocks the thread.
export function programPauseIssue(code) {
  if (/\bsetInterval\s*\(/u.test(code)) return 'setInterval polling';
  if (/\bAtomics\.wait\s*\(/u.test(code)) return 'Atomics.wait';
  for (const m of code.matchAll(/\bsetTimeout\s*\(/gu)) {
    // setTimeout(callback, ms) from the global timers, setTimeout(ms, value) from timers/promises.
    const args = callArguments(code, m.index + m[0].length - 1);
    if (args === undefined) return 'an unreadable setTimeout call';
    const delay = numeric(args[0] ?? '') ?? (args.length >= 2 ? numeric(args[1]) : 0);
    if (delay === undefined) return 'a setTimeout delay that is not a numeric literal';
    if (delay > MAX_PAUSE_SECONDS * 1000) return `a ${delay} ms setTimeout`;
  }
  for (const m of code.matchAll(/\b(?:time\.|asyncio\.)?sleep\s*\(/gu)) {
    if (!/\b(?:time|asyncio)\.sleep/u.test(m[0]) && !/\bimport\b[^\n]*\bsleep\b/u.test(code)) continue;
    const args = callArguments(code, m.index + m[0].length - 1);
    const seconds = args?.length ? numeric(args[0]) : undefined;
    if (seconds === undefined) return 'a sleep whose duration is not a numeric literal';
    if (seconds > MAX_PAUSE_SECONDS) return `a ${seconds} s sleep`;
  }
  return undefined;
}
