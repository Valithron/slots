(() => {
  "use strict";

  const SECTION_SELECTOR = '[data-help-section="commune-combos"]';

  function exposeCommuneCombos() {
    const section = document.querySelector(SECTION_SELECTOR);
    if (!section) return false;

    section.querySelectorAll(".combination-disclosure").forEach(disclosure => {
      const reference = disclosure.querySelector("#combinationReference");
      if (reference) disclosure.replaceWith(reference);
      else disclosure.remove();
    });

    const reference = section.querySelector("#combinationReference");
    if (!reference) return false;
    reference.hidden = false;
    reference.removeAttribute("aria-hidden");
    return true;
  }

  function install() {
    exposeCommuneCombos();
    const observer = new MutationObserver(() => exposeCommuneCombos());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", install, { once: true })
    : install();
})();
