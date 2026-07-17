(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;

  function createUI() {
    const elements = {
      reelGrid: document.getElementById("reelGrid"),
      reelFrame: document.getElementById("reelFrame"),
      stage: document.querySelector(".stage"),
      machine: document.getElementById("machine"),
      coinsValue: document.getElementById("coinsValue"),
      betValue: document.getElementById("betValue"),
      winValue: document.getElementById("winValue"),
      lineBetValue: document.getElementById("lineBetValue"),
      message: document.getElementById("message"),
      spinButton: document.getElementById("spinButton"),
      betDown: document.getElementById("betDown"),
      betUp: document.getElementById("betUp"),
      refillButton: document.getElementById("refillButton"),
      soundButton: document.getElementById("soundButton"),
      soundState: document.getElementById("soundState"),
      helpButton: document.getElementById("helpButton"),
      helpModal: document.getElementById("helpModal"),
      closeHelp: document.getElementById("closeHelp"),
      paylinesSvg: document.getElementById("paylines"),
      screenFlash: document.getElementById("screenFlash"),
      paytable: document.getElementById("paytable"),
      celebrationLayer: document.getElementById("celebrationLayer"),
      celebrationPanel: document.getElementById("celebrationPanel"),
      celebrationTitle: document.getElementById("celebrationTitle"),
      celebrationName: document.getElementById("celebrationName"),
      celebrationAmount: document.getElementById("celebrationAmount"),
      celebrationAnnouncer: document.getElementById("celebrationAnnouncer"),
    };

    const formatNumber = value => Math.floor(value).toLocaleString();

    function buildPaytable() {
      elements.paytable.innerHTML = CONFIG.paytableOrder.map(key => {
        const symbol = CONFIG.symbols[key];
        return `<div class="pay-card"><img src="${symbol.image}" alt=""><div><strong>${symbol.name}</strong><span>3 × ${symbol.payout}</span></div></div>`;
      }).join("");
    }

    function updateDisplay({ state, phase, lineBet, totalBet }) {
      const busy = phase !== GAME_STATES.IDLE;
      const celebrating = phase === GAME_STATES.CELEBRATING;
      elements.coinsValue.textContent = formatNumber(state.coins);
      elements.betValue.textContent = formatNumber(totalBet);
      elements.winValue.textContent = formatNumber(state.lastWin);
      elements.lineBetValue.textContent = lineBet;
      elements.soundState.textContent = state.sound ? "On" : "Off";
      elements.betDown.disabled = busy || state.lineBetIndex === 0;
      elements.betUp.disabled = busy || state.lineBetIndex === CONFIG.lineBets.length - 1;
      elements.refillButton.disabled = busy;
      elements.spinButton.disabled = busy && !celebrating;
      setPrimaryAction(celebrating ? "skip" : "spin");
    }

    function setControlsDisabled(disabled, state, { allowSpin = false } = {}) {
      elements.spinButton.disabled = disabled && !allowSpin;
      elements.betDown.disabled = disabled || state.lineBetIndex === 0;
      elements.betUp.disabled = disabled || state.lineBetIndex === CONFIG.lineBets.length - 1;
      elements.refillButton.disabled = disabled;
    }

    function setPrimaryAction(mode) {
      const skipping = mode === "skip";
      elements.spinButton.textContent = skipping ? "Skip" : "Spin";
      elements.spinButton.setAttribute("aria-label", skipping ? "Skip win celebration" : "Spin the reels");
      elements.spinButton.classList.toggle("is-skip", skipping);
    }

    function setWinDisplay(value) {
      elements.winValue.textContent = formatNumber(value);
    }

    function showMessage(text, isWin = false) {
      elements.message.textContent = text;
      elements.message.classList.toggle("win", isWin);
    }

    function clearWins() {
      document.querySelectorAll(".symbol-cell.is-win").forEach(cell => cell.classList.remove("is-win"));
      document.querySelectorAll(".payline.active").forEach(line => {
        line.classList.remove("active", "tier-small", "tier-nice", "tier-big", "tier-jackpot");
      });
      elements.reelFrame.classList.remove("win-tier-small", "win-tier-nice", "win-tier-big", "win-tier-jackpot");
      elements.message.classList.remove("win");
    }

    function markWins(wins, reelController, tier = "small") {
      const currentTopStops = reelController.getCurrentTopStops();
      const reelElements = reelController.getReelElements();
      elements.reelFrame.classList.add(`win-tier-${tier}`);

      wins.forEach(win => {
        elements.paylinesSvg.querySelector(`[data-line="${win.lineIndex}"]`)?.classList.add("active", `tier-${tier}`);

        win.rows.forEach((row, reelIndex) => {
          const stop = (currentTopStops[reelIndex] + row) % CONFIG.reels[reelIndex].length;
          const cells = reelElements[reelIndex].strip.querySelectorAll(`.symbol-cell[data-stop="${stop}"]`);
          cells.forEach(cell => cell.classList.add("is-win"));
        });
      });
    }

    function setSpinning(active) {
      elements.machine.classList.toggle("is-spinning", active);
    }

    function setAnticipation(level, active) {
      elements.machine.classList.toggle("is-anticipating", active);
      elements.machine.classList.toggle("anticipation-mild", active && level === "mild");
      elements.machine.classList.toggle("anticipation-strong", active && level === "strong");
    }

    function showCelebration({ tier, dominantName }) {
      const labels = {
        nice: "Nice Win",
        big: "Big Win",
        jackpot: "Commune Jackpot",
      };
      elements.celebrationLayer.className = `celebration-layer is-visible tier-${tier}`;
      elements.celebrationLayer.setAttribute("aria-hidden", "false");
      elements.celebrationTitle.textContent = labels[tier] || "Win";
      elements.celebrationAmount.textContent = "0";
      elements.celebrationName.textContent = dominantName ? `${dominantName} leads the win` : "";
      elements.celebrationName.hidden = !dominantName;
    }

    function updateCelebrationAmount(value) {
      const formatted = formatNumber(value);
      elements.celebrationAmount.textContent = formatted;
      setWinDisplay(value);
    }

    function hideCelebration() {
      elements.celebrationLayer.className = "celebration-layer";
      elements.celebrationLayer.setAttribute("aria-hidden", "true");
    }

    function announceCelebration({ tier, totalWin }) {
      const labels = {
        nice: "Nice Win",
        big: "Big Win",
        jackpot: "Commune Jackpot",
      };
      elements.celebrationAnnouncer.textContent = `${labels[tier] || "Win"}: ${formatNumber(totalWin)} coins.`;
    }

    function openHelp() {
      elements.helpModal.classList.add("open");
    }

    function closeHelp() {
      elements.helpModal.classList.remove("open");
    }

    function isHelpOpen() {
      return elements.helpModal.classList.contains("open");
    }

    return {
      elements,
      formatNumber,
      buildPaytable,
      updateDisplay,
      setControlsDisabled,
      setPrimaryAction,
      setWinDisplay,
      showMessage,
      clearWins,
      markWins,
      setSpinning,
      setAnticipation,
      showCelebration,
      updateCelebrationAmount,
      hideCelebration,
      announceCelebration,
      openHelp,
      closeHelp,
      isHelpOpen,
    };
  }

  app.ui = { createUI };
})();
