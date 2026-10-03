(() => {
  const tokenA = 'https://claude.ai/magic-link?token=TEST_ONLY_A&returnTo=%2Fnew#keep';
  const tokenB = 'https://claude.ai/magic-link?token=TEST_ONLY_B';
  const tokenComposite = 'https://claude.ai/magic-link#TEST_ONLY_0123456789abcdef:dGVzdEBleGFtcGxlLmludmFsaWQ=';
  const root = document.querySelector('#message');
  const bare = new URLSearchParams(location.search).has('bare');
  const anchor = (url) => `<a href="${url.replaceAll('&','&amp;')}">Sign in with Claude.ai</a>`;
  const markup = (kind) => `<div class="mail"><h3 class="wordmark">Claude 登录邮件示例</h3><p>Welcome back. Use the button below to sign in.</p>${
    kind === 'composite' ? anchor(tokenComposite) : kind === 'multiple' ? anchor(tokenA) + anchor(tokenB) : kind === 'missing' ? '<p>邮件正文尚未完整加载。</p>' :
    kind === 'unsafe' ? anchor('https://claude.ai.example.invalid/magic-link?token=TEST_ONLY') :
    kind === 'wrapped' ? anchor(`https://nam12.safelinks.protection.outlook.com/?url=${encodeURIComponent(tokenA)}`) :
    kind === 'quoted' ? anchor(tokenA) + `<blockquote>Earlier email${anchor(tokenB)}</blockquote>` : anchor(tokenA)
  }<p class="foot">If you didn't request this email, you can safely ignore it.</p></div>`;
  function load(kind) {
    root.replaceChildren();
    if (kind === 'iframe') {
      const frame = document.createElement('iframe');
      frame.title = '模拟内嵌邮件'; frame.style.cssText = 'width:100%;height:410px;border:0';
      const scripts = bare ? '' : '<script src="/extension/core.js"></script><script src="/extension/dom.js"></script><script src="/extension/content.js"></script>';
      frame.srcdoc = `<html><body><div class="mail-body">${markup('ready')}</div>${scripts}</body></html>`;
      root.append(frame);
    } else if (kind === 'shadow') {
      const element = document.createElement('mail-view');
      root.append(element);
      element.attachShadow({ mode: 'open' }).innerHTML = `<div class="mail-body">${markup('ready')}</div>`;
    } else {
      const body = document.createElement('div'); body.className = 'a3s'; body.innerHTML = markup(kind); root.append(body);
    }
  }
  document.querySelectorAll('[data-case]').forEach((button) => button.addEventListener('click', () => load(button.dataset.case)));
  root.addEventListener('click', (event) => { if (event.target.closest('a')) event.preventDefault(); });
  load('ready');
  // ?bare=1 lets a real extension / isolated-world harness supply production scripts.
  if (!bare) {
    for (const name of ['core','dom','content']) {
      const script = document.createElement('script'); script.src = `/extension/${name}.js`; script.async = false; document.head.append(script);
    }
  }
})();
