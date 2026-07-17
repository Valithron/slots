(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const {
    repeatCount,
    baseCopy,
    cycles,
    durations,
    legacyDurations,
    finalApproachDuration,
    stopOvershootRatio,
    settleDuration,
    impactClassDuration,
    tickMinimumInterval,
  } = CONFIG.reelAnimation;

  const now = () => globalThis.performance?.now?.() ?? Date.now();

  function createDeferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
  }

  function createManualStopState({
    enabled = CONFIG.features.manualStops,
    reelCount = CONFIG.reels.length,
    minimumStopTimes = CONFIG.manualStops.minimumStopTimes,
    minimumGapBetweenStops = CONFIG.manualStops.minimumGapBetweenStops,
  } = {}) {
    let spinStartedAt = 0;
    let reels = [];

    function begin(startedAt = 0) {
      spinStartedAt = startedAt;
      reels = Array.from({ length: reelCount }, (_, reelIndex) => ({
        reelIndex,
        status: "spinning",
        requested: false,
        requestedAt: null,
        completedAt: null,
      }));
      return snapshot();
    }

    function isRequestable(reel) {
      return !reel.requested && (reel.status === "spinning" || reel.status === "anticipating");
    }

    function requestNextStop(requestedAt = 0) {
      if (!enabled) return { accepted: false, reelIndex: null, reason: "disabled" };
      const reel = reels.find(isRequestable);
      if (!reel) return { accepted: false, reelIndex: null, reason: "no-unresolved-reel" };
      reel.requested = true;
      reel.requestedAt = requestedAt;
      return {
        accepted: true,
        reelIndex: reel.reelIndex,
        queued: reel.status !== "anticipating" && requestedAt < spinStartedAt + (minimumStopTimes[reel.reelIndex] || 0),
      };
    }

    function markStatus(reelIndex, status) {
      if (!reels[reelIndex] || reels[reelIndex].status === "stopped") return false;
      reels[reelIndex].status = status;
      return true;
    }

    function markCompleted(reelIndex, completedAt = 0) {
      if (!reels[reelIndex]) return false;
      reels[reelIndex].status = "stopped";
      reels[reelIndex].completedAt = completedAt;
      return true;
    }

    function getEarliestStopTime(reelIndex) {
      const minimum = spinStartedAt + (minimumStopTimes[reelIndex] || 0);
      if (reelIndex === 0) return minimum;
      const previousCompleted = reels[reelIndex - 1]?.completedAt;
      return Number.isFinite(previousCompleted)
        ? Math.max(minimum, previousCompleted + minimumGapBetweenStops)
        : Number.POSITIVE_INFINITY;
    }

    function getNextStopIndex() {
      const next = reels.find(isRequestable);
      return next ? next.reelIndex : null;
    }

    function snapshot() {
      const requestedStops = reels.filter(reel => reel.requested).length;
      const completedStops = reels.filter(reel => reel.status === "stopped").length;
      return {
        enabled,
        requestedStops,
        completedStops,
        queuedStops: reels.filter(reel => reel.requested && reel.status !== "stopped").length,
        nextStopIndex: getNextStopIndex(),
        reels: reels.map(reel => ({ ...reel })),
      };
    }

    begin(0);
    return {
      begin,
      requestNextStop,
      markStatus,
      markCompleted,
      getEarliestStopTime,
      getNextStopIndex,
      snapshot,
      isRequested: reelIndex => reels[reelIndex]?.requested === true,
      getReel: reelIndex => reels[reelIndex] ? { ...reels[reelIndex] } : null,
    };
  }

  function parseTranslateY(transform, fallback = 0) {
    if (!transform || transform === "none") return fallback;
    const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
    if (matrix3d) {
      const values = matrix3d[1].split(",").map(Number);
      return Number.isFinite(values[13]) ? values[13] : fallback;
    }
    const matrix = transform.match(/^matrix\((.+)\)$/);
    if (matrix) {
      const values = matrix[1].split(",").map(Number);
      return Number.isFinite(values[5]) ? values[5] : fallback;
    }
    const translate = transform.match(/translate3d\([^,]+,\s*(-?[\d.]+)px/i) || transform.match(/translateY\(\s*(-?[\d.]+)px/i);
    return translate && Number.isFinite(Number(translate[1])) ? Number(translate[1]) : fallback;
  }

  function createReelController({ reelGrid, playTick, playReelStop, onReelStop, onAnticipation, onManualStopStateChange }) {
    let currentTopStops = CONFIG.reels.map(() => 0);
    const reelElements = [];
    let activeSpin = null;

    function getCellSize() {
      return reelElements[0]?.viewport.getBoundingClientRect().width || 100;
    }

    function assertStripBuffer() {
      const longestPathCopy = baseCopy + Math.max(...cycles) + 1;
      if (longestPathCopy + 2 >= repeatCount) {
        throw new Error("Reel repeatCount does not leave a safe visible-row buffer.");
      }
    }

    function translateForIndex(index, cellSize = getCellSize()) {
      return `translate3d(0, ${-index * cellSize}px, 0)`;
    }

    function setStripPosition(reelIndex, topStop) {
      const reelElement = reelElements[reelIndex];
      if (!reelElement) return;

      const length = CONFIG.reels[reelIndex].length;
      const absoluteIndex = baseCopy * length + topStop;
      reelElement.strip.getAnimations?.().forEach(animation => animation.cancel());
      reelElement.strip.style.transition = "none";
      reelElement.strip.style.transform = translateForIndex(absoluteIndex);
    }

    function buildReels() {
      assertStripBuffer();
      reelGrid.innerHTML = "";
      reelElements.length = 0;

      CONFIG.reels.forEach((reelMap, reelIndex) => {
        const viewport = document.createElement("div");
        viewport.className = "reel";
        viewport.dataset.reel = reelIndex;
        viewport.setAttribute("aria-label", `Reel ${reelIndex + 1}`);

        const strip = document.createElement("div");
        strip.className = "reel-strip";
        strip.dataset.reel = reelIndex;

        for (let copy = 0; copy < repeatCount; copy += 1) {
          reelMap.forEach((symbolKey, stopIndex) => {
            const symbol = CONFIG.symbols[symbolKey];
            const cell = document.createElement("div");
            cell.className = "symbol-cell";
            cell.dataset.symbol = symbolKey;
            cell.dataset.stop = stopIndex;
            cell.dataset.copy = copy;
            cell.innerHTML = `<img src="${symbol.image}" alt="${symbol.name}">`;
            strip.appendChild(cell);
          });
        }

        const stopFlash = document.createElement("div");
        stopFlash.className = "reel-stop-flash";
        stopFlash.setAttribute("aria-hidden", "true");

        viewport.append(strip, stopFlash);
        reelGrid.appendChild(viewport);
        reelElements.push({ viewport, strip, stopFlash });
      });

      return new Promise(resolve => {
        requestAnimationFrame(() => {
          currentTopStops = randomStops();
          reelElements.forEach((_, index) => setStripPosition(index, currentTopStops[index]));
          resolve();
        });
      });
    }

    function randomStops(rng = Math.random) {
      return CONFIG.reels.map(reel => Math.floor(rng() * reel.length));
    }

    function getVisibleMatrix() {
      return app.payouts.matrixFromStops(currentTopStops);
    }

    function wait(milliseconds) {
      if (milliseconds <= 0) return Promise.resolve();
      return new Promise(resolve => window.setTimeout(resolve, milliseconds));
    }

    function waitUntil(timestamp) {
      return wait(Math.max(0, timestamp - now()));
    }

    function startKeyframeAnimation(strip, keyframes, options) {
      const finalTransform = keyframes[keyframes.length - 1].transform;
      let cancelled = false;
      let timer = null;
      let resolveFallback = null;

      if (typeof strip.animate === "function") {
        const animation = strip.animate(keyframes, { fill: "forwards", ...options });
        const finished = animation.finished.catch(() => undefined).then(() => {
          if (!cancelled) strip.style.transform = finalTransform;
          animation.cancel();
        });
        return {
          finished,
          cancelAtCurrent(fallbackY = 0) {
            if (cancelled) return fallbackY;
            const transform = globalThis.getComputedStyle?.(strip).transform || strip.style.transform;
            const currentY = parseTranslateY(transform, fallbackY);
            cancelled = true;
            animation.cancel();
            strip.style.transition = "none";
            strip.style.transform = `translate3d(0, ${currentY}px, 0)`;
            return currentY;
          },
        };
      }

      const finished = new Promise(resolve => {
        resolveFallback = resolve;
        strip.style.transition = `transform ${options.duration}ms ${options.easing || "ease"}`;
        strip.style.transform = finalTransform;
        timer = window.setTimeout(resolve, options.duration);
      }).then(() => { if (!cancelled) strip.style.transform = finalTransform; });

      return {
        finished,
        cancelAtCurrent(fallbackY = 0) {
          if (cancelled) return fallbackY;
          const transform = globalThis.getComputedStyle?.(strip).transform || strip.style.transform;
          const currentY = parseTranslateY(transform, fallbackY);
          cancelled = true;
          if (timer !== null) window.clearTimeout(timer);
          resolveFallback?.();
          strip.style.transition = "none";
          strip.style.transform = `translate3d(0, ${currentY}px, 0)`;
          return currentY;
        },
      };
    }

    async function animateKeyframes(strip, keyframes, options) {
      const animation = startKeyframeAnimation(strip, keyframes, options);
      await animation.finished;
    }

    function startTicks(reelIndex, duration, anticipation) {
      const pitchBoost = anticipation === "strong" && reelIndex === 2 ? 0.18 : 0;
      const interval = Math.max(tickMinimumInterval, duration / (22 + reelIndex * 4));
      return window.setInterval(() => {
        playTick(0.84 + reelIndex * 0.08 + pitchBoost);
      }, interval);
    }

    function notifyManualState() {
      onManualStopStateChange?.(activeSpin?.manualState.snapshot() || {
        enabled: false,
        requestedStops: 0,
        completedStops: 0,
        queuedStops: 0,
        nextStopIndex: null,
        reels: [],
      });
    }

    async function waitForManualActivation(reelIndex, request) {
      const minimumTime = activeSpin.startedAt + (CONFIG.manualStops.minimumStopTimes[reelIndex] || 0);
      await waitUntil(minimumTime);
      if (reelIndex > 0) {
        await activeSpin.completions[reelIndex - 1].promise;
        await wait(CONFIG.manualStops.minimumGapBetweenStops);
      }
      return request;
    }

    function adjustedTargetGeometry({ reelIndex, targetStop, currentY, cellSize, reducedMotion }) {
      const length = CONFIG.reels[reelIndex].length;
      let targetIndex = (baseCopy + cycles[reelIndex]) * length + targetStop;
      let targetY = -targetIndex * cellSize;
      const lead = cellSize * (reducedMotion ? 0.08 : 0.18);
      let preStopY = targetY + lead;
      while (preStopY >= currentY - cellSize * 0.75) {
        targetIndex += length;
        targetY = -targetIndex * cellSize;
        preStopY = targetY + lead;
      }
      const maximumIndex = repeatCount * length - CONFIG.rowCount;
      if (targetIndex > maximumIndex) throw new Error("Manual stop exceeded the safe repeated reel buffer.");
      return { targetIndex, targetY, preStopY };
    }

    async function runAnticipationHold(reelIndex, anticipation, { reducedMotion, manualRequest }) {
      if (reelIndex !== 2 || anticipation === "none") return;
      const baseDelay = CONFIG.anticipation.delays[anticipation] || 0;
      const fullDelay = Math.round(baseDelay * (reducedMotion ? CONFIG.reducedMotion.anticipationDelayScale : 1));
      const minimumMap = reducedMotion ? CONFIG.manualStops.reducedMotionAnticipationHold : CONFIG.manualStops.anticipationMinimumHold;
      const minimumHold = Math.min(fullDelay, minimumMap[anticipation] || 0);
      const holdStartedAt = now();

      activeSpin.manualState.markStatus(reelIndex, "anticipating");
      notifyManualState();
      onAnticipation?.(anticipation, true);

      if (manualRequest || activeSpin.manualState.isRequested(reelIndex)) {
        await wait(minimumHold);
      } else {
        await Promise.race([wait(fullDelay), activeSpin.requests[reelIndex].promise]);
        await wait(Math.max(0, minimumHold - (now() - holdStartedAt)));
      }
    }

    async function animateReelTo(reelIndex, targetStop, { anticipation, reducedMotion, dramaEnabled }) {
      const { strip, viewport } = reelElements[reelIndex];
      const length = CONFIG.reels[reelIndex].length;
      const cellSize = getCellSize();
      const configuredDuration = dramaEnabled ? durations[reelIndex] : legacyDurations[reelIndex];
      const reelDuration = Math.round(configuredDuration * (reducedMotion ? CONFIG.reducedMotion.reelDurationScale : 1));
      const startIndex = baseCopy * length + currentTopStops[reelIndex];
      const automaticTargetIndex = (baseCopy + cycles[reelIndex]) * length + targetStop;
      const startY = -startIndex * cellSize;
      const automaticTargetY = -automaticTargetIndex * cellSize;
      const distance = automaticTargetY - startY;
      const automaticPreStopY = automaticTargetY + cellSize * (reducedMotion ? 0.08 : 0.18);
      const tickTimer = startTicks(reelIndex, reelDuration, anticipation);

      viewport.classList.toggle("is-accelerating", dramaEnabled);
      const cruiseFrames = dramaEnabled ? [
        { transform: `translate3d(0, ${startY}px, 0)`, offset: 0, easing: "cubic-bezier(.55,.02,.82,.42)" },
        { transform: `translate3d(0, ${startY + distance * 0.2}px, 0)`, offset: 0.16, easing: "linear" },
        { transform: `translate3d(0, ${startY + distance * 0.76}px, 0)`, offset: 0.64, easing: "cubic-bezier(.13,.72,.16,1)" },
        { transform: `translate3d(0, ${automaticPreStopY}px, 0)`, offset: 1 },
      ] : [
        { transform: `translate3d(0, ${startY}px, 0)` },
        { transform: `translate3d(0, ${automaticPreStopY}px, 0)` },
      ];
      const cruise = startKeyframeAnimation(strip, cruiseFrames, {
        duration: reelDuration,
        easing: dramaEnabled ? "linear" : "cubic-bezier(.08,.76,.16,1)",
      });

      const manualActivation = activeSpin.manualEnabled
        ? activeSpin.requests[reelIndex].promise.then(request => waitForManualActivation(reelIndex, request)).then(request => ({ type: "manual", request }))
        : new Promise(() => {});
      const outcome = await Promise.race([cruise.finished.then(() => ({ type: "automatic" })), manualActivation]);

      let targetY = automaticTargetY;
      let preStopY = automaticPreStopY;
      let manualRequest = null;
      if (outcome.type === "manual") {
        manualRequest = outcome.request;
        const currentY = cruise.cancelAtCurrent(startY);
        const adjusted = adjustedTargetGeometry({ reelIndex, targetStop, currentY, cellSize, reducedMotion });
        targetY = adjusted.targetY;
        preStopY = adjusted.preStopY;
        const shortenedDuration = reducedMotion ? CONFIG.manualStops.reducedMotionApproachDuration : CONFIG.manualStops.finalApproachDuration;
        await animateKeyframes(strip, [
          { transform: `translate3d(0, ${currentY}px, 0)` },
          { transform: `translate3d(0, ${preStopY}px, 0)` },
        ], { duration: shortenedDuration, easing: "cubic-bezier(.12,.72,.18,1)" });
      }

      viewport.classList.remove("is-accelerating");
      window.clearInterval(tickTimer);
      await runAnticipationHold(reelIndex, anticipation, { reducedMotion, manualRequest });
      activeSpin.manualState.markStatus(reelIndex, "approaching");
      notifyManualState();

      const overshootRatio = stopOvershootRatio * (reducedMotion ? CONFIG.reducedMotion.settleDistanceScale : 1);
      const overshootY = targetY - cellSize * overshootRatio;
      const approachDuration = Math.round(finalApproachDuration * (reducedMotion ? 0.72 : 1));

      await animateKeyframes(strip, [
        { transform: `translate3d(0, ${preStopY}px, 0)` },
        { transform: `translate3d(0, ${overshootY}px, 0)` },
      ], { duration: approachDuration, easing: "cubic-bezier(.2,.78,.16,1)" });

      viewport.classList.remove("is-stop-impact");
      void viewport.offsetWidth;
      viewport.classList.add("is-stop-impact");
      playReelStop(reelIndex, anticipation === "strong" && reelIndex === 2 ? 1.18 : 1);
      onReelStop?.(reelIndex, { anticipation, reducedMotion, manual: Boolean(manualRequest) });

      const settleY = targetY + cellSize * overshootRatio * 0.22;
      await animateKeyframes(strip, [
        { transform: `translate3d(0, ${overshootY}px, 0)`, offset: 0 },
        { transform: `translate3d(0, ${settleY}px, 0)`, offset: 0.58 },
        { transform: `translate3d(0, ${targetY}px, 0)`, offset: 1 },
      ], { duration: Math.round(settleDuration * (reducedMotion ? 0.66 : 1)), easing: "ease-out" });

      window.setTimeout(() => viewport.classList.remove("is-stop-impact"), impactClassDuration);
      if (reelIndex === 2 && anticipation !== "none") onAnticipation?.(anticipation, false);
      setStripPosition(reelIndex, targetStop);
      activeSpin.manualState.markCompleted(reelIndex, now());
      activeSpin.completions[reelIndex].resolve(activeSpin.manualState.getReel(reelIndex));
      notifyManualState();
    }

    async function spinTo(targetStops, {
      anticipation = "none",
      reducedMotion = false,
      dramaEnabled = CONFIG.features.spinDrama,
      manualStopsEnabled = CONFIG.features.manualStops,
    } = {}) {
      if (!Array.isArray(targetStops) || targetStops.length !== CONFIG.reels.length) {
        throw new Error(`Expected ${CONFIG.reels.length} target stops.`);
      }

      const startedAt = now();
      const manualState = createManualStopState({ enabled: Boolean(manualStopsEnabled) });
      manualState.begin(startedAt);
      activeSpin = {
        startedAt,
        manualEnabled: Boolean(manualStopsEnabled),
        manualState,
        requests: CONFIG.reels.map(() => createDeferred()),
        completions: CONFIG.reels.map(() => createDeferred()),
      };
      notifyManualState();

      try {
        await Promise.all(targetStops.map((stop, index) => animateReelTo(index, stop, { anticipation, reducedMotion, dramaEnabled })));
        currentTopStops = [...targetStops];
      } finally {
        activeSpin = null;
        notifyManualState();
      }
    }

    function requestNextStop() {
      if (!activeSpin?.manualEnabled) return { accepted: false, reelIndex: null, reason: "disabled" };
      const request = activeSpin.manualState.requestNextStop(now());
      if (request.accepted) activeSpin.requests[request.reelIndex].resolve(request);
      notifyManualState();
      return request;
    }

    function reposition() {
      reelElements.forEach((_, index) => setStripPosition(index, currentTopStops[index]));
    }

    function getCurrentTopStops() {
      return [...currentTopStops];
    }

    function getReelElements() {
      return reelElements;
    }

    function getManualStopState() {
      return activeSpin?.manualState.snapshot() || {
        enabled: false,
        requestedStops: 0,
        completedStops: 0,
        queuedStops: 0,
        nextStopIndex: null,
        reels: [],
      };
    }

    return {
      buildReels,
      randomStops,
      getVisibleMatrix,
      spinTo,
      requestNextStop,
      reposition,
      getCurrentTopStops,
      getReelElements,
      getManualStopState,
    };
  }

  app.reels = { createManualStopState, parseTranslateY, createReelController };
})();