# Deep PTC mode

[中文](README.zh.md) · MIT · **1.8.6**

[1.7.3 实测汇总 / Test summary](TEST_REPORT.md)
**Reports. Asks. Stays awake. Plans. Stays reachable.**  
**Five basics, one mode; everything is a plugin, with the official preset always as the fallback.**

Deep PTC is not another tool bundle. It is a DeepSeek Harness agent preset built around five basic problems in model work: working silently without reporting, guessing instead of asking when intent is ambiguous, sleeping and becoming unreachable during a task, not planning or not showing the plan, and not using the original PTC preset's concise context plus its unlimited-token prompt.

Those five are handled first by prompts and code. On top of that, following DSH's “everything is a plugin” philosophy, the preset adds dynamic preset/tool loading, creative-mode tools for building DSH plugins, dsh-go screen-control adaptation, wider shell support, external plugin tool/workflow adaptation, and a leaner skill/tool loading flow. Deep PTC adds no task tools itself; it provides the interface that lets a plugin's new tools be discovered, loaded and called.

Not every third-party plugin is guaranteed to fit: the interface is verified for dsh-ops and reused by other plugins, but a plugin still has to support the installed host and publish its tools under the expected contract.

## Five basic problems

| # | Problem | What Deep PTC does |
| --- | --- | --- |
| 1 | **Working silently without reporting** | One sentence before every `run_code`; a longer update at milestones; never more than two or three silent tool calls; a short final result with failed tools and providers. |
| 2 | **Guessing instead of asking** | Meaning belongs to the user, facts to the tools: ask one to three questions with options when names, targets, routes, scope or acceptance criteria are unclear; look up inspectable facts yourself. The user's answer wins. |
| 3 | **Sleeping or becoming unreachable** | Enforced in code: foreground waits move to the background after 30 s; a user message hands the waiting command to the background within about 2 s; foreground sleeps over 5 s are refused; job completion wakes the model. |
| 4 | **No plan, or an invisible plan** | Plan by estimated size: act silently under 5 minutes; show the plan and start without approval for 5–20 minutes; show it and wait for approval over 20 minutes. Re-plan when the estimate moves up; the user can redirect at any step. |
| 5 | **Not using the concise context and unlimited-token prompt** | Derive from the live official PTC composition, keep the tool catalog compact and load full schemas on demand, and state that this mode spends its token budget on reads, searches, commands and checks rather than rationing them. The prompt does not change billing or the real token limit. |

## Built for “everything is a plugin”

### 1. Dynamic preset and tool loading

Read the running host's official PTC declaration and inherit its rows as they are; only the persona, execution group, reachability guard, job wrapper and question wrapper are replaced. Rebuild only when the declaration or settings change, checked when settings change and once before each Deep PTC conversation is created or resumed, with no polling timer; fall back to the bundled snapshot with a warning if it cannot be loaded, parsed or derived. An official upgrade can add tools without a release of this preset; existing sessions are not forcibly switched.

### 2. Flexible creative-mode tools

The plugin lab is always on for a session. It reads the host's creative preset and appends only the rows that mode adds, specifically for building DSH plugins. Module names stay as declared; skill directories resolve relative to the creative preset file. Lab packages stay in process memory, are not written to the repository, shipped presets, desktop composition or this plugin's source, and run only through the host's existing approval. Loading reads the roster and documents only; it never calls `composedPreset`.

### 3. dsh-go screen-control adaptation

Screen-control tools stay in the initial PTC SDK, are not moved on demand, and are not quarantined on failure. Recognition uses the tool's own `resident` mark, `dsh-go/view`, its name or its provider mark. Deep PTC does not claim dsh-go's slots or replace its settings form; if the tool-state projection fails, that control stays empty without tearing down the composer or screen-control UI.

### 4. Wider execution environments

WSL Bash, PowerShell (including discovered 5.1 and 7 executables), Zsh and native Bash are supported. The choice applies to this preset only and does not change the global shell; sandbox, approval and process management stay official. WSL currently requires the host-authorized `danger-full-access` mode.

### 5. External plugin tool/workflow adaptation (dsh-ops tested)

This is the core interface: external plugins publish tools under their own contract; Deep PTC discovers them, loads them on demand, quarantines failures per conversation and falls back to official PTC. Extensions must support the installed host and publish into the `deep-ptc` scope; Deep PTC does not depend on any specific plugin or replace the executor.

**dsh-ops is specifically tested.** Its gate recognises only `minimal/standard/ptc/cordis`. Deep PTC first offers the native `deep-ptc`; when it detects that the plugin restricts preset names, it returns the base id the plugin accepts — `ptc` (or `cordis` for a creative row) — while host internals keep the exact `deep-ptc`. dsh-ops therefore needs no change for its new tools to be discovered and called; other plugins use the same interface, judged by their own packages. Unattributed tools are not quarantined; only a positively attributed external provider can be, and official tools are never quarantined.

### 6. Leaner skill and tool loading

Each turn ends with a skill context card that lists only the skills still loaded and not closed, so the user decides what stays for the next turn.

Search summaries first, then load full schemas: six entries per page by default (maximum eight), up to six schemas within a 16 KB budget per load, and up to twelve recent selections. Quarantine persists with the conversation: clear unavailability blocks immediately; temporary failures need three in a row and a success clears the count; wrong arguments, denial and normal business failures are not tool failures; one reset clears only the current conversation. Skills load in two stages: discovery reads metadata and invocation permission only; the official `skill` tool loads the body.

Three steps: install the plugin → choose an environment under **Settings → Plugins → Deep PTC** → choose **深度PTC模式** in the mode picker for a new task.

## Skill context card (1.8.5)

After each turn, a card at the end of that turn in the conversation (where official plan cards appear) lists only the skills that are **still in context and not closed** — not the whole skill catalog. Each row shows the name, description and a switch, on by default; the card also offers **Keep all / Close all** and says how many skills leave after the next message. More than four rows fold behind “Show all”. Only the latest turn shows the card.

- A switch changes the next turn only. It is fixed when you send the next message and applied before the first model step of that turn.
- A kept skill stays in context without a reload; a closed skill has its tool-result body replaced with a short marker, while the durable log and human transcript keep the original text.
- A closed skill disappears from later cards until the model loads it again.
- If a new task really needs it, the model calls `skill` again and the card lists it after that turn.
- The state is registered at the plugin root, so an existing Deep PTC session also rebuilds it from history after an upgrade; no new session is required.
- The card tracks skills loaded directly through the official `skill` tool and skills loaded by a PTC inner call inside `run_code`. The latter usually reach the program rather than the model context, so closing one only removes it from the card, not from program output. `/name` injections are not covered yet.
- A switch leaves no command row in the conversation (the session log still records it); only a failed switch shows a short error line in place.

## Visual effects and side card

The look from dsh-refined-ui is part of this plugin and applies **only while the conversation on screen is a Deep PTC session**; other modes and the new-session page keep the official look.

- Calmer light and dark neutrals, a Chinese-first font stack, slim scrollbars, a floating composer card with a flowing blue hairline on focus, a blue gradient send button, soft blue user bubbles, roomier assistant text, and a blue wash on hovered and selected sidebar rows.
- Interactions: Ctrl/Cmd+K command palette (sessions, new session, plugins, automations), pointer spotlight, click ripple, magnetic send button, `/` to focus the composer, Alt+Up/Down to switch sessions, Ctrl+Alt+D diagnostics.
- Motion: while the conversation runs, the composer turns blue and breathes (also while focused), with a send-button ring and a steady stream of sparks rising above it; sparks on send and completion. Everything honours reduced motion.
- Each Deep PTC conversation has a **side card** on the right.
  - **Execution environment** offers WSL, PowerShell, native Bash, or Zsh depending on the host. It writes the same host settings as the settings page and applies to newly created Deep PTC sessions.
  - **Visual effects** toggles styling and animations immediately and saves the preference in the current client. Keep it off when using an external theme or UI plugin.
  - **Subagents**, when there are any: name, state, duration and tokens from the official subagent catalog and timing data; a row opens that subagent's chat in the official right sidebar.
  - **Background jobs** shows the current conversation's active and finished jobs. The card has six positions by default, with up to five active jobs first and up to three finished jobs. An expandable row uses one position and shows how many jobs it contains.
  - **Tool state**: the “Reload all tool states” button and, when present, the failed external tools.
  The column uses the host's background with light grey dividers, blue only for the selected option, button outlines and status squares, and the host's usual black and grey text; for a running subagent only its small status square flashes blue. In a narrow conversation the card folds into a small pill, whose status square flashes the same way. It can be collapsed, and that choice is kept on this machine.
- While the standalone dsh-refined-ui is still running, this plugin does not draw the same look a second time.

## 1.7.2: lightweight, on-demand tool orchestration

One tool/skill directory, `deep_ptc_tools`, coordinates discovery. Task operations still belong to external providers and the current official PTC tools.

- **Search summaries, then load definitions.** Local metadata search prefers external tools, then returns official candidates when no extension matches. Pages default to six entries (maximum eight); disclose up to six complete schemas within a 16 KB budget per load. Official tools stay available; up to twelve recent extension selections enter the host-generated PTC SDK on demand.
- **Quarantine what is actually broken.** A tool that is clearly unavailable (a missing module or API, or a declared unavailable state) is quarantined at once; temporary and unexplained failures need three in a row, and a success clears the count. Wrong arguments or paths, denial, cancellation and normal results describing their own subject (such as a failed build) are not tool failures. Official tools are never quarantined, including those in the profile's root composition (such as `lsp` and `terminal_*`). After quarantine, execution is blocked in code and state persists with the session. Agent recreation, conversation restore and provider reload do not lift quarantine. Capture provenance and reset generation before dispatch; late pre-reset results cannot contaminate the new state. Empty results, normal pagination and ordinary nonzero command exits are not failures either.
- **Finish the task; do not diagnose failed providers.** Correct wrong input and retry a temporary failure at most twice. Once a tool is quarantined, move promptly to a working equivalent or official fallback, with no probing, retrying or root-cause investigation. Read back only the task state necessary to avoid duplicate effects after a potentially partial mutation.
- **Brief completion reporting.** The model lists failed tools and declared provider names at completion. The runtime also projects an expandable compatibility notice after a turn ends. Unknown ownership is reported as unknown, never inferred from a tool name.
- **Reload from the side card.** “Reload all tool states” clears quarantine and on-demand selections for the current conversation without a model call or stopping running jobs. The user slash command `/deep-ptc-reset-tools` provides the same action. The tool state and this command are registered at the plugin root, like the skill card, so they work in an idle conversation too.
- **Two-stage skill use.** Search the host's resolved, model-invocable skill metadata, then load the exact name with the official `skill` tool and follow its full instructions. Reuse instructions already in context. Discovery never reads skill bodies.

```js
// Inside the official run_code tool; discovery itself never executes a found task tool.
const matches = await tools.deep_ptc_tools({ action: 'search', query: 'search files' });
const loaded = await tools.deep_ptc_tools({ action: 'load', names: ['actual_tool_name'] });
const skills = await tools.deep_ptc_tools({ action: 'skills', query: 'build test' });
// Next use each actual tool schema, or the official skill loader for a selected skill.
```

Set `compactToolCatalog: false` under `deep-ptc-settings` to retain the full host SDK while keeping quarantine and reset. `toolCompatibility: false` disables the entire new layer. Optional `toolPreferences` still guide choices between existing tools.

Compaction only changes an untouched SDK section generated by the installed official renderer. Provider-owned/custom SDKs keep their own loaders. Extensions must support the host and publish into `deep-ptc`; this layer does not override hidden tools, authorization or an unloaded whole executor. Actual OPS/online-model end-to-end integration has not been performed.



## Enforced reachability: no sleeping, always interruptible

From 1.5.0, "don't sleep or wait" is enforced by plugin code, not just requested in the prompt:

| Situation | What the code does |
| --- | --- |
| A foreground command runs long | After **30 s** (configurable, 5–600) it moves to a background job and keeps running; a larger requested `timeoutMs` is capped |
| You send a message while a command runs | The foreground wait ends within about 2 s, the command continues in the background, and the model reads your message; job completion still wakes it |
| `job_output` waits on a job | Capped at 30 s, ends early when you send a message, and waiting again while your message is unread is refused |
| The model writes `sleep 60`, `Start-Sleep 30` or `timeout /t 20` | Foreground pauses over 5 s are refused (`run_in_background` commands are exempt); short readiness loops such as `sleep 1` still work |
| `setTimeout`, `setInterval` or `time.sleep` in a `run_code` program | Known waits over 5 s are refused; unresolved durations pass through; polling one running job more than 3 times in one program is refused |
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
| Native Bash | Windows | An absolute path to `bash.exe`, such as the Niubash binary bundled with `dsh-ops` |
| Zsh | macOS / Linux | `/bin/zsh -lc` on macOS; installed `zsh` on Linux; tool `zsh` |
| Native Bash | macOS / Linux | Official Bash executor, tool `bash` |

Unsupported choices are disabled according to the Host, not the browser OS, and rejected by the Host schema. Leave the WSL distribution blank for the Windows default or enter an installed name such as `Ubuntu`. Zsh must be installed when selected on Linux.

The selection changes the real executor, tool contract and environment instructions. Executors live in a preset-local `shell` realm, independent of the global shell and other presets. Settings register a new preset revision for new sessions. Existing sessions and background jobs retain their revision: create a new session to change environment safely.

WSL source uses Linux/POSIX syntax, while file tools and `workdir` use Windows host paths. Distribution, cwd and source are distinct argv entries passed through `wsl.exe --cd`; no surrounding shell string is assembled. Login-shell configuration in the selected distribution controls Linux PATH and proxy setup. Windows environment variables are not all automatically exported into Linux.

### Sandbox behavior

Native PowerShell and the macOS/Linux shells use Harness sandbox, approval and process management. On Windows, WSL and native Bash require execution already authorized as `danger-full-access`. Choose PowerShell for confined Windows work.

PowerShell, macOS/Linux Bash and Zsh can use a discovered executable. On Windows, native Bash accepts an absolute path to `bash.exe`, such as `<profile>/node_modules/dsh-ops/runtime/win32-x64/niubash/winuxcmd/bin/bash.exe`. If that path is unavailable, new sessions keep the official shell.

## Plugin lab: official creative mode, in memory

Deep PTC is often used for programming, and it can also be used to design a DSH plugin. **Plugin lab is always on for a session**; there is no toggle. An existing `pluginLab` key in the Cordis settings is accepted for compatibility but ignored.

The lab loads the official **creative mode** (创造模式) the same way it loads PTC: from the preset the running host publishes (`agentPresets.readDocument`, preferring the preset named 创造模式, otherwise the shipped id `cordis`). It appends only the rows that creative mode adds beyond the current PTC composition. Module names stay exactly as that document declares them, so an official rename follows the host instead of a name baked into this plugin. Skill directories that the creative preset expresses relative to its own file are resolved against that preset's directory. The desktop already mounts the host runner, so those rows are left to the host and are not copied a second time.

The lab is an environment for designing and trying a plugin in this process: inspect the live composition, define a syntax-checked package, then run it only through the host's existing approval. Packages stay in memory for this process. They do not write the repository, shipped presets, the desktop composition, or this plugin's source. Host approval stays as the host defined it. If the creative preset cannot be read, or a lab tool is missing or fails, the session continues with the official PTC tools.

## dsh-go and other external tools

External plugins are discovered from what they actually register. Tools and workflows are chosen by capability first. Official PTC tools stay available and are the fallback when a third-party tool fails. No external plugin, including dsh-go, is a dependency of this package.

**dsh-go** (the phone app and its screen-control surface) stays usable inside a Deep PTC session:

- Screen-control tools remain in the initial PTC SDK. They are not folded into the on-demand catalog and they are not quarantined after a failure. A tool qualifies when it sets `resident` (or `deepPtc.resident`), when its presentation carries the `dsh-go/view` key, when its name is `intent`, `collect`, `tap_xy`, or starts with `screen_`, or when its provider is marked as dsh-go, screen control, computer use, or phone control. Any other plugin can use the same `resident` flag. Ordinary extensions stay on demand.
- Deep PTC does not declare dsh-go's own slots and does not replace its settings. Those forms still come from the Cordis schema, so the app renders them itself.
- The side card reads its own state first. If a projection is missing or the session belongs to another preset, that part is left out; a failure in the card leaves the conversation, the input row and the screen-control chrome in place.

Phone screen control was not clicked on a device for this release. The guarantee above is the SDK membership, the quarantine rule, and the composer failure path.

## 1.8.0: session-scoped preset identity

External plugins often treat an agent-preset id as a capability switch (dsh-ops recognises only minimal/standard/ptc/cordis). Deep PTC registers `deep-ptc`. 1.8.0 makes two attempts inside the plugin:

- **Layer 1 (native)**: an external plugin that does not limit preset names receives `deep-ptc` and works as-is; a plugin that explicitly declares support for `deep-ptc` also receives the native id.
- **Layer 2 (base)**: a plugin that limits preset names and does not list `deep-ptc` receives `ptc`. For an allowlist that includes `ptc` (dsh-ops), this layer is guaranteed; if the list does not contain `ptc` either, neither attempt matches (such a plugin does not support PTC at all).
- Host calls that must stay exact (subagent child headers, scheduled session creation, the registry itself) always receive `deep-ptc`, so inheritance and scheduling are unaffected.
- A normal PTC session already returns `ptc`; every other preset is returned unchanged. The official PTC preset is not replaced, and DSH is not modified.
- Creative mode and the plugin lab: loading reads the host roster and documents only, never `composedPreset`. A creative row mounted into a Deep PTC session that accepts only `cordis` gets `cordis`; a normal creative session is unchanged.
- Both attempts are decided before returning: the host provides no rejection callback, so the layer inspects the calling plugin's own package to see whether it limits preset names. No limit keeps the native id; a limit falls back immediately. Settings: `presetCompat`, `presetFallback`, `presetSupport`.

Limitation: this wraps the host's `agentPresets.composedPreset` instance and depends on its internal signature, so re-check after a DSH upgrade. The per-package probe is heuristic; dynamically assembled ids may not be recognised.

## Working contract

- Spend the budget on the work: the persona grants an unlimited token budget in this mode, so it does not skip reads, searches, commands or checks to save tokens. Guardrails forbid padding, and compaction, pruning and subagents keep each request inside its finite context window.
- Stay reachable while work runs: no sleeps, busy-polls or long foreground calls. Long commands run as background jobs while the model continues short steps and checks progress without blocking; with nothing left to do it states what is running and ends the turn. Job completion wakes it, and user messages are handled immediately.
- Plan by expected size: five minutes or less, plan internally and act; five to twenty minutes, show the plan and start without approval; more than twenty minutes, show the plan and wait for approval. Re-plan when the estimate moves up a band. Explicit plan mode always wins.
- Ask instead of guessing intent: meaning belongs to the user, facts to the tools. Unfamiliar names, competing targets or routes, authoritative sources, expected process, acceptance criteria and scope are asked about rather than guessed or searched for; inspectable facts are looked up. One to three questions with options, recommended first; the user's answer wins.
- Work visibly: one sentence before each `run_code`, longer updates at milestones, never more than two or three silent tool calls.
- Verify changed behavior and stop when criteria are met; delegate only genuinely independent work and collect results through the actual tool's channel.

A prompt changes the model's working tendency, not the real token limit or billing, and compliance is not guaranteed. The setting that actually controls thinking depth is the model's `reasoningEffort`.

## Install or upgrade

Requires Node `>=24` and DSH `>=0.2.2-rc.1`. The installer rejects the current package on DSH `0.2.1-rc.5` based on its manifest. macOS/Zsh checks cover configuration, argv and tool mounting.

```js
plugin_manager({ action: "install_bundle", target: "dsh-deep-ptc-mode@1.8.5" })
// Or from a local checkout or archive:
plugin_manager({ action: "install_bundle", target: "C:\\path\\to\\dsh-deep-ptc-mode" })
// Or target: "C:\\path\\to\\dsh-deep-ptc-mode-1.8.5.tgz"
```

Repository locator: `github:lishize20040802-rgb/dsh-deep-ptc-mode`. It installs content actually published there; a local upgrade does not publish to GitHub or npm.

Installing the same bundle updates it. Upgrading from the persona-only release requires a Host plugin reload; reopen the app if the settings card has not appeared. Installation does not change the default mode for unrelated new sessions.

Settings persist through the active profile's Cordis patch:

```yaml
- id: deep-ptc-settings
  config:
    environment: auto       # auto | wsl | powershell | zsh | bash
    wslDistribution: ''      # blank uses the Windows default
    shellExecutable: ''      # blank keeps the official lookup
```

An existing `pluginLab` key is accepted but ignored. If the creative preset cannot be read, or the preset enters safe mode, the session keeps the PTC tools only.

Prefer the UI, which uses revisioned, atomic Host form writes.

## Mode isolation

Every runtime feature serves only `deep-ptc` sessions: the tool directory, tool state and execution environment are still mounted by the Deep PTC preset; the skill-card state projection is registered once at the plugin root, but its `init(header)` activates only when `agentPreset === 'deep-ptc'`, so other sessions keep an empty, non-folding state. The command, `agent/pre-step` and client dock each check the preset again. Other modes only see the plugin settings page; the preset-identity layer returns any non-`deep-ptc` exact id unchanged.

## Compatibility and development

Deep PTC is composed at load time from the PTC preset the installed Harness declares (`@deepseek-ai/dsh-web-app/presets/ptc.patch.yml`). Every official row is inherited as-is; Deep PTC replaces only its persona text, swaps the two platform-switched shell tools for one isolated execution group, adds the reachability guard, and wraps the official job and question tools. The wrappers and the execution group never name an official module themselves: they load the module the official row names (and the shell executors the base deployment declares in `@deepseek-ai/dsh-base/cordis.patch.yml`), with the official options. An official PTC change therefore reaches this mode without a plugin release, and a removed or renamed upstream module cannot leave a stale row behind. When the chosen execution environment cannot be mapped onto the official rows, those rows are kept and the change is logged. If the declaration cannot be resolved, read or parsed, the bundled `lib/preset.json` snapshot is used as a fallback and the fallback is logged.

Because the declarations are resolved through the host runtime, every host package the plugin imports statically is declared in `peerDependencies` — including `@deepseek-ai/dsh-web-app`. The host routes those names to the installation for a linked plugin; `npm run check` fails if one is missing, which is what keeps a `link:` installation on the live declaration instead of silently using the fallback snapshot. `compatibility.json` records the upstream release the checked fixture was taken from and its hash; `npm run check` verifies that the bundled fallback still derives the same preset as that fixture and that the inheritance invariants hold. The engines range is an installation floor, not proof that every future release was tested, so run `npm run check:upstream -- <path>` against a new release before trusting it.

```sh
npm ci
npm run check
npm test
npm run check:upstream -- /path/to/the/new/upstream/ptc.patch.yml
npm run sync:snapshot                      # refresh lib/preset.json and lib/base-snapshot.json from the installed declarations
PTC_RUNTIME_MODULES=/path/to/dsh/node_modules node scripts/check-preset.cjs  # loader-level row resolution on a real runtime
PTC_RUNTIME_MODULES=/path/to/dsh/node_modules node scripts/check-reachability.mjs  # interruptible waits on a real runtime
npm pack
```

The checker parses `!!js` as data and asserts the derivation invariants: every official row survives unchanged except the persona, the shell rows and the two wrapped tools (including when the official preset nests them in a group); row ids stay unique; derivation is deterministic across nine platform/environment pairs. Tests cover future compositions as well (unknown rows, reordered rows, removed shell or wrapped rows), plus platforms, argv boundaries, confined WSL refusal, atomic settings writes and stale revisions. Real-task evaluations should measure successful completion, unnecessary questions, scope expansion, background-work collection and latency.

Main files: `cordis.patch.yml` is the settings entry; `lib/index.mjs` manages revisions; `lib/model.mjs` builds isolated execution configurations; `lib/executor.mjs` extends the official bash executor for WSL/Zsh; `lib/terminal.mjs` runs the official shell tool the declaration names, with interruptible waits and the Zsh dialect; `lib/jobs-tool.mjs` and `lib/ask-user.mjs` run the official job and question tools the declaration names; `lib/host.mjs` resolves those official modules through the installed runtime; `lib/guard.mjs`, `lib/rules.mjs`, `lib/sleep-lint.mjs` and `lib/reachable.mjs` implement the pause/polling guard and interruptible waits; `lib/client.js` owns the bilingual settings card; `lib/upstream.mjs` locates and parses the installed PTC declaration; `lib/preset.json` holds the persona and the fallback snapshot used only when that declaration is unavailable.

Uninstall with `plugin_manager` action `remove_bundle`, target `dsh-deep-ptc-mode`. Local link installations depend on their source directory: uninstall before deleting it.

## Author

Deep PTC mode is written and maintained by [lishize20040802-rgb](https://github.com/lishize20040802-rgb).

- Issues and feature requests: [GitHub issues](https://github.com/lishize20040802-rgb/dsh-deep-ptc-mode/issues)
- Email: lishize20040802@gmail.com

Bugs in DeepSeek Harness itself belong upstream, at [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).


Runtime boundaries: pause checks distinguish executable waits from strings, comments and ordinary timer callbacks. Known constants/products are checked; unresolved durations pass through. `wsl -- sleep 20` really pauses and remains refused. Static checks are not a complete language interpreter. Arbitrary run_code, synchronous subprocesses and long workflow waits cannot currently guarantee early steering; use managed jobs for long work. Official tools are never quarantined, including by stale records. Unattributed tools remain available; quarantine requires positive external attribution.

Version 1.7.3 first reads the running host’s public PTC registry, then discovers installed declarations if that API is unavailable, and uses a warned snapshot only as the final fallback. Registry/declaration or plugin-setting changes automatically refresh new preset generations; changed module sources invalidate attribution caches. No pinned DSH version selects the tool inventory, and leased sessions are not forcibly switched.
