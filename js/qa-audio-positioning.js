(() => {
  "use strict";

  const qaMode = /(?:^|[?&])qa=(?:ally|audio)(?:&|$)/i.test(globalThis.location?.search || "");
  if (!qaMode || !globalThis.document) return;

  function installCollisionGuard() {
    const audioPanel = document.getElementById("audioQaStatus");
    const qaPanel = document.querySelector(".qa-panel");
    if (!audioPanel || !qaPanel || audioPanel.dataset.qaCollisionGuard === "true") return false;

    const qaBadge = qaPanel.querySelector(".qa-badge");
    audioPanel.dataset.qaCollisionGuard = "true";

    const collapsePrimaryPanel = () => {
      document.body.classList.toggle("qa-audio-status-open", audioPanel.open);
      if (!audioPanel.open) return;
      qaPanel.classList.add("is-collapsed");
      qaBadge?.setAttribute("aria-expanded", "false");
    };

    audioPanel.addEventListener("toggle", collapsePrimaryPanel);
    qaBadge?.addEventListener("click", () => {
      queueMicrotask(() => {
        if (!qaPanel.classList.contains("is-collapsed")) audioPanel.open = false;
      });
    });

    collapsePrimaryPanel();
    return true;
  }

  function mount() {
    if (installCollisionGuard()) return;
    const observer = new MutationObserver(() => {
      if (!installCollisionGuard()) return;
      observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", mount, { once: true })
    : mount();
})();