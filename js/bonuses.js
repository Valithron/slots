(() => {
  "use strict";

  const app = window.CommuneFortune;

  async function beforeSpin(context) {
    return context;
  }

  async function afterSpin(context) {
    return context;
  }

  app.bonuses = { beforeSpin, afterSpin };
})();
