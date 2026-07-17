(() => {
  "use strict";

  const app = window.CommuneFortune;

  function burstCoins(count, originElement) {
    const rect = originElement.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    for (let index = 0; index < count; index += 1) {
      const coin = document.createElement("div");
      coin.className = "coin-particle";
      coin.style.left = `${originX - 9}px`;
      coin.style.top = `${originY - 9}px`;

      const angle = Math.random() * Math.PI * 2;
      const distance = 90 + Math.random() * Math.min(window.innerWidth, 360);
      coin.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
      coin.style.setProperty("--y", `${Math.sin(angle) * distance + 100}px`);
      coin.style.setProperty("--r", `${(Math.random() * 900 - 450).toFixed(0)}deg`);
      coin.style.setProperty("--duration", `${800 + Math.random() * 750}ms`);

      document.body.appendChild(coin);
      window.setTimeout(() => coin.remove(), 1700);
    }
  }

  function flashScreen(screenFlash) {
    screenFlash.classList.remove("active");
    void screenFlash.offsetWidth;
    screenFlash.classList.add("active");
  }

  app.effects = { burstCoins, flashScreen };
})();
