(() => {
  const scanButton = document.querySelector("#scan");
  const copyButton = document.querySelector("#copy");
  const status = document.querySelector("#status");
  let selection = null;

  function show(text, state = "neutral") {
    status.textContent = text;
    status.dataset.state = state;
  }

  function clearSelection() {
    selection = null;
    copyButton.hidden = true;
    copyButton.disabled = true;
    copyButton.textContent = "复制 Claude 登录链接";
  }

  function summarize(results) {
    const totals = { ready: 0, multiple: 0, unverified: 0, quoted: 0, overflow: 0 };
    for (const { result } of results) {
      for (const key of Object.keys(totals)) totals[key] += result?.[key] || 0;
    }
    const complete = results.length > 0 && results.every(({ result }) => result && Number.isInteger(result.revision) && typeof result.copyable === "boolean");
    const blocked = totals.multiple || totals.unverified || totals.overflow;
    const candidates = results.filter(({ result }) => result?.copyable);
    const candidate = complete && !blocked && totals.ready === 1 && candidates.length === 1 && candidates[0].documentId
      ? candidates[0] : null;
    return { totals, complete, candidate };
  }

  async function readCounts(tabId, limitedFrames) {
    return chrome.scripting.executeScript({
      target: limitedFrames ? { tabId } : { tabId, allFrames: true },
      func: () => globalThis.ClaudeLinkHelper?.scan() || null,
    });
  }

  scanButton.addEventListener("click", async () => {
    clearSelection();
    scanButton.disabled = true;
    show("正在检测…");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !/^https?:\/\//.test(tab.url || "")) {
        show("请先打开网页邮箱中的 Claude 登录邮件，再点击检测。", "warning");
        return;
      }
      let limitedFrames = false;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["core.js", "dom.js", "content.js"] });
      } catch {
        // activeTab may not cover cross-origin child frames. Keep the scope explicit.
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["core.js", "dom.js", "content.js"] });
        limitedFrames = true;
      }
      const { totals, candidate, complete } = summarize(await readCounts(tab.id, limitedFrames));
      const suffix = limitedFrames ? " 部分内嵌内容未能检查。" : "";
      if (totals.overflow) show("页面内容过多，无法完整核验。请单独打开目标邮件。" + suffix, "warning");
      else if (totals.multiple) show("发现多个登录链接，请查看邮件旁的提示。" + suffix, "warning");
      else if (totals.unverified) show("有链接无法验证，请查看邮件旁的提示。" + suffix, "warning");
      else if (!complete) show("页面内容已更新，请刷新邮箱后重新检测。" + suffix, "warning");
      else if (candidate) {
        selection = { tabId: tab.id, frameId: candidate.frameId, documentId: candidate.documentId, revision: candidate.result.revision, limitedFrames };
        copyButton.hidden = false;
        copyButton.disabled = false;
        show("已找到 1 处可复制链接。" + suffix, limitedFrames ? "warning" : "success");
      } else if (totals.ready > 1) show(`已找到 ${totals.ready} 处可复制的邮件，请到目标邮件旁复制。` + suffix, "warning");
      else if (totals.ready) show("已找到链接，请刷新邮箱后重新检测，以启用弹窗复制。" + suffix, "warning");
      else if (totals.quoted) show("只在引用内容中找到 Sign in，请打开原始邮件。" + suffix, "warning");
      else show("未找到登录链接，请展开完整正文后重试。" + suffix, "warning");
    } catch {
      show("无法读取当前页面。请刷新邮箱并检查插件的网站访问权限，然后重试。", "error");
    } finally {
      scanButton.disabled = false;
    }
  });

  async function writeClipboard(value) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
      }
    } catch { /* Fall back to the extension document's clipboardWrite permission. */ }
    const previous = document.activeElement;
    const input = document.createElement("textarea");
    input.value = value;
    input.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
    document.body.append(input);
    try {
      input.select();
      if (!document.execCommand("copy")) throw new Error("clipboard-unavailable");
    } finally {
      input.remove();
      previous?.focus?.({ preventScroll: true });
    }
  }

  copyButton.addEventListener("click", async () => {
    if (!selection || copyButton.disabled) return;
    const expected = selection;
    copyButton.disabled = true;
    scanButton.disabled = true;
    show("正在核对当前邮件…");
    const changed = () => {
      clearSelection();
      show("邮件或链接已变化，请重新检测后再复制。", "warning");
    };
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== expected.tabId) { changed(); return; }
      // Recheck all readable frames so a second link cannot appear unnoticed.
      const { candidate } = summarize(await readCounts(expected.tabId, expected.limitedFrames));
      if (!candidate || candidate.documentId !== expected.documentId || candidate.frameId !== expected.frameId || candidate.result.revision !== expected.revision) {
        changed();
        return;
      }
      // Pin the request to the original document, not a reused frame after navigation.
      const [response] = await chrome.scripting.executeScript({
        target: { tabId: expected.tabId, documentIds: [expected.documentId] },
        func: (revision) => globalThis.ClaudeLinkHelper?.readCopyCandidate(revision) || { status: "changed" },
        args: [expected.revision],
      });
      const result = response?.result;
      if (result?.status !== "ready" || !globalThis.ClaudeLinkCore.inspectUrl(result.url).ok) { changed(); return; }
      // The URL is only transferred locally on this click and is never saved in UI state.
      try {
        await writeClipboard(result.url);
        copyButton.textContent = "已复制";
        show("登录链接已复制，可粘贴到需要登录的浏览器。", "success");
      } catch {
        show("复制失败，请重试或使用邮件旁的复制按钮。", "error");
      }
    } catch {
      clearSelection();
      show("无法读取当前邮件，请重新检测后再复制。", "error");
    } finally {
      scanButton.disabled = false;
      copyButton.disabled = !selection;
    }
  });
})();
