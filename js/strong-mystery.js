(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const core = app.strongMysteryCore;
  if (!core) throw new Error("Strong Mystery core failed to load.");
  core.installCore();
  core.installPresentation();
  app.strongMystery = {
    installed: true,
    ids: core.STRONG_IDS,
    chaosEffects: core.CHAOS_EFFECTS,
    names: core.STRONG_NAMES,
    createSelectionPayload: core.createSelectionPayload,
    createStrongInstance: core.createStrongInstance,
    normalizeStrongInstance: core.normalizeStrongInstance,
    normalizeStrongQueue: core.normalizeStrongQueue,
    applyStrongCandidate: core.applyStrongCandidate,
    persistentReward: core.persistentReward,
    isTrulyBlankResult: core.trulyBlank,
    strongLabel: core.strongLabel,
    install: () => true,
  };
})();
