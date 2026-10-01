import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const source = (name) => readFileSync(new URL(`../extension/${name}.js`, import.meta.url), 'utf8');
const first = 'https://claude.ai/magic-link?token=TEST_ONLY_A';
const second = 'https://claude.ai/magic-link?token=TEST_ONLY_B';
const link = (url = first) => `<a href="${url}">Sign in</a>`;

function setup(t, html, content = false) {
  const jsdom = new JSDOM(html, { url: 'https://mail.google.com/mail/u/0', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => jsdom.window.close());
  const { window } = jsdom;
  window.HTMLElement.prototype.getClientRects = () => [{ width: 200, height: 60 }];
  const shadows = [];
  const attach = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function (options) {
    const root = attach.call(this, options); shadows.push(root); return root;
  };
  const clicks = new Map();
  const addEvent = window.EventTarget.prototype.addEventListener;
  window.EventTarget.prototype.addEventListener = function (type, fn, options) {
    if (type === 'click' && this.tagName === 'BUTTON') clicks.set(this, fn);
    return addEvent.call(this, type, fn, options);
  };
  const copied = [];
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (value) => copied.push(value) }, configurable: true });
  window.eval(source('core'));
  window.eval(source('dom'));
  if (content) window.eval(source('content'));
  return { window, document: window.document, scan: () => window.ClaudeLinkDOM.scan(window.document), shadows, copied,
    click: (button) => clicks.get(button)({ isTrusted: true, preventDefault() {}, stopPropagation() {} }) };
}

for (const [provider, html] of [
  ['Gmail', `<div class="a3s">${link()}</div>`],
  ['Outlook', `<div id="UniqueMessageBody_1">${link()}</div>`],
  ['Proton', `<div class="message-content"><div class="message-content-html">${link()}</div></div>`],
  ['Tuta', `<div class="mail-body">${link()}</div>`],
  ['Zoho', `<div class="zmMailContent">${link()}</div>`],
  ['Yahoo', `<div data-test-id="message-view-body-content">${link()}</div>`],
  ['Fastmail', `<div class="v-MailMessage-body">${link()}</div>`],
  ['QQ', `<div id="mailContentContainer">${link()}</div>`],
  ['NetEase', `<div class="nui-msgbox-body">${link()}</div>`],
  ['Generic / iframe body', `<main>${link()}</main>`],
]) {
  test(`${provider} fixture has exactly one message result`, (t) => {
    const { scan } = setup(t, html);
    const { results } = scan();
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'ready');
    assert.equal(results[0].links[0].url, first);
  });
}
test('two visible mail bodies stay separate, two links inside a body block copying', (t) => {
  const { scan } = setup(t, `<div class="a3s">${link()}</div><div class="a3s">${link(second)}${link()}</div>`);
  assert.deepEqual(Array.from(scan().results, (r) => r.status), ['ready', 'multiple']);
});
test('ignores hidden/collapsed mail, compose drafts and quoted old links', (t) => {
  const { scan } = setup(t, `<div style="display:none"><div class="a3s">${link(second)}</div></div>
    <div class="a3s" contenteditable="true">${link(second)}</div>
    <div class="a3s">${link()}<blockquote>${link(second)}</blockquote><a hidden href="${second}">Sign in</a></div>`);
  const { results } = scan();
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'ready');
  assert.equal(results[0].quotedCount, 1);
});
test('quoted-only and branded missing-link mail get non-copyable states', (t) => {
  const { scan } = setup(t, `<div class="a3s"><blockquote>${link()}</blockquote></div><div class="a3s">Claude 登录邮件，正文未展开</div>`);
  assert.deepEqual(Array.from(scan().results, (r) => r.status), ['quoted', 'missing']);
});
test('reads open shadow DOM mail without splitting nested scopes', (t) => {
  const { document, scan } = setup(t, '<div class="mail-body"><mail-view></mail-view></div>');
  document.querySelector('mail-view').attachShadow({ mode: 'open' }).innerHTML = `<div class="mail-body-content">${link()}</div>`;
  assert.equal(scan().results.length, 1);
  assert.equal(scan().results[0].status, 'ready');
});
test('image alt and aria labels identify link buttons', (t) => {
  const { scan } = setup(t, `<div class="a3s"><a href="${first}"><img alt="Sign in"></a><a href="${first}" aria-label="Sign in with Claude.ai"><span>↗</span></a></div>`);
  assert.equal(scan().results[0].status, 'ready');
});
test('non-link Sign in buttons fail closed', (t) => {
  const { scan } = setup(t, '<div class="a3s"><button>Sign in</button></div>');
  assert.equal(scan().results[0].status, 'unverified');
});
test('content script renders once, copies only on click and does not leak token in UI or summary', async (t) => {
  const app = setup(t, `<div class="a3s">${link()}</div>`, true);
  const { window, document, shadows, copied, click } = app;
  window.eval(source('content'));
  const summary = window.ClaudeLinkHelper.scan();
  assert.equal(document.querySelectorAll('claude-link-helper').length, 1);
  assert.equal(document.querySelector('claude-link-helper').shadowRoot, null);
  assert.equal(JSON.stringify(summary).includes('TEST_ONLY'), false);
  assert.equal(shadows[0].textContent.includes('TEST_ONLY'), false);
  assert.equal(copied.length, 0);
  await click(shadows[0].querySelector('button'));
  assert.deepEqual(copied, [first]);
  assert.equal(shadows[0].querySelector('button').textContent, '已复制');
});
test('revalidates changed links before copy and requires another click', async (t) => {
  const { window, document, shadows, copied, click } = setup(t, `<div class="a3s">${link()}</div>`, true);
  const button = shadows[0].querySelector('button');
  document.querySelector('a').href = second;
  await click(button);
  assert.equal(copied.length, 0);
  assert.match(shadows[0].textContent, /邮件内容已变化/);
  await click(button);
  assert.deepEqual(copied, [second]);
  document.querySelector('.a3s').remove();
  window.ClaudeLinkHelper.scan();
  assert.equal(document.querySelectorAll('claude-link-helper').length, 0);
});
test('a second link inserted before click stops copying immediately', async (t) => {
  const { document, shadows, copied, click } = setup(t, `<div class="a3s">${link()}</div>`, true);
  document.querySelector('.a3s').insertAdjacentHTML('beforeend', link(second));
  await click(shadows[0].querySelector('button'));
  assert.equal(copied.length, 0);
  assert.equal(shadows[0].querySelector('button').disabled, true);
  assert.match(shadows[0].textContent, /发现 2 个/);
});
test('clipboard denial displays a failure and allows retry', async (t) => {
  const { window, shadows, click } = setup(t, `<div class="a3s">${link()}</div>`, true);
  window.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
  window.document.execCommand = () => false;
  await click(shadows[0].querySelector('button'));
  assert.match(shadows[0].textContent, /复制失败/);
  assert.equal(shadows[0].querySelector('button').disabled, false);
});
test('mutation observer refreshes after SPA replacement', async (t) => {
  const { window, document, copied } = setup(t, `<div class="a3s">${link()}</div>`, true);
  document.querySelector('.a3s').innerHTML = `${link()}${link(second)}`;
  await new Promise((resolve) => window.setTimeout(resolve, 350));
  assert.equal(window.ClaudeLinkHelper.scan().multiple, 1);
  assert.equal(document.querySelectorAll('claude-link-helper').length, 1);
  assert.equal(copied.length, 0);
});
test('programmatic page clicks cannot write the clipboard', async (t) => {
  const { shadows, copied } = setup(t, `<div class="a3s">${link()}</div>`, true);
  shadows[0].querySelector('button').click();
  await Promise.resolve();
  assert.equal(copied.length, 0);
});
test('a helper moved to a different message is rebound before it can copy', async (t) => {
  const { document, shadows, copied, click } = setup(t, `<div class="a3s">${link()}</div><aside></aside>`, true);
  document.querySelector('aside').append(document.querySelector('claude-link-helper'));
  await click(shadows[0].querySelector('button'));
  assert.equal(copied.length, 0);
  assert.equal(document.querySelector('aside claude-link-helper'), null);
  assert.equal(document.querySelectorAll('.a3s > claude-link-helper').length, 1);
});
test('plaintext compose editors and collapsed embedding frames are skipped', (t) => {
  const { document, scan, window } = setup(t, `<div contenteditable="plaintext-only">${link()}</div><iframe hidden></iframe>`);
  assert.equal(scan().results.length, 0);
  const frameDoc = document.querySelector('iframe').contentDocument;
  frameDoc.body.innerHTML = link();
  assert.equal(window.ClaudeLinkDOM.scan(frameDoc).results.length, 0);
});
test('scan limits disable a known good link instead of ignoring unseen candidates', (t) => {
  const { scan } = setup(t, `<div class="a3s">${link()}${'<button>Other</button>'.repeat(3001)}</div>`);
  assert.equal(scan().results[0].status, 'overflow');
});

test('Gmail colon-separated magic link enables copy and writes exact credentials', async (t) => {
  const composite = 'https://claude.ai/magic-link#0123456789abcdef0123456789abcdef:dGVzdEBleGFtcGxlLmludmFsaWQ=';
  const { shadows, copied, click } = setup(t, `<div class="a3s"><h2>Sign in to Claude.ai</h2>${link(composite)}</div>`, true);
  const button = shadows[0].querySelector('button');
  assert.equal(button.disabled, false);
  await click(button);
  assert.deepEqual(copied, [composite]);
  assert.equal(button.textContent, '已复制');
  assert.equal(shadows[0].textContent.includes('0123456789abcdef'), false);
});
test('unsupported-format UI explains the reason without showing URL credentials', (t) => {
  const { shadows, document, window } = setup(t, `<div class="a3s">${link('https://claude.ai/unsupported#PRIVATE_PAYLOAD')}</div>`, true);
  assert.match(shadows[0].textContent, /登录路径或凭证格式暂未支持/);
  assert.equal(shadows[0].textContent.includes('PRIVATE_PAYLOAD'), false);
  document.querySelector('a').href = 'https://unknown.example/PRIVATE_PAYLOAD';
  window.ClaudeLinkHelper.scan();
  assert.match(shadows[0].textContent, /尚未支持的域名或邮件追踪链接/);
  assert.equal(shadows[0].textContent.includes('PRIVATE_PAYLOAD'), false);
});
