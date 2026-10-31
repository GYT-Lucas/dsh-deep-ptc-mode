# 深度 PTC 模式

[English](README.md) · MIT · 当前版本：**1.4.0**

DeepSeek Harness 的协作型 PTC preset：不为 token 省力、任务运行中随时可插话、按任务长短计划、意图不清先问，并可自由选择执行环境。

## 选择 WSL、PowerShell 或 macOS 工具

安装并加载后，打开 **设置 → 插件 → 深度 PTC**，选择执行环境并保存，再新建一个「深度PTC模式」会话。

| 选项 | 宿主 | 实际执行方式 / 模型工具 |
| --- | --- | --- |
| 自动 | Windows / macOS / Linux | Windows 选 PowerShell，macOS 选 Zsh，Linux 选 Bash |
| WSL Bash | Windows | `wsl.exe ... --exec bash -lc`，工具名 `bash` |
| PowerShell | Windows | Harness 官方原生 PowerShell 执行器，工具名 `pwsh` |
| Zsh | macOS / Linux | macOS 用 `/bin/zsh -lc`；Linux 用已安装的 `zsh`；工具名 `zsh` |
| 原生 Bash | macOS / Linux | Harness 官方 Bash 执行器，工具名 `bash` |

不适用于宿主的选项会禁用，运行时配置也会拒绝这些选择。WSL 发行版留空时使用 Windows 默认发行版，也可填写 `Ubuntu` 等已安装名称。Linux 上选择 Zsh 前需要安装 Zsh。

**选择会改变实际执行器和模型看到的命令语法，不只改工具名称。** 执行器隔离在本 preset 中，不修改全局 shell，也不影响其他 preset。保存设置后，新会话使用新版本；已有会话和后台任务继续使用创建时的环境。切换环境时请新建会话，避免同一任务中途换方言。

WSL 命令使用 Linux/POSIX 语法；文件工具和 `workdir` 仍用 Windows 宿主路径。执行器用 `--cd` 进入目录，发行版、目录和命令分别作为 argv 传递，不额外拼接 shell 字符串。WSL 内的 PATH、代理等由所选发行版的登录 shell 配置决定，Windows 环境变量不会全部自动变成 Linux 环境变量。

### 沙箱边界

原生 PowerShell、Bash 和 Zsh 继续使用 Harness 的沙箱、审批和进程管理。WSL 跨越 Windows/Linux 边界，目前仅支持宿主已经授权的 `danger-full-access` 执行；`read-only` 或 `workspace-write` 调用在启动命令前失败。插件不会自行升权、改变默认权限或悄悄换 shell。

## 工作规则

- **不为 token 省力：** 人设写明在深度求索工作、本模式 token 预算无限，按问题需要而不是成本决定读取、搜索、命令和验证的深度；同时禁止注水和啰嗦，单次上下文仍有限，靠压缩、裁剪和子代理控制。
- **任务运行中随时可插话：** 不 sleep、不轮询、不挂长时间前台调用。构建、测试、安装、服务器等耗时命令放后台 job，期间继续做短步骤，用不阻塞的方式查看进度；没事可做就一句话说明在跑什么并结束回合，job 完成会自动唤醒模型，你的消息会被立即处理。
- **按任务长短计划：** ≤5 分钟内部计划直接做，不单独告知；5–20 分钟展示计划后立即执行，不等审批；>20 分钟展示计划并等你批准再改动。估计升档时重新说明计划；显式 plan mode 的规则优先。
- **意图不清先问：** 意思归用户，事实归工具。不认识的名称、多个可能目标、技术路线、权威来源、做事方式、验收标准和范围不确定时先问，不用搜索去猜你的术语；文件位置、当前行为、版本等可检查的事实自己查。每次 1–3 个带选项的问题，推荐项在前；你的回答优先于模型推断。
- **进度可见：** 每次 `run_code` 前一句话说明要做什么，里程碑稍长汇报，连续两三个工具调用必须出声。
- **充分验证并停止，按需委派：** 验证改动触及的行为和边界，满足验收标准后交付；只在任务确实可拆分或需要独立复核时委派，按实际工具渠道收集结果。

提示词能改变模型的工作倾向，但不改变实际的 token 上限或计费，也不保证模型每次完全遵守。真正影响思考深度的设置是模型的 `reasoningEffort`。

## 安装和升级

要求 Node `>=24`、DSH `>=0.2.1-rc.5`。1.3.0 已用 Windows 桌面端 rc.5 做 WSL/PowerShell 命令验证。macOS/Zsh 分支做了配置、工具挂载与参数测试，尚未在 macOS 真机执行。

本地目录或构建产物可通过插件管理器安装：

```js
plugin_manager({ action: "install_bundle", target: "dsh-deep-ptc-mode@1.4.0" })
// 也可从本地目录或安装包安装：
plugin_manager({ action: "install_bundle", target: "C:\\path\\to\\dsh-deep-ptc-mode" })
// 或 target: "C:\\path\\to\\dsh-deep-ptc-mode-1.4.0.tgz"
```

GitHub 地址：`github:lishize20040802-rgb/dsh-deep-ptc-mode`。该地址安装远端实际内容；本地升级不会自动发布到 GitHub/npm。

已有旧版时，安装同一个 bundle 即更新。从只有 persona 的旧版切到 1.3.0，需要宿主重新加载插件；桌面端若未出现设置卡片，可重新打开应用。安装不会将其他新任务的默认模式改为深度 PTC。

设置持久化到当前 profile 的 Cordis patch：

```yaml
- id: deep-ptc-settings
  config:
    environment: wsl        # auto | wsl | powershell | zsh | bash
    wslDistribution: Ubuntu # 留空为 Windows 默认发行版
```

优先使用界面保存，宿主会处理版本冲突和原子配置写入。

## 兼容性与维护

1.3.0 将上游 rc.5 的 23 项 PTC 配置保存为 `lib/preset.json`。除 persona 外，模板与该上游一致；运行时仅将两个互斥 shell 工具替换为一个带 `shell` 隔离的执行组。计划模式、压缩、裁剪、网页与子代理等其他配置保持一致。

本版增加了必要的宿主/浏览器代码，不再是仅靠 persona 的声明式插件。`compatibility.json` 记录已验证上游和 fixture 哈希；`engines` 是安装下限，不能证明之后所有宿主都经过测试。

```sh
npm ci
npm run check
npm test
npm run check:upstream -- /path/to/ptc.patch.yml
npm pack
```

检查器不会执行 YAML 的 `!!js`；比较官方插件结构、plan mode 和压缩等嵌套配置，发现差异即失败并要求复核。测试覆盖平台选择、命令边界、受限 WSL 拒绝、设置表单原子保存及并发版本约束，以及 preset 版本更换与清理。真实任务评测仍应记录成功率、无必要提问、范围控制、后台收尾和耗时。

## 文件和卸载

- `cordis.patch.yml`：宿主设置入口。
- `lib/index.mjs`：配置 schema、preset 注册和版本切换。
- `lib/model.mjs`：平台选择、参数、隔离配置和环境说明。
- `lib/executor.mjs`：复用官方进程/沙箱语义的 WSL/Zsh 执行器。
- `lib/terminal.mjs`：复用官方终端工具，提供 Zsh 方言与工具名。
- `lib/client.js`：中英文设置卡片。
- `lib/preset.json`：persona 和上游 PTC 模板。
- `test/`、`scripts/check.mjs`、`compatibility.json`：回归与上游差异检查。

卸载使用插件管理器的 `remove_bundle`，目标为 `dsh-deep-ptc-mode`。本地 link 安装直接依赖源目录，应先卸载再删除目录。

## 作者

深度PTC模式由 [lishize20040802-rgb](https://github.com/lishize20040802-rgb) 编写与维护。

- 问题与需求：[GitHub Issues](https://github.com/lishize20040802-rgb/dsh-deep-ptc-mode/issues)
- 邮箱：lishize20040802@gmail.com

上游 DeepSeek Harness 本身的问题请提到 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。
