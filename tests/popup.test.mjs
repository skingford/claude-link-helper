import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const html = readFileSync(new URL('../extension/popup.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../extension/popup.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('../extension/core.js', import.meta.url), 'utf8');
const link = 'https://claude.ai/magic-link#TEST_ONLY:dGVzdEBleGFtcGxlLmludmFsaWQ=';
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
const frame = (result = { ready: 1 }, documentId = 'document-a', frameId = 0) => ({
  frameId, documentId,
  result: { revision: 1, copyable: result.ready === 1 && !result.multiple && !result.unverified && !result.overflow, ...result },
});
async function scan(t, options = {}) {
  const { url = 'https://mail.example.com', result = { ready: 1 }, denyFrames = false, denyAll = false } = options;
  const jsdom = new JSDOM(html, { runScripts: 'outside-only' });
  t.after(() => jsdom.window.close());
  const calls = [], copied = [];
  const state = { results: options.results || [frame(result)], response: { status: 'ready', url: link }, tabId: 1, clipboardDenied: false };
  jsdom.window.chrome = {
    tabs: { query: async () => [{ id: state.tabId, url }] },
    scripting: { executeScript: async (request) => {
      calls.push(request);
      if (denyAll || (denyFrames && request.target.allFrames)) throw new Error('denied');
      if (request.files) return [{ frameId: 0 }];
      if (request.target.documentIds) return [{ frameId: 0, documentId: state.results[0]?.documentId, result: state.response }];
      return state.results;
    } },
  };
  Object.defineProperty(jsdom.window.navigator, 'clipboard', { value: { writeText: async (value) => {
    if (state.clipboardDenied) throw new Error('denied');
    copied.push(value);
  } } });
  jsdom.window.document.execCommand = () => false;
  jsdom.window.eval(core);
  jsdom.window.eval(script);
  const button = jsdom.window.document.querySelector('#scan');
  const copyButton = jsdom.window.document.querySelector('#copy');
  button.click();
  await tick();
  return { status: jsdom.window.document.querySelector('#status'), document: jsdom.window.document, calls, copied, state, button, copyButton,
    copy: async () => { copyButton.click(); await tick(); },
    rescan: async () => { button.click(); await tick(); },
  };
}
test('popup detects one link and offers an explicit copy button without copying yet', async (t) => {
  const { status, calls, button, copyButton, copied } = await scan(t);
  assert.equal(status.dataset.state, 'success');
  assert.match(status.textContent, /已找到 1 处/);
  assert.deepEqual(Array.from(calls[0].files), ['core.js', 'dom.js', 'content.js']);
  assert.equal(button.disabled, false);
  assert.equal(copyButton.hidden, false);
  assert.equal(copyButton.disabled, false);
  assert.equal(copied.length, 0);
  assert.equal(calls.some((call) => call.target.documentIds), false);
});
test('popup revalidates and requests the exact document only on a copy click', async (t) => {
  const { copied, calls, copy, copyButton, document } = await scan(t);
  await copy();
  assert.deepEqual(copied, [link]);
  const read = calls.find((call) => call.target.documentIds);
  assert.deepEqual(Array.from(read.target.documentIds), ['document-a']);
  assert.deepEqual(Array.from(read.args), [1]);
  assert.equal(copyButton.textContent, '已复制');
  assert.equal(document.documentElement.innerHTML.includes('TEST_ONLY'), false);
});
test('popup blocks restricted browser pages without attempting injection', async (t) => {
  const { status, calls, copyButton } = await scan(t, { url: 'chrome://extensions' });
  assert.equal(calls.length, 0);
  assert.match(status.textContent, /请先打开网页邮箱/);
  assert.equal(copyButton.hidden, true);
});
test('partial frame access is disclosed and copy stays bound to the checked main document', async (t) => {
  const { status, calls, copyButton, copy, copied } = await scan(t, { denyFrames: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].target.allFrames, undefined);
  assert.equal(status.dataset.state, 'warning');
  assert.match(status.textContent, /部分内嵌内容.*未能检查/);
  assert.equal(copyButton.hidden, false);
  await copy();
  assert.deepEqual(copied, [link]);
  assert.equal(calls[3].target.allFrames, undefined);
});
test('popup reports permission errors and re-enables retry', async (t) => {
  const { status, button, copyButton } = await scan(t, { denyAll: true });
  assert.equal(status.dataset.state, 'error');
  assert.equal(button.disabled, false);
  assert.equal(copyButton.hidden, true);
});
for (const [result, text] of [[{ready:0}, /未找到/], [{multiple:1}, /多个登录链接/], [{unverified:1}, /无法验证/], [{quoted:1}, /引用内容/], [{overflow:1}, /无法完整核验/], [{ready:2}, /已找到 2 处/]]) {
  test(`popup cannot copy ${JSON.stringify(result)}`, async (t) => {
    const { status, copyButton } = await scan(t, { result });
    assert.equal(status.dataset.state, 'warning');
    assert.match(status.textContent, text);
    assert.equal(copyButton.hidden, true);
  });
}
test('two ready frames never enable a global copy action', async (t) => {
  const { copyButton } = await scan(t, { results: [frame(), frame({ready:1}, 'document-b', 1)] });
  assert.equal(copyButton.hidden, true);
});
for (const [name, update] of [
  ['changed token revision', state => { state.results = [frame({ready:1, revision:2})]; }],
  ['new document in the same frame', state => { state.results = [frame({ready:1}, 'document-b')]; }],
  ['additional ready frame', state => { state.results.push(frame({ready:1}, 'document-b', 1)); }],
  ['new unverified link', state => { state.results = [frame({ready:1, unverified:1})]; }],
  ['uninitialized new frame', state => { state.results.push({frameId:2, documentId:'document-c', result:null}); }],
  ['changed active tab', state => { state.tabId = 2; }],
]) {
  test(`copy rejects ${name}`, async (t) => {
    const { state, copy, copied, status, calls, copyButton } = await scan(t);
    update(state);
    await copy();
    assert.equal(copied.length, 0);
    assert.equal(copyButton.hidden, true);
    assert.match(status.textContent, /已变化.*重新检测/);
    assert.equal(calls.some(call => call.target.documentIds), false);
  });
}
test('the final content-script recheck can reject a last-moment change', async (t) => {
  const { state, copy, copied, status } = await scan(t);
  state.response = { status: 'changed' };
  await copy();
  assert.equal(copied.length, 0);
  assert.match(status.textContent, /已变化/);
});
test('popup validates returned URLs and never copies a foreign destination', async (t) => {
  const { state, copy, copied } = await scan(t);
  state.response = { status:'ready', url:'https://evil.example/magic-link#TEST_ONLY' };
  await copy();
  assert.equal(copied.length, 0);
});
test('clipboard failure is explicit, removes temporary content and allows retry', async (t) => {
  const { state, copy, copied, status, copyButton, document } = await scan(t);
  state.clipboardDenied = true;
  await copy();
  assert.match(status.textContent, /复制失败/);
  assert.equal(copyButton.disabled, false);
  assert.equal(document.querySelector('textarea'), null);
  assert.equal(document.documentElement.innerHTML.includes('TEST_ONLY'), false);
  state.clipboardDenied = false;
  await copy();
  assert.deepEqual(copied, [link]);
});
test('rescanning a missing link clears an earlier copy selection', async (t) => {
  const { state, rescan, copy, copied, copyButton } = await scan(t);
  state.results = [frame({ready:0})];
  await rescan();
  await copy();
  assert.equal(copied.length, 0);
  assert.equal(copyButton.hidden, true);
});
