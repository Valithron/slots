(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  Object.entries(app.CONFIG.characterPresentation.characters).forEach(([key, character]) => {
    if (app.CONFIG.symbols[key] && character?.base) app.CONFIG.symbols[key].image = app.reactions.versionAssetUrl(character.base);
  });

  function createAudio(getSoundEnabled) {
    let audioContext = null;
    function ensureAudio() {
      if (!getSoundEnabled()) return null;
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === "suspended") void audioContext.resume();
      return audioContext;
    }
    function tone({ frequency = 440, duration = 0.08, type = "sine", gain = 0.08, when = 0, endFrequency = null }) {
      const ctx = ensureAudio();
      if (!ctx) return;
      const oscillator = ctx.createOscillator();
      const volume = ctx.createGain();
      const start = ctx.currentTime + when;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
      if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
      volume.gain.setValueAtTime(0.0001, start);
      volume.gain.exponentialRampToValueAtTime(gain, start + 0.01);
      volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(volume).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }
    function chord(notes, { spacing = 0.09, duration = 0.24, gain = 0.07, type = "triangle" } = {}) {
      notes.forEach((frequency, index) => tone({ frequency, duration, gain, type, when: index * spacing }));
    }
    const playSpinStart = () => {
      tone({ frequency: 130, endFrequency: 340, duration: 0.34, type: "sawtooth", gain: 0.045 });
      tone({ frequency: 260, endFrequency: 580, duration: 0.3, type: "triangle", gain: 0.03, when: 0.03 });
    };
    const playTick = (pitch = 1) => tone({ frequency: 170 * pitch, duration: 0.028, type: "square", gain: 0.018 });
    function playReelStop(index, intensity = 1) {
      tone({ frequency: 150 + index * 45, duration: 0.1, type: "triangle", gain: 0.075 * intensity });
      tone({ frequency: 75 + index * 18, duration: 0.15, type: "sine", gain: 0.055 * intensity, when: 0.015 });
      tone({ frequency: 680 + index * 80, duration: 0.035, type: "square", gain: 0.014 * intensity });
    }
    function playAnticipation(level) {
      const strong = level === "strong";
      tone({ frequency: strong ? 105 : 130, endFrequency: strong ? 210 : 175, duration: strong ? 0.55 : 0.32, type: "sine", gain: 0.035 });
      if (strong) tone({ frequency: 420, duration: 0.18, type: "triangle", gain: 0.025, when: 0.28 });
    }
    function playAwakening() {
      tone({ frequency: 110, endFrequency: 440, duration: 0.72, type: "sine", gain: 0.05 });
      tone({ frequency: 220, endFrequency: 880, duration: 0.55, type: "triangle", gain: 0.045, when: 0.12 });
      chord([523, 659, 784], { spacing: 0.07, duration: 0.26, gain: 0.045, type: "sine" });
      tone({ frequency: 76, duration: 0.18, type: "square", gain: 0.035, when: 0.68 });
    }
    function playCombination(fullCommune = false) {
      if (fullCommune) {
        chord([392, 494, 587, 698, 880], { spacing: 0.075, duration: 0.3, gain: 0.065 });
        tone({ frequency: 98, endFrequency: 294, duration: 0.78, type: "sine", gain: 0.04 });
        return;
      }
      chord([587, 740, 880, 1175], { spacing: 0.065, duration: 0.2, gain: 0.052 });
    }
    function playTierSound(tier) {
      if (tier === "small") { chord([740, 930, 1110], { spacing: 0.055, duration: 0.13, gain: 0.045 }); return; }
      if (tier === "nice") { chord([523, 659, 784, 1047], { spacing: 0.1, duration: 0.28, gain: 0.07 }); tone({ frequency: 196, endFrequency: 392, duration: 0.62, type: "sine", gain: 0.04 }); return; }
      if (tier === "big") { chord([392, 523, 659, 784, 1047], { spacing: 0.12, duration: 0.34, gain: 0.085 }); tone({ frequency: 98, endFrequency: 196, duration: 0.86, type: "sawtooth", gain: 0.035 }); return; }
      if (tier === "jackpot") { chord([262,330,392,523,659,784,1047,1319], { spacing: 0.1, duration: 0.38, gain: 0.08 }); chord([523,659,784,1047], { spacing: 0.08, duration: 0.5, gain: 0.06, type: "sine" }); tone({ frequency: 65, endFrequency: 260, duration: 1.4, type: "sawtooth", gain: 0.04 }); }
    }
    function playCharacterReaction(level = "nice") {
      const base = level === "big" || level === "jackpot" ? 440 : 587;
      chord([base, base * 1.25, base * 1.5], { spacing: 0.055, duration: 0.18, gain: 0.045, type: "sine" });
    }
    function playGroupReaction() { chord([392, 494, 587, 740], { spacing: 0.05, duration: 0.22, gain: 0.048 }); }
    function playFreeSpinTrigger() {
      tone({ frequency: 98, endFrequency: 392, duration: 0.8, type: "sine", gain: 0.045 });
      chord([392, 523, 659, 784], { spacing: 0.09, duration: 0.34, gain: 0.058, type: "triangle" });
    }
    function playFreeSpinStart() {
      chord([330, 440, 554, 659], { spacing: 0.075, duration: 0.22, gain: 0.05 });
      tone({ frequency: 165, endFrequency: 330, duration: 0.42, type: "sine", gain: 0.03 });
    }
    function playRetrigger() {
      chord([523, 659, 784, 1047], { spacing: 0.055, duration: 0.2, gain: 0.06 });
      tone({ frequency: 130, endFrequency: 260, duration: 0.42, type: "triangle", gain: 0.035 });
    }
    function playFreeSpinSummary() { chord([262, 330, 392, 523, 659], { spacing: 0.085, duration: 0.32, gain: 0.055, type: "sine" }); }
    const playWinSound = amount => playTierSound(amount >= 100 ? "nice" : "small");
    const playLossSound = () => tone({ frequency: 180, endFrequency: 120, duration: 0.22, type: "triangle", gain: 0.035 });
    function playErrorSound() { tone({ frequency: 115, duration: 0.12, type: "square", gain: 0.035 }); tone({ frequency: 92, duration: 0.14, type: "square", gain: 0.03, when: 0.13 }); }
    const playButtonTone = () => tone({ frequency: 480, duration: 0.055, type: "sine", gain: 0.04 });
    const playRefillSound = () => chord([330,440,550,660], { spacing: 0.07, duration: 0.12, gain: 0.05 });
    return {
      playSpinStart, playTick, playReelStop, playAnticipation, playAwakening, playCombination,
      playTierSound, playCharacterReaction, playGroupReaction, playFreeSpinTrigger, playFreeSpinStart,
      playRetrigger, playFreeSpinSummary, playWinSound, playLossSound, playErrorSound, playButtonTone, playRefillSound,
    };
  }
  app.audio = { createAudio };
})();
