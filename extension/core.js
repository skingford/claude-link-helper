/* Pure, offline link classification. Shared by the isolated content script and tests. */
(() => {
  if (globalThis.ClaudeLinkCore) return;

  const MAX_URL_LENGTH = 16384;
  const MAX_WRAPPERS = 4;
  const LABEL = /^(?:(?:sign[\s-]*in|log[\s-]*in)(?:\s+(?:to|with)(?:\s+your)?\s+claude(?:\.ai)?(?:\s+account)?)?|(?:登录|登入)(?:\s*claude(?:\.ai)?)?)$/i;

  function normalizeLabel(value) {
    return String(value || "").normalize("NFKC")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .replace(/\s+/g, " ").trim().replace(/\s*[→➜›»]\s*$/, "");
  }

  function isSignInLabel(value) {
    return LABEL.test(normalizeLabel(value));
  }

  function parseHttps(value) {
    if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return null;
    const raw = value.trim();
    // Do not let the URL parser silently repair control characters or backslashes.
    if (!/^https:\/\//i.test(raw) || /[\u0000-\u0020\u007f\\]/.test(raw)) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
      return { raw, url };
    } catch {
      return null;
    }
  }

  function wrapperTarget(url) {
    let keys;
    if (url.hostname === "safelinks.protection.outlook.com" || url.hostname.endsWith(".safelinks.protection.outlook.com")) {
      keys = ["url"];
    } else if (["www.google.com", "google.com", "www.google.com.hk"].includes(url.hostname) && url.pathname === "/url") {
      keys = ["q", "url"];
    } else {
      return { reason: "unrecognized-host" };
    }
    const values = keys.flatMap((key) => url.searchParams.getAll(key));
    const unique = [...new Set(values)];
    // Reject duplicate/conflicting parameters instead of guessing a redirect target.
    if (unique.length !== 1 || !unique[0]) return { reason: "ambiguous-redirect" };
    return { value: unique[0] };
  }

  function isLoginDestination(url) {
    if (url.hostname !== "claude.ai") return false;
    const path = url.pathname.replace(/\/$/, "");
    if (!["/magic-link", "/login", "/auth/verify", "/auth/callback"].includes(path)) return false;
    const params = new URLSearchParams(url.search);
    const hashParams = new URLSearchParams(url.hash.slice(1));
    const hasToken = ["token", "ticket", "code", "login_token", "magic_link_token"].some((key) => params.get(key) || hashParams.get(key));
    // Some mail versions carry the opaque token directly in the magic-link fragment.
    return hasToken || (path === "/magic-link" && /^#[A-Za-z0-9_%+./~-]+={0,2}$/.test(url.hash));
  }

  function inspectUrl(value) {
    let current = value;
    for (let depth = 0; depth <= MAX_WRAPPERS; depth += 1) {
      const parsed = parseHttps(current);
      if (!parsed) return { ok: false, reason: "invalid-url" };
      const { raw, url } = parsed;
      if (url.hostname === "claude.ai") {
        return isLoginDestination(url)
          ? { ok: true, url: raw, unwrapped: depth > 0 }
          : { ok: false, reason: "not-login-link" };
      }
      const next = wrapperTarget(url);
      if (!next.value) return { ok: false, reason: next.reason };
      current = next.value;
    }
    return { ok: false, reason: "redirect-depth" };
  }

  function analyzeCandidates(candidates, { quotedCount = 0, overflow = false } = {}) {
    const unique = new Map();
    let rejectedCount = 0;
    let signInCount = 0;
    for (const candidate of candidates) {
      if (!candidate.labels.some(isSignInLabel)) continue;
      signInCount += 1;
      const inspected = inspectUrl(candidate.href);
      if (!inspected.ok) {
        rejectedCount += 1;
        continue;
      }
      unique.set(inspected.url, inspected);
    }
    const links = [...unique.values()];
    let status = "missing";
    if (overflow) status = "overflow";
    else if (links.length > 1) status = "multiple";
    else if (rejectedCount > 0) status = "unverified";
    else if (links.length === 1) status = "ready";
    else if (quotedCount > 0) status = "quoted";
    return { status, links, signInCount, rejectedCount, quotedCount };
  }

  globalThis.ClaudeLinkCore = Object.freeze({ normalizeLabel, isSignInLabel, inspectUrl, analyzeCandidates });
})();
