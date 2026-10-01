(() => {
  if (globalThis.ClaudeLinkHelper) return;
  const dom = globalThis.ClaudeLinkDOM;
  const panels = new Map();
  const observers = new Map();
  let timer;
  let scanning = false;
  let lastSummary = { ready: 0, multiple: 0, unverified: 0, missing: 0, quoted: 0, overflow: 0 };

  const STYLE = `
    :host { all: initial !important; display: block !important; position: relative !important; margin: 12px 0 !important; z-index: 1 !important; color-scheme: light dark; }
    * { box-sizing: border-box; }
    .panel { font: 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; color: #302d29; background: #faf8f4; border: 1px solid #e4dfd6; border-radius: 12px; padding: 14px 16px; max-width: 660px; text-align: left; direction: ltr; }
    .top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .mark { color: #a1472d; font-size: 16px; font-weight: 700; }
    .name { font-weight: 650; letter-spacing: .1px; }
    .private { margin-left: auto; color: #716b62; font-size: 11px; white-space: nowrap; }
    .body { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    button { appearance: none; font: inherit; cursor: pointer; border-radius: 7px; padding: 8px 12px; border: 1px solid #97462e; background: #a95036; color: #fff; font-weight: 600; }
    button:hover:enabled { background: #8e402b; }
    button:focus-visible { outline: 3px solid #dd9d72; outline-offset: 3px; }
    button:disabled { cursor: default; color: #6d675d; background: #e9e4dc; border-color: #ded7cd; }
    .status { margin: 0; color: #666056; font-size: 12px; overflow-wrap: anywhere; flex: 1; min-width: 155px; }
    .panel[data-state="multiple"] .status, .panel[data-state="unverified"] .status, .panel[data-state="overflow"] .status { color: #934b13; }
    .panel[data-state="copied"] .status { color: #2e6849; }
    @media (prefers-color-scheme: dark) {
      .panel { background: #282623; color: #f2ece3; border-color: #4a443c; }
      .private,.status { color: #c0b8ac; } .mark { color: #efa487; }
      button { background: #ba6042; border-color: #d48160; }
      button:disabled { background: #39352f; color: #b5ac9f; border-color: #554c41; }
      .panel[data-state="multiple"] .status,.panel[data-state="unverified"] .status,.panel[data-state="overflow"] .status { color: #f1bb78; }
      .panel[data-state="copied"] .status { color: #9cd5b0; }
    }
  `;

  function message(result) {
    switch (result.status) {
      case "ready": return `${result.links[0].unwrapped ? "已还原跳转 · " : ""}claude.ai · 唯一登录链接${result.quotedCount ? " · 已忽略引用内容" : ""}`;
      case "multiple": return `发现 ${result.links.length} 个不同登录链接，已停止复制。请单独打开目标邮件。`;
      case "unverified": {
        const reasons = result.rejections || [];
        const explanations = {
          "unrecognized-host": "Sign in 使用了尚未支持的域名或邮件追踪链接，暂不能复制。",
          "invalid-url": "Sign in 按钮没有可读取的有效 HTTPS 链接，暂不能复制。",
          "not-login-link": "已识别 claude.ai，但登录路径或凭证格式暂未支持。",
          "ambiguous-redirect": "跳转链接缺少目标或包含冲突目标，无法确定要复制哪一个。",
          "redirect-depth": "跳转链接嵌套过多，无法在本地完整解析。",
        };
        if (reasons.length === 1) return explanations[reasons[0].reason] || "链接无法验证。";
        return "有多种无法验证的 Sign in 链接，请检查邮件按钮；不会自动跟随跳转。";
      }
      case "quoted": return "仅在引用内容中发现 Sign in，请打开原始登录邮件。";
      case "overflow": return "页面内容过多，无法完整核验。请单独打开目标邮件后重试。";
      default: return "未找到 Claude 登录链接。请展开邮件正文，确认其中包含 Sign in 按钮。";
    }
  }

  function render(panel, result) {
    panel.result = result;
    const signature = JSON.stringify([result.status, result.links, result.quotedCount, result.rejections]);
    if (signature === panel.signature) return;
    panel.signature = signature;
    panel.box.dataset.state = result.status;
    panel.button.disabled = result.status !== "ready";
    panel.button.textContent = "复制 Claude 登录链接";
    panel.status.textContent = message(result);
  }

  function copyText(value, shadow) {
    // Synchronous fallback keeps the original user activation, including in mail iframes.
    const fallback = () => {
      const previous = document.activeElement;
      const selection = document.getSelection();
      const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("aria-label", "待复制的 Claude 登录链接");
      textarea.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
      shadow.append(textarea);
      textarea.focus({ preventScroll: true });
      textarea.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } finally {
        textarea.remove();
        previous?.focus?.({ preventScroll: true });
        if (selection) {
          selection.removeAllRanges();
          for (const range of ranges) selection.addRange(range);
        }
      }
      if (!copied) throw new Error("clipboard-unavailable");
    };
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value).catch(fallback);
    try { fallback(); return Promise.resolve(); } catch (error) { return Promise.reject(error); }
  }

  function createPanel(scope) {
    const host = document.createElement(dom.HOST_TAG);
    // Closed root keeps tokens out of page-accessible UI and isolates styles.
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    const box = document.createElement("section");
    box.className = "panel";
    box.setAttribute("aria-label", "Claude 登录链接助手");
    const top = document.createElement("div");
    top.className = "top";
    for (const [className, text] of [["mark", "↗"], ["name", "Claude 登录链接助手"], ["private", "仅本地处理"]]) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = text;
      top.append(span);
    }
    const body = document.createElement("div");
    body.className = "body";
    const button = document.createElement("button");
    button.type = "button";
    const status = document.createElement("p");
    status.className = "status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.id = "status";
    button.setAttribute("aria-describedby", "status");
    body.append(button, status);
    box.append(top, body);
    shadow.append(style, box);
    const panel = { host, box, button, status, signature: null, result: null };
    button.addEventListener("click", async (event) => {
      if (!event.isTrusted) return;
      event.preventDefault();
      event.stopPropagation();
      const previousLink = panel.result?.links[0]?.url;
      // The DOM may have changed since the button was drawn. Never copy stale state.
      const snapshot = dom.scan(document);
      const current = snapshot.results.find((item) => item.scope === scope);
      if (!current || current.status !== "ready" || current.links[0].url !== previousLink || !scope.isConnected || panel.host.parentNode !== scope) {
        scan();
        if (panel.host.isConnected && current?.status === "ready") {
          panel.status.textContent = "邮件内容已变化，请确认后再次点击复制。";
        }
        return;
      }
      panel.button.disabled = true;
      try {
        await copyText(current.links[0].url, shadow);
        if (!panel.host.isConnected || panel.result?.links[0]?.url !== current.links[0].url || panel.result.status !== "ready") return;
        panel.box.dataset.state = "copied";
        panel.button.textContent = "已复制";
        panel.status.textContent = "登录链接已复制，可粘贴到需要登录的浏览器。";
      } catch {
        if (!panel.host.isConnected) return;
        panel.status.textContent = "复制失败：浏览器限制了剪贴板，请检查网站权限后重试。";
      } finally {
        panel.button.disabled = panel.result?.status !== "ready";
      }
    });
    // Place within the mail body so closing/collapsing it also hides its helper.
    scope.prepend(host);
    return panel;
  }

  function schedule() {
    if (timer || scanning || !globalThis.document || document.visibilityState === "hidden") return;
    timer = setTimeout(() => { timer = null; scan(); }, 250);
  }

  function observe(roots) {
    const active = new Set(roots);
    for (const [root, observer] of observers) {
      if (!active.has(root)) { observer.disconnect(); observers.delete(root); }
    }
    for (const root of roots) {
      if (observers.has(root)) continue;
      const observer = new MutationObserver((mutations) => {
        const changed = mutations.some((mutation) => {
          const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
          if (target?.closest?.(dom.HOST_TAG)) return false;
          if (mutation.type === "childList") {
            return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.nodeType !== 1 || node.localName !== dom.HOST_TAG);
          }
          return true;
        });
        if (changed) schedule();
      });
      observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ["href", "class", "style", "hidden", "aria-hidden", "aria-label", "alt", "open", "contenteditable"] });
      observers.set(root, observer);
    }
  }

  function scan() {
    if (scanning || !document.body) return lastSummary;
    scanning = true;
    try {
      const snapshot = dom.scan(document);
      const active = new Set();
      lastSummary = { ready: 0, multiple: 0, unverified: 0, missing: 0, quoted: 0, overflow: snapshot.overflow ? 1 : 0 };
      for (const result of snapshot.results) {
        active.add(result.scope);
        lastSummary[result.status] += 1;
        let panel = panels.get(result.scope);
        if (!panel?.host.isConnected || panel.host.parentNode !== result.scope) {
          panel?.host.remove();
          panel = createPanel(result.scope);
          panels.set(result.scope, panel);
        }
        render(panel, result);
      }
      for (const [scope, panel] of panels) {
        if (!active.has(scope) || !scope.isConnected) { panel.host.remove(); panels.delete(scope); }
      }
      observe(snapshot.roots);
      return { ...lastSummary };
    } finally {
      scanning = false;
    }
  }

  // Only aggregate status crosses extension contexts. URLs never enter runtime messages.
  globalThis.ClaudeLinkHelper = Object.freeze({ scan });
  scan();
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("hashchange", schedule);
  window.addEventListener("popstate", schedule);
  // Covers late attachShadow(), CSS-driven visibility changes and SPA state without DOM mutations.
  setInterval(schedule, 2500);
})();
