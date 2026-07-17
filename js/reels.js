(() => {
  "use strict";

  const app = window.CommuneFortune;
  const { CONFIG } = app;
  const { repeatCount, baseCopy } = CONFIG.reelAnimation;

  function createReelController({ reelGrid, playTick, playReelStop }) {
    let currentTopStops = [0, 0, 0];
    const reelElements = [];

    function getCellSize() {
      return reelElements[0]?.viewport.getBoundingClientRect().width || 100;
    }

    function setStripPosition(reelIndex, topStop, animate, extraCycles = 0, duration = 0) {
      const reelElement = reelElements[reelIndex];
      if (!reelElement) return;

      const { strip } = reelElement;
      const length = CONFIG.reels[reelIndex].length;
      const cellSize = getCellSize();
      const absoluteIndex = (baseCopy + extraCycles) * length + topStop;

      strip.style.transition = animate
        ? `transform ${duration}ms cubic-bezier(.12,.72,.14,1)`
        : "none";
      strip.style.transform = `translate3d(0, ${-absoluteIndex * cellSize}px, 0)`;
    }

    function buildReels() {
      reelGrid.innerHTML = "";
      reelElements.length = 0;

      CONFIG.reels.forEach((reelMap, reelIndex) => {
        const viewport = document.createElement("div");
        viewport.className = "reel";
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

        viewport.appendChild(strip);
        reelGrid.appendChild(viewport);
        reelElements.push({ viewport, strip });
      });

      return new Promise(resolve => {
        requestAnimationFrame(() => {
          currentTopStops = randomStops();
          reelElements.forEach((_, index) => setStripPosition(index, currentTopStops[index], false));
          resolve();
        });
      });
    }

    function randomStops() {
      return CONFIG.reels.map(reel => Math.floor(Math.random() * reel.length));
    }

    function getVisibleMatrix() {
      const matrix = [[], [], []];

      currentTopStops.forEach((topStop, reelIndex) => {
        const reel = CONFIG.reels[reelIndex];
        for (let row = 0; row < 3; row += 1) {
          matrix[row][reelIndex] = reel[(topStop + row) % reel.length];
        }
      });

      return matrix;
    }

    function animateReelTo(reelIndex, targetStop, duration) {
      return new Promise(resolve => {
        const { strip } = reelElements[reelIndex];
        const length = CONFIG.reels[reelIndex].length;
        const cellSize = getCellSize();
        const cycles = 3 + reelIndex;
        const absoluteIndex = (baseCopy + cycles) * length + targetStop;

        strip.style.transition = `transform ${duration}ms cubic-bezier(.08,.76,.16,1)`;
        strip.style.transform = `translate3d(0, ${-absoluteIndex * cellSize}px, 0)`;

        let clicks = 0;
        const clickInterval = window.setInterval(() => {
          playTick(0.8 + reelIndex * 0.08);
          clicks += 1;
          if (clicks > 12 + reelIndex * 3) window.clearInterval(clickInterval);
        }, Math.max(65, duration / (18 + reelIndex * 3)));

        window.setTimeout(() => {
          window.clearInterval(clickInterval);
          playReelStop(reelIndex);
          strip.style.transition = "transform 120ms cubic-bezier(.2,1.7,.5,1)";
          strip.style.transform = `translate3d(0, ${-(absoluteIndex * cellSize - cellSize * .06)}px, 0)`;

          window.setTimeout(() => {
            strip.style.transition = "transform 120ms ease-out";
            strip.style.transform = `translate3d(0, ${-absoluteIndex * cellSize}px, 0)`;

            window.setTimeout(() => {
              setStripPosition(reelIndex, targetStop, false);
              resolve();
            }, 130);
          }, 120);
        }, duration);
      });
    }

    async function spinTo(targetStops) {
      const promises = targetStops.map((stop, index) => {
        return animateReelTo(index, stop, CONFIG.reelAnimation.durations[index]);
      });

      await Promise.all(promises);
      currentTopStops = [...targetStops];
    }

    function reposition() {
      reelElements.forEach((_, index) => setStripPosition(index, currentTopStops[index], false));
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
