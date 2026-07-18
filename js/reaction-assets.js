(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const originalResolve = app.reactions.resolveReactionAsset;

  function stripVersion(path) {
    return typeof path === "string" ? path.split("?")[0].split("#")[0] : path;
  }

  function variantPath(basePath, level) {
    const clean = stripVersion(basePath);
    if (!clean || level === "base" || !/\.svg$/i.test(clean)) return clean;
    return clean.replace(/\.svg$/i, `-${level}.svg`);
  }

  function fallbackLevels(level) {
    if (level === "big" || level === "jackpot") return ["big", "nice", "small", "base"];
    if (level === "nice" || level === "combination") return ["nice", "small", "base"];
    if (level === "small") return ["small", "base"];
    return ["base"];
  }

  function resolveReactionAsset(characterKey, requestedLevel = "base") {
    const base = originalResolve(characterKey, "base");
    if (!base?.path || characterKey === "TOL") return originalResolve(characterKey, requestedLevel);

    const levels = fallbackLevels(requestedLevel);
    const paths = levels.map(level => app.reactions.versionAssetUrl(variantPath(base.path, level)));
    return {
      characterKey,
      requestedLevel,
      source: requestedLevel,
      path: paths[0],
      fallbackPath: paths[1] || base.path,
      genericPath: paths[2] || paths[1] || base.path,
      fallbackPaths: paths,
    };
  }

  app.reactions.resolveReactionAsset = resolveReactionAsset;
  app.reactions.reactionAssetFallbackLevels = fallbackLevels;
  app.reactions.reactionVariantPath = variantPath;
})();