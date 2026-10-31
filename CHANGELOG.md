# Changelog

## 1.5.0 — 2026-10-31

- Enforce reachability in code. Foreground shell commands move to background jobs after `foregroundSeconds` (default 30, configurable 5–600); a larger requested timeout is capped. Commands still run; only the wait ends.
- A user message steered into the turn ends the current foreground wait within about 2 s: shell commands move to the background, `job_output` returns, and a timed question becomes pending. Waiting again with job_output while the message is unread is refused.
- Refuse foreground pauses over 5 s (`sleep`, `Start-Sleep`, `timeout /t`), `run_code` programs that wait on long or non-literal timers, `setInterval` and `Atomics.wait`, and more than 3 polls of one running job inside a program.
- Run `ask_user_question` in timed mode (120 s default, 300 s cap, `-1` refused) and fix the persona, which named a non-existent `timeoutMs` parameter.
- Wrap the official bash, pwsh, job and question tools instead of replacing them; the upstream check verifies exactly which rows are wrapped.
- Add `scripts/check-reachability.mjs`, an integration check on a real DSH runtime, and extend the Windows host check to activate the guard.

## 1.4.0 — 2026-10-31

- Restore the 1.2.0 intent in the persona while keeping 1.3.0's execution environments: the DeepSeek identity and unlimited-budget contract with anti-padding guardrails; size-based planning (internal up to five minutes, shown without approval up to twenty, approved beyond); asking about meaning instead of searching for it.
- Make waiting reachable: background jobs, non-blocking progress checks, ending the turn when idle, and handling mid-task user messages first, based on the runtime's step-boundary steering and job wakeups.
- Restore one-sentence progress before each run_code and a stated "not doing" list in plans.

## 1.3.0 — 2026-10-30

- Add bilingual settings for Automatic, WSL Bash, Windows PowerShell, native Zsh and native Bash. WSL distribution is optional. Unsupported choices are disabled according to the host platform.
- Isolate executors inside the preset. Settings apply to new sessions; existing sessions and jobs retain their revision. Global shell configuration stays independent.
- Launch WSL explicitly with separate argv entries. Reuse official process, terminal and approval implementations. Refuse confined WSL execution before spawning.
- Allow focused fact lookup before semantic questions, preserve authorization when work takes longer, and distinguish finite jobs from servers and unregistered external tasks.
- Add verification stopping conditions and collect delegated results through the actual tool's channel.
- Remove unsupported unlimited-budget and DeepSeek-employment claims. Reduce the persona from about 2,203 to 1,091 English words.
- Add upstream composition checks, platform/argv tests, revision lifecycle tests and rendered settings-form tests.
- Raise the minimum DSH version to `0.2.1-rc.5`, the runtime used for integration verification.

## 1.2.0

Previous persona-only PTC preset with semantic questions, duration-based planning, progress updates and delegation instructions.
