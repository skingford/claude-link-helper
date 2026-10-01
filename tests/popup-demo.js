// Local browser harness only. This file is never packaged with the extension.
(() => {
  const mail = document.querySelector('#mail');
  const popup = document.querySelector('#popup');
  const first = 'https://claude.ai/magic-link#TEST_ONLY_A:dGVzdEBleGFtcGxlLmludmFsaWQ=';
  const second = 'https://claude.ai/magic-link#TEST_ONLY_B:dGVzdEBleGFtcGxlLmludmFsaWQ=';
  const anchor = (url) => `<a href="${url}">Sign in with Claude.ai</a>`;
  mail.srcdoc = `<html><head><style>body{margin:0;color:#292723;font:14px/1.7 system-ui}header{padding:16px 22px;background:#f2f4f7;border-bottom:1px solid #ddd}article{padding:24px}h2{font-size:17px}.email{margin-top:45px;text-align:center}h3{font:30px Georgia,serif}#cta{display:inline-block;background:#141413;border-radius:6px;margin-top:16px}a{display:inline-block;padding:10px 22px;color:white;text-decoration:none}small{display:block;color:#777;margin-top:30px}</style></head><body><header>Webmail</header><article><h2>Your secure link to Claude.ai</h2><div class="email"><h3>Claude</h3><p>Click the button below to sign in.</p><div id="cta">${anchor(first)}</div><small>Synthetic email for local testing.</small></div></article></body></html>`;
  const ready = new Promise((resolve) => mail.addEventListener('load', () => {
    mail.contentDocument.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
    resolve();
  }, {once:true}));
  const scripts = new Map();
  async function script(name) {
    if (!scripts.has(name)) scripts.set(name, await (await fetch(`/extension/${name}`)).text());
    return scripts.get(name);
  }
  popup.addEventListener('load', () => {
    popup.contentWindow.chrome = {
      tabs: { query: async () => [{id:1,url:'https://mail.example.invalid/'}] },
      scripting: { executeScript: async request => {
        await ready;
        if (request.target.documentIds && request.target.documentIds[0] !== 'synthetic-mail-document') throw new Error('Document changed');
        if (request.files) {
          for (const name of request.files) mail.contentWindow.eval(await script(name));
          return [{frameId:0,documentId:'synthetic-mail-document'}];
        }
        const fn = mail.contentWindow.eval(`(${request.func.toString()})`);
        return [{frameId:0,documentId:'synthetic-mail-document',result:await fn(...request.args || [])}];
      } },
    };
    const resize = () => { popup.style.height = `${popup.contentDocument.body.offsetHeight + 2}px`; };
    new ResizeObserver(resize).observe(popup.contentDocument.body);
    resize();
    document.querySelector('#fixture-status').textContent = '测试环境就绪：先在右侧检测，再点击出现的复制按钮。';
  });
  document.querySelector('#one').addEventListener('click', async () => { await ready; mail.contentDocument.querySelector('#cta').innerHTML = anchor(first); });
  document.querySelector('#many').addEventListener('click', async () => { await ready; mail.contentDocument.querySelector('#cta').innerHTML = anchor(first) + anchor(second); });
  document.querySelector('#change').addEventListener('click', async () => { await ready; mail.contentDocument.querySelector('#cta').innerHTML = anchor(second); });
})();
