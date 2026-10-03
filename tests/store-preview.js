// Uses production UI and synthetic mail content for store screenshots.
(() => {
  const mode = new URLSearchParams(location.search).get('mode') || 'popup';
  document.documentElement.classList.add(mode);
  if (mode === 'promo') {
    document.querySelector('.brand span').innerHTML = 'Link Helper<br>for Claude';
    document.querySelector('#headline').textContent = '复制邮件中的 Claude 登录链接';
    document.querySelector('.foot span').textContent = '非官方工具 · 仅本地处理';
    document.body.dataset.ready = 'true';
    return;
  }
  if (mode === 'popup') {
    document.querySelector('#headline').textContent = '手动检测，在弹窗直接复制';
    document.querySelector('#intro').textContent = '为其他网页邮箱提供复制入口，保持原邮件布局不变。';
    const script = document.createElement('script');
    script.src = '/tests/popup-demo.js';
    document.head.append(script);
    return;
  }
  document.querySelector('#popup').removeAttribute('src');
  const mail = document.querySelector('#mail');
  mail.srcdoc = `<html><head><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#292723;font:14px/1.65 system-ui,sans-serif}header{padding:20px 26px;border-bottom:1px solid #ecece7}h2{margin:0 0 5px;font-size:18px;font-weight:600}header p{margin:0;color:#777;font-size:12px}.a3s{padding:12px 26px 22px}.email{text-align:center;margin:25px auto 0;max-width:560px}.email img{width:31px;height:31px;vertical-align:middle;margin-right:6px}h3{font:600 24px system-ui,sans-serif;margin:0 0 22px}p{margin:10px 0;color:#62625b}a{display:inline-block;color:#fff;background:#141413;border-radius:6px;padding:10px 26px;text-decoration:none;font-weight:500;margin:8px 0}small{display:block;color:#88877e;margin-top:20px;font-size:11px}</style></head><body><header><h2>Your secure link to Claude.ai is here</h2><p>Demo &lt;demo@example.invalid&gt; — 示例邮件</p></header><div class="a3s"><div class="email"><h3>登录邮件示例</h3><p>Click the button below to finish signing in.</p><a href="https://claude.ai/magic-link#TEST_ONLY:dGVzdEBleGFtcGxlLmludmFsaWQ=">Sign in with Claude.ai</a><small>If you didn't request this email, you can safely ignore it.</small></div></div><script src="/extension/core.js"></script><script src="/extension/dom.js"></script><script src="/extension/content.js"></script></body></html>`;
  mail.addEventListener('load', () => {
    mail.contentDocument.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
    document.body.dataset.ready = 'true';
  }, {once:true});
})();
