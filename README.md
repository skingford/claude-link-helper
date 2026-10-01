# Claude 登录链接助手

一款无需服务端、无需构建即可加载的 Chrome Manifest V3 扩展。在展开的 Claude 登录邮件正文顶部显示 **「复制 Claude 登录链接」**，点击后复制 `Sign in` 按钮实际指向的登录链接。

## 安装

需要 Chrome 119 或更高版本。

1. 下载本项目，或解压 `dist/claude-link-helper-1.0.1.zip`。
2. 打开 `chrome://extensions`，开启右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」。使用源码时选择 **`extension/` 文件夹**；使用 ZIP 时选择解压后含 `manifest.json` 的文件夹。
4. 刷新已经打开的邮箱页面，展开 Claude 登录邮件，点击邮件正文顶部的复制按钮。

其他网页邮箱、企业自定义邮箱域名或未出现助手按钮时：点击 Chrome 工具栏里的插件图标，再点击「检测当前页面」。如果 Chrome 隐藏了插件图标，可在拼图菜单中将其固定。

复制只是写入剪贴板，不会访问链接、触发登录或消耗一次性 token。是否已过期、已使用，需要由 Claude 在实际登录时判断。

更新源码后，在 `chrome://extensions` 中点击本扩展的重新加载按钮，再刷新邮箱页面，使页面使用新脚本。1.0.1 修复了 `#token:base64载荷` 格式被误判、导致复制按钮禁用的问题。

## 邮箱适配

| 邮箱 | 处理方式 |
| --- | --- |
| Gmail | 自动运行，按展开的 `.a3s` 邮件正文分别识别 |
| Outlook / Microsoft 365 | 自动运行，正文容器、iframe，支持 Safe Links 本地解包 |
| Proton Mail | 自动运行，正文容器、iframe 和开放的 Shadow DOM |
| Tuta / Tutanota / Tutamail | 在 Tuta 网页客户端域名自动运行，正文及开放的 Shadow DOM |
| Zoho Mail | 自动运行，涵盖主要地区域名及正文容器 |
| Yahoo、Fastmail、QQ、网易 163 / 126 | 自动运行，正文适配及通用检测 |
| 企业自定义域名、其他网页邮箱 | 点击插件的「检测当前页面」，只授予当前页面临时访问权限 |

这些是**已实现的适配策略，不是所有生产邮箱版本的兼容性认证**。当前已验证合成 DOM 页面和 Chromium 浏览器交互，未使用真实邮箱账户逐站回归。邮箱改版、跨域受限 iframe、关闭的 Shadow DOM、纯图片按钮缺少可访问名称等情况，可能无法检测；插件会提示未找到或无法验证，不猜测登录地址。

## 识别与防误复制

- 识别 `Sign in`、`Sign in with Claude.ai`、`Log in`、`登录` 等按钮文案，包括图片的 `alt` 与 `aria-label`。
- 只接受 **HTTPS、精确域名 `claude.ai`、认可的登录路径与 token 结构**。拒绝伪装域名、用户名伪装、HTTP、任意子域名、非默认端口和普通首页。
- 支持 `/magic-link` 的独立 token 和 `#token:base64载荷` 片段格式，以及带 token / ticket / code 等凭证参数的 `/login`、`/auth/verify`、`/auth/callback`。原样复制片段，不解码或改写凭据。路径或邮件模板改变时需更新规则。
- 本地解包 Microsoft Safe Links 和 Google `/url` 包装，最多四层。不请求短链服务，不访问任何跳转地址。未知追踪链接保留「无法验证」状态。
- 同一邮件中完全相同的目标链接去重；不同 token 或参数均视为不同链接，显示数量并禁用复制。
- 同时存在可验证和不可验证的 `Sign in` 链接时也禁用复制，不擅自选择其中一个。
- 隐藏邮件、编辑器草稿不参与检测；引用的旧邮件链接不参与当前邮件选择，界面会标注已忽略引用。仅引用中有链接时禁用复制。
- 已识别的每封邮件有独立按钮；无法确定邮件边界时，将该文档内的候选链接合并校验，遇到多个即停止复制。
- 点击复制前重新扫描；邮件或链接已变化时要求再次确认点击。支持单页应用切换邮件和异步加载正文。
- 没有链接、多个链接、无法验证、仅有引用、页面过大、复制失败都有明确提示。

域名校验不等于发件人认证。助手不判断 SPF/DKIM，也不对邮件来源作认证。

## 本地处理与权限

运行时代码不含网络请求、统计、日志上报或远程依赖；邮件和链接只在当前页面的内存中处理。不持久化邮件或链接，不使用 `storage`、Cookie、邮箱 API 或后台服务。

| 权限 | 用途 |
| --- | --- |
| 声明的邮箱站点 content scripts | 邮件展开时自动显示助手，不申请全网站常驻访问权限 |
| `activeTab` | 用户通过插件按钮临时检测其他网页邮箱 |
| `scripting` | 将本地检测脚本注入用户选择的当前页面 |
| `clipboardWrite` | 仅在用户点击复制时写入链接，不申请剪贴板读取权限 |

UI 使用 Shadow DOM 隔离，状态中只展示域名和数量，不展示完整 token。插件弹窗只接收计数，链接不通过扩展消息传播。复制后链接属于系统剪贴板，系统剪贴板同步或历史功能由用户的操作系统控制。

## 开发与验证

运行扩展不需要 Node.js；Node.js 20+ 只用于开发测试。`jsdom` 是开发依赖，不进入扩展安装包。

```sh
npm ci
npm test
npm run check
npm run package
```

`npm run package` 在 `dist/` 生成 ZIP（需要系统 `zip` 命令），只包含 `extension/` 下运行所需的文件，不打包测试、依赖和邮件样本。

本地交互测试：

```sh
npm run demo
# 打开 http://127.0.0.1:4173
```

所有测试 token 均为 `TEST_ONLY` 虚构值。测试页可切换唯一链接、多链接、无链接、伪装域名、Safe Links、引用旧链接、Shadow DOM 与 iframe。该测试页主动加载相同的运行时代码；验证实际扩展的手动注入时使用 `http://127.0.0.1:4173/?bare=1`，再点击已安装插件的「检测当前页面」。

- `extension/core.js`：纯函数 URL 与按钮校验，离线解包、去重和歧义决策。
- `extension/dom.js`：邮箱正文定位、可见性、引用排除、Shadow DOM 遍历。
- `extension/content.js`：页面监听、邮件旁 UI、点击时重验和复制。
- `extension/popup.*`：操作说明、手动检测和权限错误提示。
- `tests/`：URL 安全边界、各邮箱结构、状态切换和弹窗测试；[验收说明](docs/TESTING.md)。

技术参考：[Chrome 内容脚本与关联 frame](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[activeTab 临时权限](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)、[脚本注入 API](https://developer.chrome.com/docs/extensions/reference/api/scripting)、[Claude 邮件登录说明](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account)。

这是独立开发的辅助扩展，与 Anthropic 无隶属关系。
