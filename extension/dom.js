(() => {
  if (globalThis.ClaudeLinkDOM) return;
  const core = globalThis.ClaudeLinkCore;
  const HOST_TAG = "claude-link-helper";
  const MAX_ELEMENTS = 60000;
  const MAX_CONTROLS = 3000;
  const MESSAGE_SELECTORS = [
    ".a3s", // Gmail, one expanded message body
    '[id^="UniqueMessageBody"]', '[role="document"]', '[aria-label="Message body"]',
    ".message-content", ".message-content-html", '[data-testid="message-content:body"]',
    ".mail-body", ".mailBody", ".mail-body-content", '[data-testid="mail-body"]',
    ".zmMailContent", ".zmMailBody", ".zmail-content", ".mailContent",
    '[data-test-id="message-view-body-content"]', ".v-MailMessage-body",
    '[data-test-id="message-body"]', '[data-testid="message-body"]',
    ".message-body", "#messageBody", ".msgBody", // AOL / generic mail readers
    "#mailContentContainer", "#contentDiv", ".mailinfo .body", ".nui-msgbox-body",
  ].join(",");
  const QUOTE_SELECTORS = 'blockquote, .gmail_quote, .gmail_extra, .protonmail_quote, .tutanota_quote, .yahoo_quoted, [data-testid="quoted-message"]';
  const IGNORE_SELECTORS = `${HOST_TAG}, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"], textarea, script, style, template, [hidden], [inert], [aria-hidden="true"]`;

  function parent(node) {
    return node.parentElement || node.getRootNode()?.host || null;
  }

  function closest(node, selector) {
    for (let current = node; current?.nodeType === 1; current = parent(current)) {
      if (current.matches(selector)) return current;
    }
    return null;
  }

  function contains(ancestor, node) {
    for (let current = node; current; current = parent(current)) {
      if (current === ancestor) return true;
    }
    return false;
  }

  function isVisible(node) {
    if (!node?.isConnected || closest(node, IGNORE_SELECTORS)) return false;
    // checkVisibility covers hidden ancestors and opacity without requiring viewport intersection.
    if (node.checkVisibility && !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const view = node.ownerDocument.defaultView;
    for (let current = node; current; current = parent(current)) {
      const style = view.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return false;
    }
    // display:contents has no box of its own, but can contain a visible message.
    return Boolean(node.getClientRects().length || [...node.children].some((child) => child.getClientRects().length));
  }

  function collectRoots(doc) {
    const roots = [doc];
    let count = 0;
    for (const root of roots) {
      const walker = doc.createTreeWalker(root, 1);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        count += 1;
        if (count > MAX_ELEMENTS) return { roots, overflow: true };
        if (node.localName === HOST_TAG) continue;
        if (node.shadowRoot) roots.push(node.shadowRoot);
      }
    }
    return { roots, overflow: false };
  }

  function labelsFor(element) {
    const visibleText = element.innerText ?? element.textContent;
    return [visibleText, element.getAttribute("aria-label"), ...[...element.querySelectorAll("img[alt]")].filter(isVisible).map((img) => img.alt)]
      .filter(Boolean);
  }

  function scan(doc) {
    // Same-origin frames can also check whether the embedding mail pane is collapsed.
    let frame = null;
    try { frame = doc.defaultView?.frameElement; } catch { /* Cross-origin parents are inaccessible. */ }
    if (frame && !isVisible(frame)) return { roots: [doc], results: [], overflow: false };
    const { roots, overflow: treeOverflow } = collectRoots(doc);
    let overflow = treeOverflow;
    const allScopes = [];
    const controls = [];
    for (const root of roots) {
      allScopes.push(...[...root.querySelectorAll(MESSAGE_SELECTORS)].filter(isVisible));
      controls.push(...root.querySelectorAll('a, area, button, [role="link"], [role="button"]'));
    }
    if (controls.length > MAX_CONTROLS) overflow = true;
    // Keep entire mail bodies: nested wrappers must never split one message into two decisions.
    const scopes = allScopes.filter((scope) => !allScopes.some((other) => other !== scope && contains(other, scope)));
    const fallbackScope = doc.body;
    const records = new Map(scopes.map((scope) => [scope, { candidates: [], quotedCount: 0, branded: /\b(?:claude|anthropic)\b/i.test(scope.innerText ?? scope.textContent) }]));
    for (const control of controls.slice(0, MAX_CONTROLS)) {
      const labels = labelsFor(control);
      if (!labels.some(core.isSignInLabel)) continue;
      if (!isVisible(control)) continue;
      // An image/span/button inside an anchor represents that anchor, not an extra target.
      if (!control.matches("a, area") && closest(parent(control), "a[href], area[href]")) continue;
      const scope = scopes.find((item) => contains(item, control)) || fallbackScope;
      if (!scope) continue;
      if (!records.has(scope)) records.set(scope, { candidates: [], quotedCount: 0, branded: false });
      const record = records.get(scope);
      if (closest(control, QUOTE_SELECTORS)) {
        record.quotedCount += 1;
        continue;
      }
      record.candidates.push({ href: control.getAttribute("href") || "", labels });
    }
    const results = [];
    for (const [scope, record] of records) {
      const result = core.analyzeCandidates(record.candidates, { quotedCount: record.quotedCount, overflow });
      // Stay unobtrusive on unrelated mail; manual scan still returns an explicit missing state.
      if (!result.signInCount && !record.branded && !result.quotedCount) continue;
      results.push({ scope, ...result, fallback: scope === fallbackScope });
    }
    return { roots, results, overflow };
  }

  globalThis.ClaudeLinkDOM = Object.freeze({ HOST_TAG, scan, isVisible, contains });
})();
