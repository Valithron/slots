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

  function createReelController({ reelGrid, playTick, playReelStop, onReelStop, onAnticipation }) {
    let currentTopStops = CONFIG.reels.map(() => 0);
    const reelElements = [];

    function getCellSize() {
      return reelElements[0]?.viewport.getBoundingClientRect().width || 100;
    }

    function assertStripBuffer() {
      const longestPathCopy = baseCopy + Math.max(...cycles);
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

    function animateKeyframes(strip, keyframes, options) {
      if (typeof strip.animate === "function") {
        const animation = strip.animate(keyframes, { fill: "forwards", ...options });
        return animation.finished.catch(() => undefined).then(() => {
          strip.style.transform = keyframes[keyframes.length - 1].transform;
          animation.cancel();
        });
      }

      const finalFrame = keyframes[keyframes.length - 1];
      strip.style.transition = `transform ${options.duration}ms ${options.easing || "ease"}`;
      strip.style.transform = finalFrame.transform;
      return wait(options.duration);
    }

    function startTicks(reelIndex, duration, anticipation) {
      const pitchBoost = anticipation === "strong" && reelIndex === 2 ? 0.18 : 0;
      const interval = Math.max(tickMinimumInterval, duration / (22 + reelIndex * 4));
      return window.setInterval(() => {
        playTick(0.84 + reelIndex * 0.08 + pitchBoost);
      }, interval);
    }

    async function animateReelTo(reelIndex, targetStop, { anticipation, reducedMotion, dramaEnabled }) {
      const { strip, viewport } = reelElements[reelIndex];
      const length = CONFIG.reels[reelIndex].length;
      const cellSize = getCellSize();
      const configuredDuration = dramaEnabled ? durations[reelIndex] : legacyDurations[reelIndex];
      const reelDuration = Math.round(configuredDuration * (reducedMotion ? CONFIG.reducedMotion.reelDurationScale : 1));
      const startIndex = baseCopy * length + currentTopStops[reelIndex];
      const targetIndex = (baseCopy + cycles[reelIndex]) * length + targetStop;
      const startY = -startIndex * cellSize;
      const targetY = -targetIndex * cellSize;
      const distance = targetY - startY;
      const preStopY = targetY + cellSize * (reducedMotion ? 0.08 : 0.18);
      const tickTimer = startTicks(reelIndex, reelDuration, anticipation);

      viewport.classList.toggle("is-accelerating", dramaEnabled);
      if (!dramaEnabled) {
        await animateKeyframes(strip, [
          { transform: `translate3d(0, ${startY}px, 0)` },
          { transform: `translate3d(0, ${targetY}px, 0)` },
        ], { duration: reelDuration, easing: "cubic-bezier(.08,.76,.16,1)" });
        window.clearInterval(tickTimer);
        playReelStop(reelIndex, 1);
        setStripPosition(reelIndex, targetStop);
        return;
      }

      await animateKeyframes(strip, [
        { transform: `translate3d(0, ${startY}px, 0)`, offset: 0, easing: "cubic-bezier(.55,.02,.82,.42)" },
        { transform: `translate3d(0, ${startY + distance * 0.2}px, 0)`, offset: 0.16, easing: "linear" },
        { transform: `translate3d(0, ${startY + distance * 0.76}px, 0)`, offset: 0.64, easing: "cubic-bezier(.13,.72,.16,1)" },
        { transform: `translate3d(0, ${preStopY}px, 0)`, offset: 1 },
      ], { duration: reelDuration, easing: "linear" });
      viewport.classList.remove("is-accelerating");
      window.clearInterval(tickTimer);

      if (reelIndex === 2 && anticipation !== "none") {
        const baseDelay = CONFIG.anticipation.delays[anticipation] || 0;
        const anticipationDelay = Math.round(baseDelay * (reducedMotion ? CONFIG.reducedMotion.anticipationDelayScale : 1));
        onAnticipation?.(anticipation, true);
        await wait(anticipationDelay);
      }

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
      onReelStop?.(reelIndex, { anticipation, reducedMotion });

      const settleY = targetY + cellSize * overshootRatio * 0.22;
      await animateKeyframes(strip, [
        { transform: `translate3d(0, ${overshootY}px, 0)`, offset: 0 },
        { transform: `translate3d(0, ${settleY}px, 0)`, offset: 0.58 },
        { transform: `translate3d(0, ${targetY}px, 0)`, offset: 1 },
      ], { duration: Math.round(settleDuration * (reducedMotion ? 0.66 : 1)), easing: "ease-out" });

      window.setTimeout(() => viewport.classList.remove("is-stop-impact"), impactClassDuration);
      if (reelIndex === 2 && anticipation !== "none") onAnticipation?.(anticipation, false);
      setStripPosition(reelIndex, targetStop);
    }

    async function spinTo(targetStops, { anticipation = "none", reducedMotion = false, dramaEnabled = CONFIG.features.spinDrama } = {}) {
      if (!Array.isArray(targetStops) || targetStops.length !== CONFIG.reels.length) {
        throw new Error(`Expected ${CONFIG.reels.length} target stops.`);
      }

      await Promise.all(targetStops.map((stop, index) => {
        return animateReelTo(index, stop, { anticipation, reducedMotion, dramaEnabled });
      }));
      currentTopStops = [...targetStops];
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

    return {
      buildReels,
      randomStops,
      getVisibleMatrix,
      spinTo,
      reposition,
      getCurrentTopStops,
      getReelElements,
    };
  }

  app.reels = { createReelController };
})();
