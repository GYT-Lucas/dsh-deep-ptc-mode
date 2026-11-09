# Changelog

## 1.8.6 — 2026-11-09

- 运行中的输入框泛蓝光：对话运行时输入框边框转蓝并持续呼吸发光。1.8.5 已移植这段动效，但发送后输入框处于聚焦状态，聚焦样式的 `!important` 阴影压过了动画，所以看不到；现在聚焦样式只在空闲时生效。
- 侧边卡片改为白底蓝点缀：底色与宿主一致（暗色主题跟随宿主深色），分割线与边框为浅灰色，只有选中的执行环境、按钮描边和子代理状态小方块用蓝色；文字与其他地方一样用宿主的黑色与灰色。
- 侧边卡片停靠时不再是悬浮卡片，而是从对话区右侧分出的一栏：贴住右边缘、上下通高，只留左侧分隔线；对话区让出这一栏的宽度，滚动条不会被遮住。窄屏收起的小胶囊点开后仍是悬浮卡片。
- 运行中的子代理只有行首的状态小方块闪烁蓝光，整行不发光；收起成小胶囊时也一样。系统开启“减少动态效果”时停止闪烁。
- 修复：子代理的运行状态改为同时参考会话列表里的实时状态。父会话的子代理目录只在打开官方下拉框时刷新，之前正在运行的子代理会显示为“空闲”。
- 官方声明的升级检测不再每 5 秒读一次：只在设置变更时，以及每个深度PTC对话创建或恢复、宿主确定预设之前确认一次；声明有变化时先重新派生，新对话直接用上最新预设。确认最多等 5 秒，出错或超时都照常继续。
- 预设身份兼容层的诊断改写到宿主日志，不再写入固定的本机路径（此前 1.8.0–1.8.5 的包里带有一个写死的 Windows 用户目录）。
- 工具启动自己的程序失败（`spawn … ENOENT`，无论是否带错误码）判为不可用；外部工具执行的命令不存在（command not found / not recognized）算一次普通失败，连续三次才隔离，不再当作输入错误。
- 与 refined ui 一致，子代理运行期间也算对话在运行：主代理交出这一轮后，输入框仍保持蓝光和冒泡，直到子代理结束。
- 输入框上方冒出的光点更多、稍大：频率翻倍，半径略增，样式不变。

- The composer glows blue while the conversation runs. 1.8.5 carried the animation, but the composer keeps focus after sending and the focus style's `!important` shadow beat the animation; the focus style now applies only when idle.
- The side card is white with blue accents: the host's own background (dark themes follow the host), light grey dividers and borders, and blue only on the selected environment, button outlines and the subagent status squares; text keeps the host's black and grey as elsewhere.
- Docked, the side card is no longer a floating card but a column split off the right of the conversation: flush with the edge, full height, with only a left divider. The conversation gives up that width, so its scrollbar stays visible. Opened from the narrow-window pill it is still a floating card.
- For a running subagent only the small status square flashes blue; the row itself does not glow, and the folded pill behaves the same. Reduced motion stops the flashing.
- Fix: a subagent's running state also follows the live session list. The parent's subagent catalog refreshes only when the official dropdown opens, so a running subagent used to show as idle.
- The upstream-declaration check no longer reads every 5 seconds: it runs when settings change and once before each Deep PTC conversation is created or resumed, right before the host resolves its preset; a changed declaration is re-derived first, so the new conversation gets the fresh preset. The check waits at most 5 seconds and never blocks on an error.
- The preset identity layer logs through the host logger instead of a fixed path on one machine (1.8.0–1.8.5 shipped a hard-coded Windows user directory).
- A tool that cannot start its own program (`spawn … ENOENT`, with or without the code) is unavailable; a command an external tool ran that is not installed (command not found / not recognized) is an ordinary failure, quarantined only after three in a row, instead of wrong input.
- As in dsh-refined-ui, a running subagent keeps the conversation working: after the main agent hands off its turn, the composer keeps its glow and bubbles until the subagent finishes.
- More, slightly larger sparks rise from the composer: twice as often and a little bigger, in the same style.

## 1.8.5 — 2026-11-09

- 插件实验台改为**始终开启**，移除设置开关：新建深度 PTC 会话会读取宿主创造模式并加载相对 PTC 的差量行。
- 旧 profile 中的 `pluginLab` 键仅为兼容保留，值会被忽略；创造模式读不到或进入安全模式时，会话仍只使用 PTC 工具。
- 设置页不再显示插件实验台选项；其余执行环境与工具设置不变。
- persona 删去“在 DeepSeek / 深度求索工作”的公司身份表述，改为“你拥有 unlimited token”；预算与反注水规则不变。
- 新增 Skill 上下文卡片：每轮结束只列当前仍加载、未关闭的 Skill，提供逐项滑动开关与“全部保留 / 全部关闭”；下一条消息发送时固定，关闭项在下轮前从模型上下文移除，历史仍完整保留。卡片同时识别官方 `skill` 工具与 `run_code` 内 PTC 子调用加载的 Skill。状态投影在插件根部注册并按会话 header 激活，升级后已有 Deep PTC 会话也能恢复卡片。

- Make the plugin lab **always on** and remove the settings toggle: a new Deep PTC session reads the host creative preset and appends only the rows it adds.
- Keep the legacy `pluginLab` key accepted but ignored; if the creative preset cannot be read or the preset enters safe mode, the session keeps the PTC tools only.
- No plugin-lab option is shown in settings; execution-environment and tool settings are unchanged.
- Remove the “works at DeepSeek” company identity from the persona and state “you have an unlimited token budget” instead; the budget and anti-padding rules are unchanged.
- Add the skill context card: after each turn it lists only the skills still loaded and not closed, with per-skill switches and Keep all / Close all. The choice is fixed when the next message is sent; closed skills leave the model context before the next turn while the durable history stays complete. It recognises both direct `skill` tool results and skills loaded by a PTC inner call inside `run_code`. The state is registered at the plugin root and activated by the session header, so existing Deep PTC sessions recover it after an upgrade.
- Keep every runtime feature inside the `deep-ptc` preset/session: other modes only see the plugin settings page; the client dock returns null before reading Deep PTC projections or mounting controls.
- 重做 Skill 卡片并移到对话区：挂在最新一轮末尾（官方计划卡片所在的 `conversation.chat.turnTail`），不再塞在输入框下方挤占状态栏；按宿主设计变量重绘卡片、按钮与开关，提示将被移除的数量，超过 4 个折叠。
- 并入 dsh-refined-ui 的界面精修（换肤、输入框与发送键、气泡、侧栏、Ctrl+K、追光、涟漪、磁吸、快捷键、动效、诊断），只在当前显示深度PTC会话时生效；检测到独立的 refined ui 仍在运行时不重复绘制。
- 切换 Skill 开关不再在对话里显示 `deep-ptc-skill-state` 命令回显：为该命令登记官方 `conversation.chat.commandview` 渲染器，成功时不显示，失败时原位显示错误；会话日志照常记录。
- 不并入 refined ui 的任务星图浮窗，改为对话区右侧的子代理面板：按官方子代理目录与计时数据显示状态、用时与 token，点击在官方右侧栏打开子代理对话；窄屏收成胶囊。
- Rebuild the skill card in the conversation: it sits at the end of the latest turn (`conversation.chat.turnTail`, where official plan cards appear) instead of under the composer, uses the host design tokens, counts the skills about to leave, and folds after four rows.
- Merge the dsh-refined-ui look and interactions, active only while a Deep PTC conversation is on screen; the standalone plugin is not drawn twice.
- Skill switches no longer leave a `deep-ptc-skill-state` command row in the conversation: the plugin registers an official `conversation.chat.commandview` renderer that shows nothing on success and the error on failure; the session log still records the command.
- 侧边卡片收纳执行环境切换（写同一份宿主设置，对新建会话生效）、子代理列表和“重载所有工具状态”；输入框下方不再放任何深度PTC控件。
- 修复：工具状态与重载命令原先注册在预设内部，会话闲置时客户端读不到状态、命令也不被受理，重载按钮因此一直不显示或点了无效。现改为与 Skill 卡片一样在插件根部注册，预设层复用这份状态；根部不可用时预设层退回自行注册。
- The side card holds the execution-environment switch (the same host settings, for new sessions), the subagent list and “Reload all tool states”; nothing from Deep PTC sits under the composer any more.
- Fix: the tool state and the reset command were registered inside the preset, so an idle conversation could neither read the state nor accept the command, and the reload button stayed hidden or did nothing. They are now registered at the plugin root like the skill card, and the preset layer reuses that state, falling back to its own registration when the root one is unavailable.
- Replace refined ui's floating task windows with a subagent panel beside the conversation, fed by the official subagent catalog and timing data; a row opens the official subagent chat in the right sidebar.

## 1.8.2 — 2026-11-07

- 修正 npm 元数据：描述控制在 registry 的 255 字符以内，避免被截断；仅描述变更，不改变行为。

- Keep the npm description within the registry's 255-character limit so it is not truncated. Description only; no behavior change.
## 1.8.1 — 2026-11-07

- 重写简介与 README：以“五个基本问题”为主线，再梳理“一切皆插件”的六项能力（动态预设/工具读取、创造模式、dsh-go 界面控制、多环境、外部插件工具/工作流适配、Skill 与工具读取）。
- 更新 npm 描述与 GitHub About；不承诺适配所有第三方插件，dsh-ops 为已专门测试的场景，其他插件走同一接口。
- 仅简介与文档变更，不改变运行时行为。

- Rewrite the introduction and README around the five basic problems, followed by the six “everything is a plugin” capabilities (dynamic preset/tool loading, creative mode, dsh-go screen control, multi-shell support, external tool/workflow adaptation, and leaner skill/tool loading).
- Update the npm description and GitHub About. No promise to fit every third-party plugin: dsh-ops is the specifically tested case and other plugins use the same interface.
- Documentation and description only; no runtime behavior change.

## 1.8.0 — 2026-11-07

- 会话级 preset 身份兼容，两次尝试：不限制预设名称的外部插件拿原生 `deep-ptc`（第一层，直接可用）；限制预设名称、列表里没有 `deep-ptc` 的插件拿基座 `ptc`（第二层，对包含 `ptc` 的列表必定通过）。显式支持 `deep-ptc` 的插件也拿原生。宿主内部（子代理 header、定时任务、注册表自身）保持精确 id，不影响继承与调度。
- 兼容层在插件本体内实现（`lib/preset-compat.mjs`），随插件启动安装：不需要改 DSH，也不需要给外部插件写逐插件配置。判定先看调用方插件是否限制预设名称：不限制就返回原生，限制就立即返回基座。宿主没有拒绝回调，因此两次尝试在返回前按调用方决定，不做运行时重试。
- 普通 PTC 与其他预设原样返回；官方 PTC 预设没有被替换。新增设置：`presetCompat`（默认开）、`presetFallback`（默认 `ptc`）、`presetSupport`（按包名覆盖 `native` / `base`）。
- 修复调用方识别：跳过 Cordis 服务代理插入的 `Object.apply` 帧，否则真实插件会被当成宿主、dsh-ops 门控被误关。
- 创造模式/插件实验台安全：加载只读 `agentPresets.list/readDocument`，不调用 `composedPreset`（测试保证）；实验台挂入深 PTC 会话的创造模式行若只认 `cordis`，第二层返回 `cordis`，认 `ptc` 的仍返回 `ptc`；普通创造模式会话（`cordis`）原样不变。

- Session-scoped preset identity compatibility as two attempts: an external plugin that does not limit preset names receives the native `deep-ptc` (layer 1, usable as-is); a plugin that limits preset names and does not list `deep-ptc` receives the base `ptc` (layer 2, guaranteed for an allowlist that includes `ptc`). A plugin that explicitly supports `deep-ptc` also receives the native id. Host internals (subagent child headers, scheduled session creation, the registry itself) keep the exact id, so inheritance and scheduling are unaffected.
- Implemented inside the plugin (`lib/preset-compat.mjs`) and installed at plugin startup: no DSH change and no per-plugin configuration. The decision first checks whether the calling plugin limits preset names: no limit keeps the native id; a limit falls back immediately. The host offers no rejection callback, so both attempts are decided per caller before returning, with no runtime retry.
- Normal PTC and other presets are returned unchanged; the official PTC preset is not replaced. New settings: `presetCompat` (on by default), `presetFallback` (default `ptc`), `presetSupport` (per-package `native` / `base` override).
- Caller detection now skips the `Object.apply` frame inserted by the Cordis service proxy; before this, a real plugin looked like the host and dsh-ops stayed inert.
- Creative mode and the plugin lab stay safe: loading reads `agentPresets.list/readDocument` only and never calls `composedPreset` (covered by a test). A creative row mounted into a Deep PTC session that accepts only `cordis` receives `cordis`; one that accepts `ptc` still receives `ptc`. A normal creative session (preset `cordis`) is unchanged.

## 1.7.4 — 2026-11-07

- 支持当前桌面端 DSH RC `>=0.2.2-rc.1`。只声明支持 RC，不支持 alpha。
- PowerShell、Bash、Zsh 可以选择本机已发现的可执行文件。未选择或文件消失时仍走官方自动查找。WSL 仍只选择发行版。PowerShell 写入官方执行器的 `pwshPath`；Bash 和 Zsh 只替换启动参数，沙箱与批准仍用官方执行器。
- 新增插件实验台，默认关闭。打开后按读取 PTC 的同一方式，动态读取宿主正在发布的官方创造模式，只追加相对 PTC 多出来的行，模块名以该预设原文为准。实验在内存中检查、定义并经宿主批准后运行，不写仓库、已发布预设、桌面组合或本插件源码。预设读不到时继续使用官方 PTC 工具。
- 适配 dsh-go 的屏幕控制：这类工具留在初始 SDK，失败不隔离。识别依据是工具自己的常驻标记、`dsh-go/view`、屏幕控制工具名，或提供者标记，不把 dsh-go 写成依赖，也不占用它的槽位和设置表单。其他外部工具仍是能力优先、官方兜底，普通扩展按需加载。
- 工具状态按钮在界面投影失败时留空，输入区和屏幕控制界面保持原位。

- Declare support for the installed desktop DSH release candidate, `>=0.2.2-rc.1`. Alpha builds are not supported.
- PowerShell, Bash and Zsh can use a discovered executable. An empty or missing choice keeps the official lookup. WSL still selects a distribution only. PowerShell writes the official `pwshPath`; Bash and Zsh change argv only, and sandbox plus approval stay on the official executor.
- Add plugin lab, off by default. When on, load the official creative mode the same way PTC is loaded and append only the extra rows, using the module names in that document. Lab packages stay in memory: inspect, define, then run through host approval. They do not write the repository, shipped presets, the desktop composition, or this plugin. If that preset cannot be read, official PTC tools remain.
- Adapt dsh-go screen control: those tools stay in the initial SDK and are not quarantined. Recognition uses the tool's own resident flag, `dsh-go/view`, screen-control names, or the provider mark. dsh-go is not a dependency, and its slots and settings forms stay its own. Other external tools stay capability-first, with official tools as the fallback. Ordinary extensions stay on demand.
- The tool-state control renders nothing when the composer projection fails, leaving the input row and the screen-control chrome in place.

## 1.7.3 — 2026-11-05

- 优先读取运行宿主的官方预设注册表并自动检测更新；修复官方工具误隔离、暂停误判和桌面重载按钮的依赖/返回值处理。保留后台运行与插话。

- Protect official tools from stale quarantine across guard, search, SDK, loading and reporting. Keep unattributed tools available; only positively attributed external providers can be quarantined.
- Prefer the running host’s public PTC registry and detect PTC/base declaration changes automatically without a pinned inventory. Invalidate changed module-source caches; avoid rebuilding on unrelated settings events.
- Integrate 125 pause adversarial cases, align language-aware expectations, defer oversized schemas to the full host SDK, tolerate missing optional output metadata, distinguish missing executables, and dispose partially mounted adapters before official fallback.
- Fix the composer reset action: inject the remote namespace explicitly and unwrap the gateway `{ ok, value }` response before checking the command result. Verified by clicking the actual desktop button.


- Keep every official row exactly as declared. Only the persona, shell, job and question rows differ; the `official-tools` wrapper is gone. The host's compatibility preflight, composition diagnostics and plugin inventory again see the official modules.
- Attribute tools from the installed source of the composed rows, without running it: official tools are recognised wherever they are composed, and a failed third-party tool is reported under its own plugin.
- Fail open: a failure in the quarantine, catalog, recovery-context or reachability hooks leaves tool calls and prompts as the host would have them. Previously a throwing guard failed every tool.
- If a wrapped official plugin fails with Deep PTC behaviour or rejects Deep PTC's options, run it as declared. If the preset still cannot mount, fall back to safe mode: the official composition with the Deep PTC persona. A malformed `toolPreferences` is ignored with a warning.
- Add `scripts/check-parity.mjs`: official PTC and Deep PTC on a real host composition, compared tool by tool, with third-party plugins that know nothing about Deep PTC.
- Read tool error codes from `error.info.code`, where the host reports them. Every code-based decision was silently skipped before, so one invalid-arguments call quarantined a working tool.
- Quarantine only a capability that is clearly unavailable, or that fails three times in a row with temporary or unexplained errors; a success clears the count. Wrong input, a failed build reported in a normal result, and names no plugin provides no longer quarantine anything. The persona allows correcting input and retrying temporary failures twice.
- Recognise official tools outside the PTC preset (the profile root composition, such as `lsp`, `terminal_*` and `session_*`) by reading the names their installed packages declare, without running them. Those tools stay in the SDK and are never quarantined. Shell rows kept by the environment fallback are official too.
- Run tool discovery and quarantine in a child fiber: a missing session module, service or API turns that layer off with a log line instead of rejecting the preset mount.

## 1.7.2 — 2026-11-05

- Add local tool/skill discovery and complete-schema loading with bounded pages, byte budgets and recent selections. Reuse the installed official PTC SDK renderer, reducing only its untouched generated section. Skill discovery reads metadata and invocation controls; the official loader owns skill bodies.
- Quarantine failed external tools in durable conversation state. Block subsequent calls until the user resets; no automatic probing, retries or root-cause analysis. Capture provenance/reset generation before dispatch; keep cancellation, permission decisions and normal pagination intact.
- Add a bilingual Reload all tool states button below the composer and a user-only host command. Preserve running jobs. Project failed tool/provider lists at turn completion and request concise final-task reporting.
- Identify baseline registrations from the inherited composition rather than package naming patterns; support class-style official plugins while retaining their metadata.
- Preserve the original execution, reachability, question, planning and shell policies. Add regression coverage for quarantine persistence, reset races, SDK disclosure, skill metadata and UI actions.

## 1.7.1 — 2026-11-05

- Publish the plugin-cooperation release with bilingual README introductions and package/repository descriptions: external capabilities first, multiple providers working together, and the current official PTC composition as fallback, following the “everything is a plugin” composition model. Preserve the original interruptible background-work behavior and document integration boundaries.
- Set the DSH engine and DSH peer-package minimum to `>=0.2.2-rc.1`, matching the currently installed runtime, with no upper bound. Synchronize the lockfile and install documentation.
- Clarify that official fallback capabilities still derive from the installed PTC declaration at load/rebuild time, following the 1.6.1 mechanism; snapshots remain a logged fallback. No tool-selection, reachability, execution or planning code changes.

## 1.7.0 — 2026-11-05

- Add two-layer task-level tool cooperation: search and prefer an available extension capability for the function, then use an admitted inherited official PTC capability if no enhancement fits or a provider fails. No new capability, alias, argument translation, result conversion or silent replay is registered.
- Observe final host results and publish bounded, agent-local recovery context. Preserve denials, cancellation, code-less pre-dispatch guard failures, partial effects and active background jobs; retain original tool schemas, output contracts, conditions and execution ownership. Successful calls and provider replacement clear stale failure evidence.
- Tag official capability registrations by provenance while loading their actual upstream modules/config. Keep activation options (`when`) and exact registration disposers when adapting the tool registry. Official web search/fetch remain official and retain provider-readiness gating.
- Add optional `toolCompatibility` (default true) and `toolPreferences` settings. Explicit preferences describe choices between existing tools, not a dispatch mapping. Hidden/removed fallbacks and a replaced/unloaded whole executor are not bypassed.
- Keep persona, task planning, WSL/PowerShell/Zsh/Bash selection, foreground cap, steering, managed jobs, completion wakeups and timed questions unchanged. Add offline unit coverage and an actual-host compatibility harness; run the existing reachability integration with the compatibility observer enabled.

## 1.6.1 — 2026-11-04

- Follow the official modules instead of naming them. The shell, job and question wrappers no longer import `@deepseek-ai/dsh-tool-bash`, `dsh-tool-pwsh`, `dsh-tool-jobs` or `dsh-tool-ask-user`: each derived row carries the module name and options of the official row it replaces (`upstream`, `options`), and the wrapper loads that module through the installed runtime's module graph with the official plugin's own `inject` and `Config`. A renamed or replaced official tool is followed rather than breaking the mount.
- Read the shell executors from the base deployment declaration (`@deepseek-ai/dsh-base/cordis.patch.yml`, rows `bash-sandbox` and `pwsh-sandbox`), including their official options; only the foreground cap is added. The WSL/Zsh executor extends the official bash executor class named there instead of importing `dsh-bash-local`/`dsh-bash-sandbox`.
- Fall back to the official shell rows when the chosen environment cannot be mapped: no official shell tool row, no declared executor, or an official bash executor whose API WSL/Zsh can no longer extend (probed before the preset is published). The reachability guard still applies; the preset never publishes rows that cannot mount.
- Keep `lib/base-snapshot.json` as the executor fallback beside `lib/preset.json`; `npm run sync:snapshot` regenerates both. Drop the official tool and executor packages from `peerDependencies` and add `@deepseek-ai/dsh-base`.
- `scripts/check-preset.cjs` also resolves the official modules the wrappers name. The runtime checks (`check-reachability.mjs`, `check-host.cjs`) now also run on `0.2.2-rc.1`, whose tool batches go through a selected executor and whose preset registry requires the agent registry.

## 1.6.0 — 2026-11-04

- Derive the preset from the PTC preset the installed Harness declares (`@deepseek-ai/dsh-web-app/presets/ptc.patch.yml`) instead of freezing a copy. Official rows, settings and additions are inherited; Deep PTC still replaces only its persona, execution environment, reachability guard, and the official job/question wrappers.
- Fix the failure after the DSH `0.2.2-rc.1` update: the frozen 1.5.0 snapshot still named the `@deepseek-ai/dsh-tool-subagent-control/list-agents` subpath, which `0.2.2-rc.1` removed, so the preset could not mount and existing Deep PTC sessions were reported as unusable. Sessions were never migrated or rewritten; they open again once the preset mounts.
- Keep `lib/preset.json` only as a fallback snapshot and refresh it to `0.2.2-rc.1`; `npm run sync:snapshot` regenerates it from the installed declaration.
- Declare every imported host package in `peerDependencies`, including `@deepseek-ai/dsh-web-app`: the host only routes a linked plugin's bare specifier to the installation when the name is peer-declared, so without it a `link:` install silently fell back to the snapshot. `npm run check` now fails if a peer is missing.
- Match official rows recursively (persona, shell/executor rows, job and question rows may move into a group) and accept only a declaration whose id is `ptc`. Tests cover nested groups, a non-PTC declaration, and the peer-declaration guard.
- `compatibility.json` now records the checked upstream release plus fixture hash; `scripts/check.mjs` verifies inheritance invariants and fallback/dedaration parity instead of exact-snapshot equality.
- Add derivation tests for future compositions (unknown rows, reordering, missing shell or wrapped rows) and `scripts/check-preset.cjs`, a live-runtime check that every derived row resolves through the installed module graph.

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
