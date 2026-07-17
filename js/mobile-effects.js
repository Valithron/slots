(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const originalSetAnticipation = app.effects.setAnticipation;

  function getSystemReducedPreference() {
    return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function getCurrentState() {
    try {
      return app.game?.getState?.() || app.persistence?.loadState?.() || { visualEffectsMode: "auto" };
    } catch {
      return { visualEffectsMode: "auto" };
    }
  }

  function getVisualEffectsPreference(state = getCurrentState()) {
    return app.visualEffectsSettings.normalizeVisualEffectsMode(state?.visualEffectsMode);
  }

  function getMotionMode(state = getCurrentState(), systemReduced = getSystemReducedPreference()) {
    const preference = getVisualEffectsPreference(state);
    if (preference === "full") return "full";
    if (preference === "reduced") return "reduced";
    return systemReduced ? "reduced" : "full";
  }

  function isReducedMotionActive(state = getCurrentState(), systemReduced = getSystemReducedPreference()) {
    return getMotionMode(state, systemReduced) === "reduced";
  }

  function isMobileTuningActive({
    width = globalThis.innerWidth || 1024,
    coarsePointer = Boolean(globalThis.matchMedia?.("(pointer: coarse)").matches),
  } = {}) {
    return width <= 768 || coarsePointer;
  }

  function getTactileProfile(state = getCurrentState(), environment = {}) {
    const reduced = isReducedMotionActive(state, environment.systemReduced ?? getSystemReducedPreference());
    const mobile = isMobileTuningActive(environment);
    if (reduced) {
      return {
        mode: "reduced",
        mobile,
        cabinetMotion: false,
        localizedMotion: true,
        repeatedPulse: false,
        visibleImpact: true,
        classDuration: 180,
      };
    }
    return {
      mode: "full",
      mobile,
      cabinetMotion: true,
      localizedMotion: true,
      repeatedPulse: true,
      visibleImpact: true,
      classDuration: mobile ? 300 : CONFIG.reelAnimation.impactClassDuration,
    };
  }

  function applyMotionClasses(machine, reelFrame, state = getCurrentState(), environment = {}) {
    const profile = getTactileProfile(state, environment);
    [machine, reelFrame].forEach(element => {
      element?.classList.toggle("motion-reduced", profile.mode === "reduced");
      element?.classList.toggle("motion-full", profile.mode === "full");
      element?.classList.toggle("tactile-mobile", profile.mobile);
    });
    return profile;
  }

  function reelImpact(machine, reelFrame, reelIndex, options = {}) {
    if (!machine) return;
    const state = getCurrentState();
    const environment = {
      systemReduced: options.reducedMotion ?? getSystemReducedPreference(),
    };
    const profile = applyMotionClasses(machine, reelFrame, state, environment);
    const cabinetClass = reelIndex === 2 ? "reel-impact-strong" : "reel-impact";
    const frameClass = `impact-reel-${reelIndex + 1}`;

    machine.classList.remove("reel-impact", "reel-impact-strong");
    reelFrame?.classList.remove("impact-reduced", "impact-full", frameClass);
    void machine.offsetWidth;

    if (profile.cabinetMotion) machine.classList.add(cabinetClass);
    reelFrame?.classList.add(profile.mode === "reduced" ? "impact-reduced" : "impact-full", frameClass);

    globalThis.setTimeout(() => {
      machine.classList.remove("reel-impact", "reel-impact-strong");
      reelFrame?.classList.remove("impact-reduced", "impact-full", frameClass);
    }, profile.classDuration);
  }

  function setAnticipation(machine, reelElements, level, active) {
    const profile = applyMotionClasses(machine, machine?.querySelector?.(".reel-frame"));
    originalSetAnticipation(machine, reelElements, level, active);
    machine?.classList.toggle("anticipation-static", active && !profile.repeatedPulse);
  }

  function setVisualEffectsMode(state, mode) {
    if (!state || typeof state !== "object") return "auto";
    state.visualEffectsMode = app.visualEffectsSettings.normalizeVisualEffectsMode(mode);
    app.persistence.saveState(state);
    return state.visualEffectsMode;
  }

  app.effects.getSystemReducedPreference = getSystemReducedPreference;
  app.effects.getVisualEffectsPreference = getVisualEffectsPreference;
  app.effects.getMotionMode = getMotionMode;
  app.effects.isReducedMotionActive = isReducedMotionActive;
  app.effects.isMobileTuningActive = isMobileTuningActive;
  app.effects.getTactileProfile = getTactileProfile;
  app.effects.applyMotionClasses = applyMotionClasses;
  app.effects.setVisualEffectsMode = setVisualEffectsMode;
  app.effects.prefersReducedMotion = isReducedMotionActive;
  app.effects.reelImpact = reelImpact;
  app.effects.setAnticipation = setAnticipation;
})();