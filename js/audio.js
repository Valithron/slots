(() => {
  "use strict";

  const app = window.CommuneFortune;

  function createAudio(getSoundEnabled) {
    let audioContext = null;

    function ensureAudio() {
      if (!getSoundEnabled()) return null;
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
      return audioContext;
    }

    function tone({ frequency = 440, duration = .08, type = "sine", gain = .08, when = 0, endFrequency = null }) {
      const ctx = ensureAudio();
      if (!ctx) return;

      const oscillator = ctx.createOscillator();
      const volume = ctx.createGain();
      const start = ctx.currentTime + when;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);

      volume.gain.setValueAtTime(.0001, start);
      volume.gain.exponentialRampToValueAtTime(gain, start + .01);
      volume.gain.exponentialRampToValueAtTime(.0001, start + duration);

      oscillator.connect(volume).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + .02);
    }

    function playSpinStart() {
      tone({ frequency: 130, endFrequency: 340, duration: .34, type: "sawtooth", gain: .045 });
      tone({ frequency: 260, endFrequency: 580, duration: .3, type: "triangle", gain: .03, when: .03 });
    }

    function playTick(pitch = 1) {
      tone({ frequency: 170 * pitch, duration: .028, type: "square", gain: .018 });
    }

    function playReelStop(index) {
      tone({ frequency: 150 + index * 45, duration: .1, type: "triangle", gain: .08 });
      tone({ frequency: 75 + index * 18, duration: .15, type: "sine", gain: .06, when: .015 });
    }

    function playWinSound(amount) {
      const notes = amount >= 100 ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
      notes.forEach((note, index) => tone({ frequency: note, duration: .24, type: "triangle", gain: .08, when: index * .11 }));
      tone({ frequency: 131, endFrequency: 262, duration: .62, type: "sine", gain: .05 });
    }

    function playLossSound() {
      tone({ frequency: 180, endFrequency: 120, duration: .22, type: "triangle", gain: .035 });
    }

    function playErrorSound() {
      tone({ frequency: 115, duration: .12, type: "square", gain: .035 });
      tone({ frequency: 92, duration: .14, type: "square", gain: .03, when: .13 });
    }

    function playButtonTone() {
      tone({ frequency: 480, duration: .055, type: "sine", gain: .04 });
    }

    function playRefillSound() {
      [330, 440, 550, 660].forEach((note, index) => {
        tone({ frequency: note, duration: .12, type: "triangle", gain: .05, when: index * .07 });
      });
    }

    return {
      playSpinStart,
      playTick,
      playReelStop,
      playWinSound,
      playLossSound,
      playErrorSound,
      playButtonTone,
      playRefillSound,
    };
  }

  app.audio = { createAudio };
})();
