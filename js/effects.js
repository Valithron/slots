(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;

  function prefersReducedMotion() {
    return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function burstCoins(count, originElement, { reducedMotion = false, spread = 1 } = {}) {
    if (!originElement) return;
    const rect = originElement.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const particleCount = reducedMotion ? Math.min(8, count) : count;

    for (let index = 0; index < particleCount; index += 1) {
      const coin = document.createElement("div");
      coin.className = "coin-particle";
      coin.style.left = `${originX - 9}px`;
      coin.style.top = `${originY - 9}px`;

      const angle = Math.random() * Math.PI * 2;
      const distance = (90 + Math.random() * Math.min(globalThis.innerWidth || 360, 360)) * spread;
      coin.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
      coin.style.setProperty("--y", `${Math.sin(angle) * distance + 100}px`);
      coin.style.setProperty("--r", `${(Math.random() * 900 - 450).toFixed(0)}deg`);
      coin.style.setProperty("--duration", `${800 + Math.random() * 750}ms`);

      document.body.appendChild(coin);
      globalThis.setTimeout(() => coin.remove(), 1750);
    }
  }

  function burstConfetti(count, originElement, { reducedMotion = false } = {}) {
    if (!originElement || reducedMotion) return;
    const rect = originElement.getBoundingClientRect();
    const particleCount = Math.min(72, count);

    for (let index = 0; index < particleCount; index += 1) {
      const piece = document.createElement("div");
      piece.className = "commune-confetti";
      piece.style.left = `${rect.left + Math.random() * rect.width}px`;
      piece.style.top = `${rect.top + rect.height * 0.18}px`;
      piece.style.setProperty("--accent", CONFIG.characterAccentColors[index % CONFIG.characterAccentColors.length]);
      piece.style.setProperty("--x", `${(Math.random() - 0.5) * rect.width * 0.9}px`);
      piece.style.setProperty("--y", `${rect.height * (0.65 + Math.random() * 0.45)}px`);
      piece.style.setProperty("--r", `${Math.random() * 1080 - 540}deg`);
      piece.style.setProperty("--duration", `${1500 + Math.random() * 1000}ms`);
      document.body.appendChild(piece);
      globalThis.setTimeout(() => piece.remove(), 2700);
    }
  }

  function flashScreen(screenFlash, strength = "normal") {
    if (!screenFlash) return;
    screenFlash.className = `screen-flash ${strength}`;
    void screenFlash.offsetWidth;
    screenFlash.classList.add("active");
  }

  function reelImpact(machine, reelFrame, reelIndex, { reducedMotion = false } = {}) {
    if (reducedMotion || !machine) return;
    const className = reelIndex === 2 ? "reel-impact-strong" : "reel-impact";
    machine.classList.remove(className);
    reelFrame?.classList.remove(`impact-reel-${reelIndex + 1}`);
    void machine.offsetWidth;
    machine.classList.add(className);
    reelFrame?.classList.add(`impact-reel-${reelIndex + 1}`);
    globalThis.setTimeout(() => {
      machine.classList.remove(className);
      reelFrame?.classList.remove(`impact-reel-${reelIndex + 1}`);
    }, CONFIG.reelAnimation.impactClassDuration);
  }

  function setAnticipation(machine, reelElements, level, active) {
    if (!machine) return;
    machine.classList.toggle("is-anticipating", active);
    machine.classList.toggle("anticipation-mild", active && level === "mild");
    machine.classList.toggle("anticipation-strong", active && level === "strong");
    reelElements?.[2]?.viewport.classList.toggle("is-anticipated", active);
  }

  function startTierEffects({ tier, elements, reducedMotion }) {
    const { machine, reelFrame, screenFlash, celebrationLayer } = elements;
    machine?.classList.add(`is-win-${tier}`);
    reelFrame?.classList.add(`win-tier-${tier}`);

    const particleCounts = { nice: 30, big: 52, jackpot: 72 };
    burstCoins(particleCounts[tier] || 16, reelFrame, {
      reducedMotion,
      spread: tier === "jackpot" ? 1.35 : tier === "big" ? 1.18 : 1,
    });

    if (tier === "big" || tier === "jackpot") flashScreen(screenFlash, tier);
    if (tier === "jackpot") burstConfetti(64, celebrationLayer || reelFrame, { reducedMotion });

    return () => {
      machine?.classList.remove(`is-win-${tier}`);
      reelFrame?.classList.remove(`win-tier-${tier}`);
    };
  }

  function wait(milliseconds, { signal } = {}) {
    return new Promise(resolve => {
      if (signal?.aborted || milliseconds <= 0) {
        resolve({ skipped: Boolean(signal?.aborted) });
        return;
      }

      let settled = false;
      const finish = skipped => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve({ skipped });
      };
      const onAbort = () => finish(true);
      const timer = globalThis.setTimeout(() => finish(false), milliseconds);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  function countUp({ totalWin, duration, onUpdate, signal }) {
    return new Promise(resolve => {
      const requestFrame = globalThis.requestAnimationFrame || (callback => globalThis.setTimeout(() => callback(Date.now()), 16));
      const cancelFrame = globalThis.cancelAnimationFrame || globalThis.clearTimeout;
      const clock = globalThis.performance?.now ? () => globalThis.performance.now() : () => Date.now();
      const startedAt = clock();
      let frameId = null;
      let settled = false;

      const finish = skipped => {
        if (settled) return;
        settled = true;
        if (frameId !== null) cancelFrame(frameId);
        signal?.removeEventListener("abort", onAbort);
        onUpdate(totalWin);
        resolve({ skipped });
      };
      const onAbort = () => finish(true);

      if (signal?.aborted || duration <= 0) {
        finish(Boolean(signal?.aborted));
        return;
      }

      signal?.addEventListener("abort", onAbort, { once: true });
      const step = timestamp => {
        const progress = Math.min(1, (timestamp - startedAt) / duration);
        onUpdate(app.gameFlow.getCountUpValue(totalWin, progress));
        if (progress >= 1) finish(false);
        else frameId = requestFrame(step);
      };
      onUpdate(0);
      frameId = requestFrame(step);
    });
  }

  app.effects = {
    prefersReducedMotion,
    burstCoins,
    burstConfetti,
    flashScreen,
    reelImpact,
    setAnticipation,
    startTierEffects,
    wait,
    countUp,
  };
})();
