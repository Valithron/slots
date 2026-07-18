(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const originalSetAnticipation = app.effects.setAnticipation;
  const originalStartTierEffects = app.effects.startTierEffects;
  const originalPresentCombination = app.effects.presentCombination;

  function getSystemReducedPreference() {
    return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function getVisualEffectsPreference(state = null) {
    if (state && Object.hasOwn(state, "visualEffectsMode")) {
      return app.visualEffectsSettings.normalizeVisualEffectsMode(state.visualEffectsMode);
    }
    return app.visualEffectsSettings.getMode();
  }

  function getMotionMode(state = null, systemReduced = getSystemReducedPreference()) {
    const preference = getVisualEffectsPreference(state);
    if (preference === "full") return "full";
    if (preference === "reduced") return "reduced";
    return systemReduced ? "reduced" : "full";
  }

  function isReducedMotionActive(state = null, systemReduced = getSystemReducedPreference()) {
    return getMotionMode(state, systemReduced) === "reduced";
  }

  function isMobileTuningActive({
    width = globalThis.innerWidth || 1024,
    coarsePointer = Boolean(globalThis.matchMedia?.("(pointer: coarse)").matches),
  } = {}) {
    return width <= 768 || coarsePointer;
  }

  function getTactileProfile(state = null, environment = {}) {
    const reduced = isReducedMotionActive(state, environment.systemReduced ?? getSystemReducedPreference());
    const mobile = isMobileTuningActive(environment);
    if (mobile) {
      return {
        mode: reduced ? "reduced" : "full",
        mobile: true,
        cabinetMotion: false,
        localizedMotion: false,
        repeatedPulse: false,
        visibleImpact: true,
        classDuration: 150,
      };
    }
    if (reduced) {
      return {
        mode: "reduced",
        mobile: false,
        cabinetMotion: false,
        localizedMotion: true,
        repeatedPulse: false,
        visibleImpact: true,
        classDuration: 180,
      };
    }
    return {
      mode: "full",
      mobile: false,
      cabinetMotion: true,
      localizedMotion: true,
      repeatedPulse: true,
      visibleImpact: true,
      classDuration: CONFIG.reelAnimation.impactClassDuration,
    };
  }

  function applyMotionClasses(machine, reelFrame, state = null, environment = {}) {
    const profile = getTactileProfile(state, environment);
    document.documentElement?.classList.toggle("mobile-stable-rendering", profile.mobile);
    [machine, reelFrame].forEach(element => {
      element?.classList.toggle("motion-reduced", profile.mode === "reduced");
      element?.classList.toggle("motion-full", profile.mode === "full");
      element?.classList.toggle("tactile-mobile", profile.mobile);
    });
    return profile;
  }

  function reelImpact(machine, reelFrame, reelIndex, options = {}) {
    if (!machine) return;
    const profile = applyMotionClasses(machine, reelFrame, null, {
      systemReduced: options.reducedMotion ?? getSystemReducedPreference(),
    });
    const cabinetClass = reelIndex === 2 ? "reel-impact-strong" : "reel-impact";
    const frameClass = `impact-reel-${reelIndex + 1}`;
    machine.classList.remove("reel-impact", "reel-impact-strong");
    reelFrame?.classList.remove("impact-reduced", "impact-full", frameClass);
    if (!profile.mobile) void machine.offsetWidth;
    if (profile.cabinetMotion) machine.classList.add(cabinetClass);
    if (!profile.mobile) reelFrame?.classList.add(profile.mode === "reduced" ? "impact-reduced" : "impact-full", frameClass);
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

  function startTierEffects(options) {
    if (!isMobileTuningActive()) return originalStartTierEffects(options);
    return originalStartTierEffects({ ...options, reducedMotion: true });
  }

  function presentCombination(options) {
    if (!isMobileTuningActive()) return originalPresentCombination(options);
    return originalPresentCombination({ ...options, reducedMotion: true });
  }

  function setVisualEffectsMode(mode) {
    const normalized = app.visualEffectsSettings.setMode(mode);
    applyMotionClasses(document.getElementById("machine"), document.getElementById("reelFrame"));
    return normalized;
  }

  applyMotionClasses(document.getElementById("machine"), document.getElementById("reelFrame"));

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
  app.effects.startTierEffects = startTierEffects;
  app.effects.presentCombination = presentCombination;
})();