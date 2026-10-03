(() => {
  if (globalThis.ClaudeLinkHelper) return;
  const dom = globalThis.ClaudeLinkDOM;
  const panels = new Map();
  const observers = new Map();
  let timer;
  let scanning = false;
  let copyCandidate = null;
  let revision = 0;
  let lastSummary = { ready: 0, multiple: 0, unverified: 0, missing: 0, quoted: 0, overflow: 0 };

  const STYLE = `
    :host { all: initial !important; display: block !important; position: relative !important; margin: 10px 0 14px !important; color: inherit !important; color-scheme: normal; }
    * { box-sizing: border-box; }
    .panel { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; width: 100%; color: inherit; font: 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; text-align: left; direction: ltr; }
    button { display: inline-flex; align-items: center; justify-content: center; flex: 0 1 200px; min-width: 0; max-width: 100%; min-height: 44px; margin-left: auto; appearance: none; font: inherit; font-size: 14px; line-height: 20px; cursor: pointer; border-radius: 6px; padding: 10px 16px; border: 1px solid transparent; background: #141413; color: #fff; font-weight: 500; }
    button:hover:enabled { background: #292723; }
    button:active:enabled { background: #080808; }
    button:focus-visible { outline: 2px solid #847d72; outline-offset: 3px; }
    button:disabled { cursor: default; opacity: .55; color: inherit; background: transparent; border-color: color-mix(in srgb,currentColor 25%,transparent); }
    .panel[data-state="ready"] button[data-attention]:not(:disabled) { animation: clh-reminder 850ms ease-in-out 450ms 2; }
    @keyframes clh-reminder {
      0%, 100% { transform: translateY(0); box-shadow: 0 0 0 rgba(41,39,35,0); }
      40% { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(41,39,35,.18); }
    }
    @media (prefers-reduced-motion: reduce) {
      button[data-attention] { animation: none !important; }
    }
    .status { margin: 0; color: inherit; opacity: .72; font-size: 12px; overflow-wrap: anywhere; flex: 1 1 150px; }
    .panel[data-state="multiple"] .status, .panel[data-state="unverified"] .status, .panel[data-state="overflow"] .status { opacity: 1; }
    @media (forced-colors: active) {
      button { color: ButtonText; background: ButtonFace; border-color: ButtonText; }
      .status, button:disabled { opacity: 1; }
    }
  `;

  function message(result) {
    switch (result.status) {
      case "ready": return `claude.ai${result.links[0].unwrapped ? "（已还原跳转）" : ""}${result.quotedCount ? "，已忽略引用内容" : ""}`;
      case "multiple": return `发现 ${result.links.length} 个不同链接，请单独打开目标邮件。`;
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
      default: return "未找到登录链接，请展开包含 Sign in 按钮的正文。";
    }
  }

  function render(panel, result) {
    const previous = panel.result;
    panel.result = result;
    const signature = JSON.stringify([result.status, result.links, result.quotedCount, result.rejections]);
    if (signature === panel.signature) return;
    panel.signature = signature;
    panel.box.dataset.state = result.status;
    panel.button.disabled = result.status !== "ready";
    panel.label.textContent = "复制 Claude 登录链接";
    panel.status.textContent = message(result);
    if (result.status !== "ready") {
      panel.button.removeAttribute("data-attention");
    } else if (previous?.status !== "ready" || previous.links[0]?.url !== result.links[0].url) {
      // Same-result polling must not replay a completed or dismissed reminder.
      panel.button.toggleAttribute("data-attention", !panel.button.matches(":hover, :focus"));
    }
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

  function isMounted(panel, result) {
    return !result.fallback && Boolean(panel?.host.isConnected) && panel.host.parentNode === result.scope;
  }

  function createPanel(result) {
    const { scope } = result;
    const host = document.createElement(dom.HOST_TAG);
    // Closed root keeps tokens out of page-accessible UI and isolates styles.
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    const box = document.createElement("section");
    box.className = "panel";
    box.setAttribute("aria-label", "Link Helper for Claude");
    const button = document.createElement("button");
    button.type = "button";
    const label = document.createElement("span");
    button.append(label);
    const status = document.createElement("p");
    status.className = "status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.id = "status";
    button.setAttribute("aria-describedby", "status");
    box.append(status, button);
    shadow.append(style, box);
    const panel = { host, box, button, label, status, signature: null, result: null };
    const stopReminder = () => button.removeAttribute("data-attention");
    for (const type of ["pointerenter", "pointerdown", "focus", "animationend"]) {
      button.addEventListener(type, stopReminder);
    }
    button.addEventListener("click", async (event) => {
      if (!event.isTrusted) return;
      stopReminder();
      event.preventDefault();
      event.stopPropagation();
      const previousLink = panel.result?.links[0]?.url;
      // The DOM may have changed since the button was drawn. Never copy stale state.
      const snapshot = dom.scan(document);
      const current = snapshot.results.find((item) => item.scope === scope);
      if (!current || current.status !== "ready" || current.links[0].url !== previousLink || !scope.isConnected || !isMounted(panel, current)) {
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
        panel.label.textContent = "已复制";
        panel.status.textContent = "可粘贴到其他浏览器";
      } catch {
        if (!panel.host.isConnected) return;
        panel.status.textContent = "复制失败：浏览器限制了剪贴板，请检查网站权限后重试。";
      } finally {
        panel.button.disabled = panel.result?.status !== "ready";
      }
    });
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
      const ready = snapshot.results.filter((result) => result.status === "ready");
      const blocked = snapshot.overflow || snapshot.results.some((result) => ["multiple", "unverified", "overflow"].includes(result.status));
      const next = !blocked && ready.length === 1 ? { scope: ready[0].scope, url: ready[0].links[0].url } : null;
      if (next?.scope !== copyCandidate?.scope || next?.url !== copyCandidate?.url) revision += 1;
      copyCandidate = next;
      const active = new Set();
      lastSummary = { ready: 0, multiple: 0, unverified: 0, missing: 0, quoted: 0, overflow: snapshot.overflow ? 1 : 0 };
      for (const result of snapshot.results) {
        lastSummary[result.status] += 1;
        // Unknown layouts are detection-only: the popup provides copying.
        // Inserting next to an anchor can land inside a styled CTA/table cell.
        if (result.fallback) continue;
        active.add(result.scope);
        let panel = panels.get(result.scope);
        if (!isMounted(panel, result)) {
          panel?.host.remove();
          panel = createPanel(result);
          panels.set(result.scope, panel);
        }
        render(panel, result);
      }
      for (const [scope, panel] of panels) {
        if (!active.has(scope) || !scope.isConnected) { panel.host.remove(); panels.delete(scope); }
      }
      observe(snapshot.roots);
      lastSummary.revision = revision;
      lastSummary.copyable = Boolean(copyCandidate);
      return { ...lastSummary };
    } finally {
      scanning = false;
    }
  }

  function readCopyCandidate(expectedRevision) {
    if (!document.body) return { status: "changed" };
    scan();
    if (!copyCandidate || revision !== expectedRevision) return { status: "changed" };
    return { status: "ready", url: copyCandidate.url };
  }

  // Scans expose counts and an opaque revision. Only an explicit popup copy
  // request reads the freshly revalidated URL through the isolated world.
  globalThis.ClaudeLinkHelper = Object.freeze({ scan, readCopyCandidate });
  scan();
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("hashchange", schedule);
  window.addEventListener("popstate", schedule);
  // Covers late attachShadow(), CSS-driven visibility changes and SPA state without DOM mutations.
  setInterval(schedule, 2500);
})();
