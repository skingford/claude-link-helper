import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const html = readFileSync(new URL('../extension/popup.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../extension/popup.js', import.meta.url), 'utf8');
async function scan(t, { url = 'https://mail.example.com', result = { ready: 1 }, denyFrames = false, denyAll = false } = {}) {
  const jsdom = new JSDOM(html, { runScripts: 'outside-only' });
  t.after(() => jsdom.window.close());
  const calls = [];
  jsdom.window.chrome = {
    tabs: { query: async () => [{ id: 1, url }] },
    scripting: { executeScript: async (request) => {
      calls.push(request);
      if (denyAll || (denyFrames && request.target.allFrames)) throw new Error('denied');
      return request.func ? [{ frameId: 0, result }] : [{ frameId: 0 }];
    } },
  };
  jsdom.window.eval(script);
  jsdom.window.document.querySelector('#scan').click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { status: jsdom.window.document.querySelector('#status'), calls, button: jsdom.window.document.querySelector('#scan') };
}
test('popup injects production files and reports only aggregate result', async (t) => {
  const { status, calls, button } = await scan(t);
  assert.equal(status.dataset.state, 'success');
  assert.match(status.textContent, /已找到 1 处/);
  assert.deepEqual(Array.from(calls[0].files), ['core.js', 'dom.js', 'content.js']);
  assert.equal(button.disabled, false);
});
test('popup blocks restricted browser pages without attempting injection', async (t) => {
  const { status, calls } = await scan(t, { url: 'chrome://extensions' });
  assert.equal(calls.length, 0);
  assert.match(status.textContent, /请先打开网页邮箱/);
});
test('popup falls back to the main frame and states partial coverage', async (t) => {
  const { status, calls } = await scan(t, { denyFrames: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].target.allFrames, undefined);
  assert.equal(status.dataset.state, 'warning');
  assert.match(status.textContent, /部分内嵌内容.*未能检查/);
});
test('popup reports permission errors and re-enables retry', async (t) => {
  const { status, button } = await scan(t, { denyAll: true });
  assert.equal(status.dataset.state, 'error');
  assert.equal(button.disabled, false);
});
for (const [result, text] of [[{ready:0}, /未找到/], [{multiple:1}, /多个登录链接/], [{unverified:1}, /无法验证/], [{quoted:1}, /引用内容/], [{overflow:1}, /无法完整核验/]]) {
  test(`popup explains ${JSON.stringify(result)}`, async (t) => {
    const { status } = await scan(t, { result });
    assert.equal(status.dataset.state, 'warning');
    assert.match(status.textContent, text);
  });
}
