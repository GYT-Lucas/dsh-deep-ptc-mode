# Deep PTC mode

[中文](README.zh.md) · MIT · **1.5.0**

A DeepSeek Harness agent preset with exactly the built-in PTC tool surface and a different way of working: the model uses its full capability, stays interruptible while work runs, asks for approval only when a task is long, asks you instead of guessing, and runs commands in the environment you choose.

## Overview

Deep PTC targets five common problems with the built-in PTC mode:

| Problem | What Deep PTC does |
| --- | --- |
| The model rations tokens, skipping reads and tests, and quality suffers | The persona states that it works at DeepSeek with an unlimited token budget in this mode: never skip a read, search, command or check to save tokens. Guardrails forbid padding, verbosity and context blow-ups |
| Once work starts, the model sleeps or waits and ignores your messages | Enforced in code: foreground commands move to the background after 30 s, a message from you moves the waiting command to the background at once so the model reads it, and long sleeps are refused; job completion wakes the model (see "Enforced reachability" below) |
| Every task starts the same way regardless of size | Three bands by estimated time: up to 5 minutes, plan internally and act; 5–20 minutes, show the plan and start without approval; over 20 minutes, show the plan and wait for approval |
| It starts before understanding what you meant, then redoes the work | Meaning belongs to you, facts to the tools: unfamiliar names, competing targets or routes, scope and acceptance criteria are asked about (one to three questions with options), never guessed by searching; file locations and current behavior are looked up |
| The command environment is fixed | Choose WSL Bash, PowerShell, Zsh (macOS/Linux) or native Bash in settings; the choice applies to this preset only and leaves the global shell alone |

Three steps: install the plugin → pick an environment under **Settings → Plugins → Deep PTC** → choose **深度PTC模式** in the mode picker for a new task.

## Enforced reachability: no sleeping, always interruptible

From 1.5.0, "don't sleep or wait" is enforced by plugin code, not just requested in the prompt:

| Situation | What the code does |
| --- | --- |
| A foreground command runs long | After **30 s** (configurable, 5–600) it moves to a background job and keeps running; a larger requested `timeoutMs` is capped |
| You send a message while a command runs | The foreground wait ends within about 2 s, the command continues in the background, and the model reads your message; job completion still wakes it |
| `job_output` waits on a job | Capped at 30 s, ends early when you send a message, and waiting again while your message is unread is refused |
| The model writes `sleep 60`, `Start-Sleep 30` or `timeout /t 20` | Foreground pauses over 5 s are refused (`run_in_background` commands are exempt); short readiness loops such as `sleep 1` still work |
| `setTimeout`, `setInterval` or `time.sleep` in a `run_code` program | Waits over 5 s, or with a non-literal duration, are refused; polling one running job more than 3 times in one program is refused |
| `ask_user_question` | Runs in timed mode: 120 s by default, at most 300 s, `-1` refused. An unanswered question becomes pending and your later answer arrives as a message; typing a reply instead of using the card ends the wait at once |

These rules apply only to Deep PTC sessions. They rely on the desktop "busy Enter" setting being **steer**; with **queue**, messages wait for the whole turn to end.

```yaml
- id: deep-ptc-settings
  config:
    foregroundSeconds: 30   # foreground wait cap in seconds, 5-600
```

## Choose an execution environment

Open **Settings → Plugins → Deep PTC**, choose an environment, save, and create a new **深度PTC模式** session.

| Selection | Host | Executor / tool |
| --- | --- | --- |
| Automatic | Windows / macOS / Linux | PowerShell on Windows, Zsh on macOS, Bash on Linux |
| WSL Bash | Windows | Explicit `wsl.exe ... --exec bash -lc`, tool `bash` |
| PowerShell | Windows | Official native PowerShell executor, tool `pwsh` |
| Zsh | macOS / Linux | `/bin/zsh -lc` on macOS; installed `zsh` on Linux; tool `zsh` |
| Native Bash | macOS / Linux | Official Bash executor, tool `bash` |

Unsupported choices are disabled according to the Host, not the browser OS, and rejected by the Host schema. Leave the WSL distribution blank for the Windows default or enter an installed name such as `Ubuntu`. Zsh must be installed when selected on Linux.

The selection changes the real executor, tool contract and environment instructions. Executors live in a preset-local `shell` realm, independent of the global shell and other presets. Settings register a new preset revision for new sessions. Existing sessions and background jobs retain their revision: create a new session to change environment safely.

WSL source uses Linux/POSIX syntax, while file tools and `workdir` use Windows host paths. Distribution, cwd and source are distinct argv entries passed through `wsl.exe --cd`; no surrounding shell string is assembled. Login-shell configuration in the selected distribution controls Linux PATH and proxy setup. Windows environment variables are not all automatically exported into Linux.

### Sandbox behavior

Native PowerShell, Bash and Zsh use Harness sandbox, approval and process management. WSL currently supports only execution already authorized as `danger-full-access`. Confined Windows policies are refused before execution, without fallback or permission changes. The plugin does not authorize escalation.

## Working contract

- Spend the budget on the work: the persona states that the model works at DeepSeek with an unlimited token budget in this mode, so it does not skip reads, searches, commands or checks to save tokens. Guardrails forbid padding, and compaction, pruning and subagents keep each request inside its finite context window.
- Stay reachable while work runs: no sleeps, busy-polls or long foreground calls. Long commands run as background jobs while the model continues short steps and checks progress without blocking; with nothing left to do it states what is running and ends the turn. Job completion wakes it, and user messages are handled immediately.
- Plan by expected size: five minutes or less, plan internally and act; five to twenty minutes, show the plan and start without approval; more than twenty minutes, show the plan and wait for approval. Re-plan when the estimate moves up a band. Explicit plan mode always wins.
- Ask instead of guessing intent: meaning belongs to the user, facts to the tools. Unfamiliar names, competing targets or routes, authoritative sources, expected process, acceptance criteria and scope are asked about rather than guessed or searched for; inspectable facts are looked up. One to three questions with options, recommended first; the user's answer wins.
- Work visibly: one sentence before each `run_code`, longer updates at milestones, never more than two or three silent tool calls.
- Verify changed behavior and stop when criteria are met; delegate only genuinely independent work and collect results through the actual tool's channel.

A prompt changes the model's working tendency, not the real token limit or billing, and compliance is not guaranteed. The setting that actually controls thinking depth is the model's `reasoningEffort`.

## Install or upgrade

Requires Node `>=24` and DSH `>=0.2.1-rc.5`. Windows desktop rc.5 was used for real WSL/PowerShell command checks. macOS/Zsh configuration, argv and tool mounting were checked; native macOS execution has not been verified on this Windows host.

```js
plugin_manager({ action: "install_bundle", target: "dsh-deep-ptc-mode@1.5.0" })
// Or from a local checkout or archive:
plugin_manager({ action: "install_bundle", target: "C:\\path\\to\\dsh-deep-ptc-mode" })
// Or target: "C:\\path\\to\\dsh-deep-ptc-mode-1.5.0.tgz"
```

Repository locator: `github:lishize20040802-rgb/dsh-deep-ptc-mode`. It installs content actually published there; a local upgrade does not publish to GitHub or npm.

Installing the same bundle updates it. Upgrading from the persona-only release requires a Host plugin reload; reopen the app if the settings card has not appeared. Installation does not change the default mode for unrelated new sessions.

Settings persist through the active profile's Cordis patch:

```yaml
- id: deep-ptc-settings
  config:
    environment: auto       # auto | wsl | powershell | zsh | bash
    wslDistribution: ''      # blank uses the Windows default
```

Prefer the UI, which uses revisioned, atomic Host form writes.

## Compatibility and development

The rc.5 PTC template has 23 top-level rows. The template differs only in persona; runtime composition replaces the two platform-switched shell tools with one isolated execution group. Planning, compaction, pruning, web and delegation settings stay intact.

Version 1.3.0 adds Host/browser code and is no longer persona-only. `compatibility.json` records the verified upstream and fixture hash. The engines range is an installation floor, not proof that every future release was tested.

```sh
npm ci
npm run check
npm test
npm run check:upstream -- /path/to/the/new/upstream/ptc.patch.yml
PTC_RUNTIME_MODULES=/path/to/dsh/node_modules node scripts/check-reachability.mjs  # interruptible waits on a real runtime
npm pack
```

The checker parses `!!js` as data, compares nested upstream settings and fails on drift requiring review. Tests cover platforms, argv boundaries, confined WSL refusal, atomic settings writes and stale revisions, plus preset replacement and cleanup. Real-task evaluations should measure successful completion, unnecessary questions, scope expansion, background-work collection and latency.

Main files: `cordis.patch.yml` is the settings entry; `lib/index.mjs` manages revisions; `lib/model.mjs` builds isolated execution configurations; `lib/executor.mjs` adapts WSL/Zsh; `lib/terminal.mjs` wraps the official Bash/PowerShell tools with interruptible waits and provides the Zsh tool; `lib/jobs-tool.mjs` and `lib/ask-user.mjs` wrap the official job and question tools; `lib/guard.mjs`, `lib/rules.mjs`, `lib/sleep-lint.mjs` and `lib/reachable.mjs` implement the pause/polling guard and interruptible waits; `lib/client.js` owns the bilingual settings card; `lib/preset.json` contains the persona and official PTC template.

Uninstall with `plugin_manager` action `remove_bundle`, target `dsh-deep-ptc-mode`. Local link installations depend on their source directory: uninstall before deleting it.

## Author

Deep PTC mode is written and maintained by [lishize20040802-rgb](https://github.com/lishize20040802-rgb).

- Issues and feature requests: [GitHub issues](https://github.com/lishize20040802-rgb/dsh-deep-ptc-mode/issues)
- Email: lishize20040802@gmail.com

Bugs in DeepSeek Harness itself belong upstream, at [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
