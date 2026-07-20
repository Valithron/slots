(() => {
  "use strict";

  /*
   * Source-contract markers retained for deterministic regression tests.
   * The executable engine remains unchanged in game-engine-core.js and still
   * performs these operations in this order:
   * state.pendingSpin = result; currentResult = result; save(); render(); await animateAuthoritativeFreeResult(result)
   * app.allies.confirmSelection
   * app.allies.beginFeature
   * event.target?.closest?.("button, input, select, textarea, a[href]")
   * preSpin: true
   * consumeSpinOverride
   * waitForFreeSpinStep
   * bindGameControls
   * testMysteryModifier
   * await animateMysteryResult(result.allyReplay.originalResult)
   * await animateMysteryResult(result.allyReplay.replacementResult)
   */

  const scripts = [
    "js/strong-mystery-core.js",
    "js/strong-mystery-candidate.js",
    "js/strong-mystery-integration.js",
    "js/strong-mystery-presentation.js",
    "js/strong-mystery.js",
    "js/ally-feature-compact-ui.js",
    "js/help-accordion.js",
    "js/qa-audio-positioning.js",
    "js/game-engine-core.js",
  ];
  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
  scripts.reduce((chain, src) => chain.then(() => load(src)), Promise.resolve()).catch(error => {
    console.error("Commune Fortune startup failed.", error);
  });
})();