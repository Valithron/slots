(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const core = app.strongMysteryCore;
  const { STRONG_IDS, STRONG_NAMES, CHAOS_EFFECTS, PAYLINE_NAMES, runtime, clone, isStrongId,
    randomIndex, normalizeStrongQueue, strongLabel } = core;

  function installPresentation() {
    if (app.audio?.createAudio) {
      const originalCreateAudio = app.audio.createAudio;
      app.audio.createAudio = getSoundEnabled => {
        const audio = originalCreateAudio(getSoundEnabled);
        return Object.assign(audio, {
          playStrongMysteryReveal: audio.playMysteryModifierReveal,
          playGoldenPaylineSelection: audio.playMysteryModifierReveal,
          playGoldenPaylineHit: () => audio.playTierSound("nice"),
          playFortuneFlood: audio.playMysteryFortuneBurst,
          playScatterMagnet: () => audio.playMysteryToken(4),
          playCommuneGathering: audio.playGroupReaction,
          playSevenfoldThree: () => audio.playTierSound("nice"),
          playSevenfoldSeven: () => audio.playTierSound("big"),
          playFullFortune: () => audio.playTierSound("big"),
          playCommuneChaos: audio.playMysteryModifierReveal,
          playWildSpark: audio.playAwakening,
          playScatterSpark: () => audio.playMysteryToken(2),
        });
      };
    }

    if (app.qa?.enabled) {
      const originalBindQa = app.qa.bindGameControls;
      app.qa.bindGameControls = controls => {
        runtime.qaQueueHandler = (id, selection = {}) => {
          if (!isStrongId(id)) return { ok: false, message: "Choose a valid Strong Mystery Modifier." };
          runtime.qaQueuedSelection = selection;
          CONFIG.mystery.normalModifierPool.push(id);
          try { return controls.queueMysteryModifier(id); }
          finally {
            CONFIG.mystery.normalModifierPool.splice(CONFIG.mystery.normalModifierPool.lastIndexOf(id), 1);
            runtime.qaQueuedSelection = null;
          }
        };
        return originalBindQa({ ...controls, queueStrongModifier: runtime.qaQueueHandler });
      };
      app.qa.forceStrongAward = (id, selection = {}) => {
        if (!isStrongId(id)) return false;
        runtime.qaForcedAwardSelection = clone(selection);
        return app.qa.forceMysteryCount(4, id);
      };
      const mountStrongQa = () => {
        const body = document.querySelector(".qa-panel .qa-panel-body");
        if (!body || document.getElementById("strongMysteryQa")) return;
        const section = document.createElement("section");
        section.className = "qa-section";
        section.id = "strongMysteryQa";
        section.innerHTML = `
          <h3>Strong Mystery QA</h3>
          <p>Uses production queue, result, persistence, Rescue, and settlement paths.</p>
          <label class="qa-field">Strong Modifier
            <select data-strong-id>${STRONG_IDS.map(id => `<option value="${id}">${STRONG_NAMES[id]}</option>`).join("")}</select>
          </label>
          <label class="qa-field">Payline
            <select data-strong-line>${PAYLINE_NAMES.map((name, index) => `<option value="${index}">${name}</option>`).join("")}</select>
          </label>
          <label class="qa-field">Character
            <select data-strong-character>${CONFIG.characterPresentation.allMembers.map(key => `<option value="${key}">${CONFIG.symbols[key].name}</option>`).join("")}</select>
          </label>
          <label class="qa-field">Gathering
            <select data-strong-group>${CONFIG.combinations.definitions.map(item => `<option value="${item.id}">${item.name}</option>`).join("")}</select>
          </label>
          <div class="qa-row qa-row-split">
            <button type="button" data-strong-action="queue">Queue Strong</button>
            <button type="button" data-strong-action="award">Force 4+ Award</button>
          </div>
          <div class="qa-row qa-row-split">
            <button type="button" data-strong-action="repeat">Queue Twice</button>
            <button type="button" data-strong-action="random">Random Strong Draw</button>
          </div>
          <button type="button" data-strong-action="chaos">Queue Chaos: Spotlight + Lucky Line + Scatter Spark</button>`;
        body.insertBefore(section, body.querySelector(".qa-danger"));
        const selection = () => ({
          lineIndex: Number(section.querySelector("[data-strong-line]")?.value || 0),
          luckyLineIndex: Number(section.querySelector("[data-strong-line]")?.value || 0),
          characterKey: section.querySelector("[data-strong-character]")?.value,
          spotlightCharacterKey: section.querySelector("[data-strong-character]")?.value,
          combinationId: section.querySelector("[data-strong-group]")?.value,
        });
        section.addEventListener("click", event => {
          const action = event.target.closest("button[data-strong-action]")?.dataset.strongAction;
          if (!action) return;
          const id = section.querySelector("[data-strong-id]")?.value;
          const payload = selection();
          if (action === "queue") runtime.qaQueueHandler?.(id, payload);
          else if (action === "award") app.qa.forceStrongAward(id, payload);
          else if (action === "repeat") { runtime.qaQueueHandler?.(id, payload); runtime.qaQueueHandler?.(id, payload); }
          else if (action === "random") runtime.qaQueueHandler?.(STRONG_IDS[randomIndex(STRONG_IDS.length)], {});
          else if (action === "chaos") runtime.qaQueueHandler?.("commune-chaos", { ...payload, effects: ["chaos-spotlight", "lucky-line", "scatter-spark"] });
        });
      };
      document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mountStrongQa, { once: true }) : mountStrongQa();
    }

    if (app.ui?.createUI) {
      const originalCreateUI = app.ui.createUI;
      app.ui.createUI = () => {
        const ui = originalCreateUI();
        const baseApply = ui.applyMysteryResultVisuals;
        const baseClear = ui.clearFeaturePresentation;
        const baseCallouts = ui.buildMysteryCallouts;
        const baseUpdateDisplay = ui.updateDisplay;
        ui.updateDisplay = model => {
          baseUpdateDisplay(model);
          const active = normalizeStrongQueue(model.state?.pendingSpin?.strongMysteryActiveModifiers);
          if (!active.length) return;
          const hud = ui.elements.mysteryHud;
          const queue = ui.elements.mysteryModifierQueue;
          const label = ui.elements.mysteryQueueLabel;
          const chips = ui.elements.mysteryModifierChips;
          if (hud) hud.hidden = false;
          if (queue) queue.hidden = false;
          if (label) label.textContent = "Active This Spin";
          if (chips) {
            const existing = chips.innerHTML;
            const strongHtml = active.map(instance => `<span class="mystery-chip is-strong" style="--mystery-chip-accent:${CONFIG.characterAccentColorMap.MYS}">${strongLabel(instance)}</span>`).join("");
            chips.innerHTML = `${existing}${strongHtml}`;
          }
          document.querySelectorAll("#paylines .payline").forEach(line => line.classList.remove("is-strong-selected"));
          active.forEach(instance => {
            if (instance.id === "golden-payline") document.querySelector(`#paylines .payline[data-line="${instance.selectionPayload.lineIndex}"]`)?.classList.add("is-strong-selected");
          });
        };
        ui.applyMysteryResultVisuals = (result, reelController) => {
          baseApply?.(result, reelController);
          document.querySelectorAll(".strong-mystery-overlay").forEach(node => node.remove());
          const stops = reelController.getCurrentTopStops();
          const reels = reelController.getReelElements();
          (result.mysteryOverlayCells || []).forEach(({ row, reel, source }) => {
            const stop = (stops[reel] + row) % CONFIG.reels[reel].length;
            reels[reel].strip.querySelectorAll(`.symbol-cell[data-stop="${stop}"]`).forEach(cell => {
              const badge = document.createElement("span");
              badge.className = `strong-mystery-overlay source-${source}`;
              badge.textContent = "?";
              badge.setAttribute("aria-hidden", "true");
              cell.appendChild(badge);
            });
          });
          document.querySelectorAll("#paylines .payline").forEach(line => line.classList.remove("is-strong-selected"));
          (result.strongMysteryActiveModifiers || []).forEach(instance => {
            if (instance.id === "golden-payline") document.querySelector(`#paylines .payline[data-line="${instance.selectionPayload.lineIndex}"]`)?.classList.add("is-strong-selected");
          });
        };
        ui.buildMysteryCallouts = result => {
          const callouts = baseCallouts?.(result) || [];
          (result.strongMysteryActiveModifiers || []).forEach(instance => callouts.unshift({
            kicker: "Strong Mystery",
            title: STRONG_NAMES[instance.id],
            detail: strongLabel(instance),
            tone: "four-plus",
          }));
          const awarded = result.mysterySettlement?.modifier;
          if (isStrongId(awarded?.id)) callouts.push({ kicker: "STRONG MYSTERY", title: STRONG_NAMES[awarded.id], detail: `${strongLabel(awarded)} queued for the next spin.`, tone: "four-plus" });
          return callouts;
        };
        ui.clearFeaturePresentation = options => {
          baseClear?.(options);
          document.querySelectorAll(".strong-mystery-overlay").forEach(node => node.remove());
          document.querySelectorAll("#paylines .payline").forEach(line => line.classList.remove("is-strong-selected"));
        };
        return ui;
      };
    }

    if (typeof document !== "undefined") {
      const style = document.createElement("style");
      style.textContent = `
        .mystery-chip{white-space:normal;overflow:visible;text-overflow:clip;max-width:100%}.mystery-chip.is-strong{border-color:#ff7184;box-shadow:0 0 .7rem rgba(255,64,92,.35)}
        .strong-mystery-overlay{position:absolute;right:.16rem;top:.12rem;z-index:8;display:grid;place-items:center;width:1.35rem;height:1.35rem;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ff7b8d,#bb1028 70%);color:white;font-weight:900;border:2px solid rgba(255,255,255,.82);box-shadow:0 0 .75rem rgba(255,45,77,.8);pointer-events:none}
        #paylines .payline.is-strong-selected{opacity:1!important;stroke:#ffd45d!important;stroke-width:6!important;filter:drop-shadow(0 0 8px #ffd45d)}
        @media(max-width:390px){.mystery-chips{flex-wrap:wrap}.mystery-chip{font-size:.68rem;line-height:1.15}}
      `;
      document.head.appendChild(style);
    }
    core.presentationInstalled = true;
    return true;
  }

  core.installPresentation = installPresentation;
})();
