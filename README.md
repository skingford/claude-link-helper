# Claude Link Helper

**English** | [简体中文](README.zh-CN.md)

A Chrome Manifest V3 extension that copies the link behind the **Sign in** button in a Claude login email. It adds a copy button above the expanded message body and runs entirely on your device, with no server or build step required.

The extension name and browser description are in English. Action labels and status messages are currently in Simplified Chinese.

## Installation

Requires Chrome 119 or later.

1. Download or clone this repository. If you have a packaged ZIP, extract it first.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked**. For the source repository, select the **`extension/` directory**. For a packaged ZIP, select the extracted directory containing `manifest.json`.
4. Refresh any open webmail tabs, open a Claude login email, and click **复制 Claude 登录链接** (Copy Claude sign-in link) above the message body.

For AOL, another webmail service, a custom company domain, or a missing inline button, open the extension from the Chrome toolbar and click **检测当前页面** (Scan current page). When exactly one verified message is found, the popup shows **复制 Claude 登录链接** (Copy Claude sign-in link), so you can copy without locating the inline toolbar. Multiple or unverified results disable popup copying. You can pin the extension through Chrome's Extensions menu.

Copying only writes the link to your clipboard. It does not open the link, sign you in, or consume a one-time token. Claude determines whether the link has expired or already been used when you actually open it.

After updating the files, click **Reload** for the extension in `chrome://extensions`, then refresh your webmail tab to replace the old content scripts.

## Supported webmail

| Service | Detection strategy |
| --- | --- |
| Gmail | Automatic; each expanded `.a3s` message body is handled separately |
| Outlook / Microsoft 365 | Automatic; message containers and iframes, with offline Safe Links unwrapping |
| Proton Mail | Automatic; message containers, iframes, and open Shadow DOM |
| Tuta / Tutanota / Tutamail | Automatic on Tuta web client domains; message bodies and open Shadow DOM |
| Zoho Mail | Automatic on the configured regional domains; message body adapters |
| Yahoo, Fastmail, QQ Mail, NetEase 163 / 126 | Automatic; service-specific message containers and generic detection |
| Custom company domains and other webmail | Manual scanning through the extension, using temporary access to the current page |

These are **implemented detection strategies, not a guarantee that every production client version has been verified**. Validation covers synthetic DOM fixtures and Chromium browser interactions; a complete regression pass across real accounts on every service has not been performed. Webmail redesigns, restricted cross-origin iframes, closed Shadow DOM, or image-only buttons without accessible labels can prevent detection. The extension reports missing or unverified links instead of guessing.

## Link detection and copy safeguards

- Recognizes labels such as `Sign in`, `Sign in with Claude.ai`, `Log in`, and `登录`, including image `alt` text and `aria-label` values.
- Accepts only **HTTPS URLs on the exact host `claude.ai`, with a recognized login path and credential structure**. Rejects lookalike hosts, URLs with user information, HTTP, arbitrary subdomains, non-default ports, and ordinary home-page links.
- Supports `/magic-link` with either an opaque token or a `#token:base64-payload` fragment, plus `/login`, `/auth/verify`, and `/auth/callback` with recognized credential parameters such as token, ticket, or code. Credential fragments are copied unchanged, without decoding or rewriting them. New email templates or URL formats may require updated rules.
- Unwraps Microsoft Safe Links and Google `/url` wrappers locally, up to four layers. It never requests a short-link service or visits redirect destinations. Unknown tracking links remain unverified.
- Deduplicates identical destinations within a message. Different tokens or parameters count as different links; multiple destinations disable copying and show a count.
- Disables copying when verified and unverified Sign in links appear together, rather than choosing one automatically.
- Skips hidden messages and compose editors. Quoted older messages do not supply the current message's link; the UI indicates when quoted content was ignored. If links appear only in quoted content, copying stays disabled.
- Gives each identified message its own button. If message boundaries cannot be determined, candidates in that document are checked together and copying is provided only in the extension popup. The original email markup is left unchanged, and multiple links still disable copying.
- Scans again immediately before copying. A changed message or link requires another click. Handles single-page navigation and asynchronously loaded message bodies.
- Provides explicit feedback for missing links, multiple links, unverified links, quoted-only links, oversized pages, and clipboard failures.

Host validation does not authenticate the sender. The extension does not verify SPF or DKIM.

The copy button sits on the right of a compact toolbar, with status text on the left. When a link becomes available, the button gently lifts twice, then stops. Hovering, focusing, or clicking stops the reminder; the system's reduced-motion setting disables it.

## Privacy and permissions

The extension runtime contains no network requests, analytics, log uploads, or remote dependencies. Email content and links are processed only in memory on the current page. They are not persisted, and the extension does not use browser storage, cookies, mail APIs, or a background service.

| Access or permission | Purpose |
| --- | --- |
| Content scripts on listed webmail sites | Show the helper automatically when a message is opened, without requesting persistent access to every website |
| `activeTab` | Temporarily scan another webmail page after the user invokes the extension |
| `scripting` | Inject the bundled detection scripts into the selected page |
| `clipboardWrite` | Write a link only after a copy click; clipboard reading is not requested |

Shadow DOM isolates the UI. Status messages show the host and counts, not full tokens. Scanning sends only counts and a non-secret revision number to the popup. Only after an explicit popup copy click is a freshly revalidated link passed locally to the popup for clipboard writing; it is not stored or sent over the network. The copy request is bound to the checked document, and changed or ambiguous results require another scan. If some frames cannot be read, the popup discloses that scanning covers only the readable scope. After copying, clipboard history and synchronization are controlled by your operating system.

## Development and validation

Node.js is not required to load the extension. Development and tests require Node.js 20 or later. `jsdom` and the SVG renderer are development dependencies and are excluded from the extension package.

```sh
npm ci
npm test
npm run check
npm run package
```

`npm run package` creates `dist/claude-link-helper-1.0.7.zip` using the system `zip` command. The archive contains only files from `extension/`, excluding tests, development dependencies, and email fixtures.

Run `npm run icons` to regenerate the bundled PNG icons from the official Claude SVG mark. See the [asset source notes](assets/README.md).

To run the local interactive demo:

```sh
npm run demo
# Open http://127.0.0.1:4173
```

All test credentials are synthetic. The demo includes single-link, colon-separated fragment, multiple-link, missing-link, lookalike-host, Safe Links, quoted-message, Shadow DOM, and iframe scenarios. By default, the page loads the same production scripts itself. To test injection by the installed extension, open `http://127.0.0.1:4173/?bare=1` and use **检测当前页面** (Scan current page). After switching to the iframe scenario in bare mode, scan again to inject into the new frame.

For popup copying, open `http://127.0.0.1:4173/tests/popup-demo.html`. This local harness simulates Chrome's scripting API while running the production detection and popup scripts, and supports testing changed messages and ambiguous links. It does not replace testing an installed extension.

- `extension/core.js`: pure URL and label validation, offline unwrapping, deduplication, and ambiguity handling.
- `extension/dom.js`: message boundaries, visibility checks, quote exclusion, and Shadow DOM traversal.
- `extension/content.js`: page observation, inline UI, click-time revalidation, and copying.
- `extension/popup.*`: usage instructions, manual scanning, and permission feedback.
- `tests/`: URL safety cases, webmail fixtures, state changes, and popup tests. See the [validation notes (Chinese)](docs/TESTING.md).

## Recent changes

- **1.0.7:** The popup now always uses light mode, with a solid copy button and a plain scan button, regardless of the browser or system theme.
- **1.0.6:** Generic detection no longer inserts controls into an unknown email layout; copying remains available in the popup without changing the original Sign in button.
- **1.0.5:** Added direct popup copying after a manual scan, with fresh document/link checks.
- **1.0.4:** Replaced the extension and popup icons with the official Claude symbol, bundled locally as transparent PNGs.
- **1.0.3:** Fixed popup width so Chrome's initial narrow viewport cannot collapse the title and button into vertical text.
- **1.0.2:** Introduced a transparent toolbar with a right-aligned charcoal (`#292723`) copy button, a compact popup with collapsible help, and light/dark popup themes.
- **1.0.1:** Fixed rejection of `#token:base64-payload` login links that left the copy button disabled.

Technical references: [Chrome content scripts and related frames](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [temporary activeTab access](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [script injection API](https://developer.chrome.com/docs/extensions/reference/api/scripting), and [Claude email login](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account).

This is an independently developed extension and is not affiliated with Anthropic.
