# Link Helper for Claude — Privacy Policy

**English** | [简体中文](PRIVACY.zh-CN.md)

Effective date: October 3, 2026

Link Helper for Claude is an independent browser extension maintained through the [project repository](https://github.com/skingford/claude-link-helper). It is not affiliated with or endorsed by Anthropic.

## What the extension accesses

The extension inspects rendered webpage content, including email text, button labels, and hyperlinks, on its configured webmail sites. On other sites, it runs when you choose **Scan current page** from the extension popup. This access is used to find and validate Claude email sign-in links.

A sign-in link can contain a one-time authentication token and encoded account information. These links are handled as sensitive data and are used only for the detection and copying features. The extension does not open the login link or use it to sign in to an account.

## How information is used

All processing happens on your device. The extension checks button labels and URL structure, detects multiple or unverified links, and displays the results. Temporary values stay in the current page or popup's memory; the extension does not save email content or login links to browser storage or a database.

The popup's initial scan receives counts and a non-secret revision number. When you explicitly click its copy button, a freshly revalidated link is passed locally from the page script to the popup and written to your clipboard. Copying from the message toolbar also requires a click.

## Network access, sharing, and tracking

The extension does not send email content, login links, authentication tokens, or usage data to the developer or to a server. It contains no analytics, advertising, tracking SDKs, remote scripts, or remote image dependencies. It does not sell, share, or use user data for advertising, profiling, or model training.

Known redirect wrappers are decoded locally. The extension does not request a tracking link or follow a redirect to determine its destination.

Your email provider, Google Chrome, the Chrome Web Store, and your operating system operate independently of this extension and are governed by their own privacy practices.

## Clipboard

The extension requests clipboard write permission, not clipboard read permission. A login link is written only when you click a copy button.

After copying, the link may remain in your system clipboard or clipboard history. Any operating-system clipboard synchronization is controlled by your system settings. You can replace or clear copied content using your normal clipboard controls.

## Permissions

| Access or permission | Purpose |
| --- | --- |
| Listed webmail websites | Detect sign-in links in rendered mail pages and show the helper automatically where supported |
| `activeTab` | Temporarily inspect the page where you invoke manual detection |
| `scripting` | Run the detection scripts bundled with the extension on that page |
| `clipboardWrite` | Copy the selected login link after your click |

## Your choices and retention

You can limit the extension's site access in Chrome, use manual detection, disable the extension, or uninstall it. Refreshing or closing a page or popup discards that document's temporary processing state. The developer has no stored copy of your emails or login links to retrieve or delete. Removing the extension does not clear content you previously copied to the system clipboard.

Data is used only to provide the extension's disclosed link detection and copying functionality. The extension's use of user data follows the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Contact and changes

For privacy questions, email [aisolocode@gmail.com](mailto:aisolocode@gmail.com) or open an issue in the [project's issue tracker](https://github.com/skingford/claude-link-helper/issues). Do not include real login links, tokens, or private email content in a public issue.

If these practices change, this policy will be updated with a new effective date, and relevant changes will be reflected in the extension's store disclosures.
