(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const originalSetAnticipation = app.effects.setAnticipation;
  const originalStartTierEffects = app.effects.startTierEffects;
  const originalPresentCombination = app.effects.presentCombination;
  const nativeAnimate = globalThis.Element?.prototype?.animate;

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

  function parseTransformY(transform) {
    if (!transform || transform === "none") return 0;
    const direct = transform.match(/translate(?:3d|Y)?\([^,]*,?\s*(-?[\d.]+)px/i);
    if (direct) return Number(direct[1]) || 0;
    const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
    if (matrix3d) return Number(matrix3d[1].split(",")[13]) || 0;
    const matrix = transform.match(/^matrix\((.+)\)$/);
    if (matrix) return Number(matrix[1].split(",")[5]) || 0;
    return 0;
  }

  function mobileReelAnimation(element, keyframes, options = {}) {
    const frames = Array.from(keyframes || []);
    const duration = Math.max(0, Number(options.duration) || 0);
    const startY = parseTransformY(frames[0]?.transform || element.style.transform);
    const endY = parseTransformY(frames.at(-1)?.transform || element.style.transform);
    let frameId = null;
    let settled = false;
    let rejectFinished;
    let resolveFinished;
    const finished = new Promise((resolve, reject) => {
      resolveFinished = resolve;
      rejectFinished = reject;
    });

    element.style.transition = "none";
    element.style.willChange = "auto";
    element.style.transform = `translateY(${startY}px)`;

    const finish = () => {
      if (settled) return;
      settled = true;
      element.style.transform = `translateY(${endY}px)`;
      resolveFinished();
    };

    if (duration === 0 || frames.length >= 3 && duration <= 180) {
      frameId = globalThis.requestAnimationFrame?.(finish) ?? globalThis.setTimeout(finish, 0);
    } else {
      const startedAt = globalThis.performance?.now?.() ?? Date.now();
      const step = timestamp => {
        if (settled) return;
        const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / duration));
        const eased = 1 - Math.pow(1 - progress, 3);
        const y = startY + (endY - startY) * eased;
        element.style.transform = `translateY(${y}px)`;
        if (progress >= 1) finish();
        else frameId = globalThis.requestAnimationFrame(step);
      };
      frameId = globalThis.requestAnimationFrame(step);
    }

    return {
      finished,
      cancel() {
        if (settled) return;
        settled = true;
        if (frameId !== null) globalThis.cancelAnimationFrame?.(frameId);
        const error = typeof DOMException === "function" ? new DOMException("Animation cancelled", "AbortError") : new Error("Animation cancelled");
        rejectFinished(error);
      },
      play() {},
      pause() {},
    };
  }

  function installMobileReelAnimationShim() {
    if (!globalThis.Element?.prototype || !nativeAnimate || globalThis.Element.prototype.__communeMobileAnimateInstalled) return;
    Object.defineProperty(globalThis.Element.prototype, "__communeMobileAnimateInstalled", { value: true });
    globalThis.Element.prototype.animate = function animate(keyframes, options) {
      if (this.classList?.contains("reel-strip") && isMobileTuningActive()) {
        return mobileReelAnimation(this, keyframes, options);
      }
      return nativeAnimate.call(this, keyframes, options);
    };
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

  installMobileReelAnimationShim();
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