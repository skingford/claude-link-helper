(() => {
  const button = document.querySelector("#scan");
  const status = document.querySelector("#status");
  function show(text, state = "neutral") {
    status.textContent = text;
    status.dataset.state = state;
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    show("正在检查当前页面的邮件…");
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
        // activeTab cannot grant access to arbitrary cross-origin child frames.
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["core.js", "dom.js", "content.js"] });
        limitedFrames = true;
      }
      const results = await chrome.scripting.executeScript({
        target: limitedFrames ? { tabId: tab.id } : { tabId: tab.id, allFrames: true },
        func: () => globalThis.ClaudeLinkHelper?.scan() || null,
      });
      const totals = { ready: 0, multiple: 0, unverified: 0, quoted: 0, overflow: 0 };
      for (const { result } of results) {
        for (const key of Object.keys(totals)) totals[key] += result?.[key] || 0;
      }
      const suffix = limitedFrames ? " 部分内嵌内容受浏览器限制，未能检查。" : "";
      if (totals.overflow) show("页面内容过多，无法完整核验。请单独打开目标邮件。" + suffix, "warning");
      else if (totals.multiple || totals.unverified) show("发现多个登录链接或无法验证的 Sign in 链接，请查看邮件旁的提示。" + suffix, "warning");
      else if (totals.ready) show(`已找到 ${totals.ready} 处可复制的邮件。关闭此面板，在对应邮件旁点击复制。` + suffix, limitedFrames ? "warning" : "success");
      else if (totals.quoted) show("只在引用内容中找到 Sign in，请打开原始邮件。" + suffix, "warning");
      else show("未找到 Claude 登录链接。请展开完整邮件正文后重试。" + suffix, "warning");
    } catch {
      show("无法读取当前页面。请刷新邮箱并检查插件的网站访问权限，然后重试。", "error");
    } finally {
      button.disabled = false;
    }
  });
})();
