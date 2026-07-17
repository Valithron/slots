(() => {
  "use strict";

  const app = window.CommuneFortune;
  const { CONFIG } = app;

  function createUI() {
    const elements = {
      reelGrid: document.getElementById("reelGrid"),
      reelFrame: document.getElementById("reelFrame"),
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
    };

    const formatNumber = value => Math.floor(value).toLocaleString();

    function buildPaytable() {
      elements.paytable.innerHTML = CONFIG.paytableOrder.map(key => {
        const symbol = CONFIG.symbols[key];
        return `<div class="pay-card"><img src="${symbol.image}" alt=""><div><strong>${symbol.name}</strong><span>3 × ${symbol.payout}</span></div></div>`;
      }).join("");
    }

    function updateDisplay({ state, spinning, lineBet, totalBet }) {
      elements.coinsValue.textContent = formatNumber(state.coins);
      elements.betValue.textContent = formatNumber(totalBet);
      elements.winValue.textContent = formatNumber(state.lastWin);
      elements.lineBetValue.textContent = lineBet;
      elements.soundState.textContent = state.sound ? "On" : "Off";
      elements.betDown.disabled = spinning || state.lineBetIndex === 0;
      elements.betUp.disabled = spinning || state.lineBetIndex === CONFIG.lineBets.length - 1;
      elements.spinButton.disabled = spinning;
    }

    function setControlsDisabled(disabled, state) {
      elements.spinButton.disabled = disabled;
      elements.betDown.disabled = disabled || state.lineBetIndex === 0;
      elements.betUp.disabled = disabled || state.lineBetIndex === CONFIG.lineBets.length - 1;
      elements.refillButton.disabled = disabled;
    }

    function showMessage(text, isWin = false) {
      elements.message.textContent = text;
      elements.message.classList.toggle("win", isWin);
    }

    function clearWins() {
      document.querySelectorAll(".symbol-cell.is-win").forEach(cell => cell.classList.remove("is-win"));
      document.querySelectorAll(".payline.active").forEach(line => line.classList.remove("active"));
      elements.message.classList.remove("win");
    }

    function markWins(wins, reelController) {
      const currentTopStops = reelController.getCurrentTopStops();
      const reelElements = reelController.getReelElements();

      wins.forEach(win => {
        elements.paylinesSvg.querySelector(`[data-line="${win.lineIndex}"]`)?.classList.add("active");

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
      showMessage,
      clearWins,
      markWins,
      setSpinning,
      openHelp,
      closeHelp,
      isHelpOpen,
    };
  }

  app.ui = { createUI };
})();
