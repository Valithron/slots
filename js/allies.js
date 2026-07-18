(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const originalCreateSession = app.freeSpins.createFreeSpinSession;
  const originalCloneSession = app.freeSpins.cloneSession;
  const originalApplySettlement = app.freeSpins.applyFreeSpinSettlement;
  const originalCanStartFeature = app.freeSpins.canStartFeature;
  const originalGetSummary = app.freeSpins.getSessionSummary;

  const floorCoin = value => Math.max(0, Math.floor(Number(value) || 0));
  const clone = value => value == null ? value : structuredClone(value);
  const validId = id => typeof id === "string" && Boolean(CONFIG.allies?.[id]?.enabled);

  function createAllyState() {
    return {
      selectedId: null,
      confirmed: false,
      featureStarted: false,
      legacyNoAlly: false,
      totalBonus: 0,
      endBonusPaid: false,
      lastActivation: null,
      sterling: { lossCount: 0, insurancePot: 0, paid: false },
      ryan: { selectedSpinNumber: null, consumed: false, basePayout: 0, bonus: 0 },
      cooper: { consecutiveLosses: 0, currentMultiplier: 1, maximumRage: 1, unusedAtEnd: false },
      cydney: { recordedSpinId: null, recordedAmount: 0, echoBonus: 0, paid: false },
      gabi: { used: false, originalResult: null, replacementResult: null, selectedResultId: null, netImprovement: 0 },
      kenly: { qualifyingWins: 0, totalLemonBonus: 0 },
      ashley: { used: false, originalSpinId: null, replayResult: null, improvement: 0 },
    };
  }

  function normalizeAllyState(value, { legacy = false } = {}) {
    const base = createAllyState();
    if (!value || typeof value !== "object") {
      if (legacy) {
        base.confirmed = true;
        base.featureStarted = true;
        base.legacyNoAlly = true;
      }
      return base;
    }
    const selectedId = validId(value.selectedId) ? value.selectedId : null;
    const normalized = {
      ...base,
      selectedId,
      confirmed: value.confirmed === true && Boolean(selectedId),
      featureStarted: value.featureStarted === true,
      legacyNoAlly: value.legacyNoAlly === true,
      totalBonus: floorCoin(value.totalBonus),
      endBonusPaid: value.endBonusPaid === true,
      lastActivation: value.lastActivation && typeof value.lastActivation === "object" ? clone(value.lastActivation) : null,
      sterling: {
        lossCount: floorCoin(value.sterling?.lossCount),
        insurancePot: floorCoin(value.sterling?.insurancePot),
        paid: value.sterling?.paid === true,
      },
      ryan: {
        selectedSpinNumber: Number.isInteger(value.ryan?.selectedSpinNumber)
          ? Math.min(CONFIG.freeSpins.startingAward, Math.max(1, value.ryan.selectedSpinNumber))
          : null,
        consumed: value.ryan?.consumed === true,
        basePayout: floorCoin(value.ryan?.basePayout),
        bonus: floorCoin(value.ryan?.bonus),
      },
      cooper: {
        consecutiveLosses: Math.min(3, floorCoin(value.cooper?.consecutiveLosses)),
        currentMultiplier: Number.isFinite(value.cooper?.currentMultiplier) ? Math.max(1, value.cooper.currentMultiplier) : 1,
        maximumRage: Number.isFinite(value.cooper?.maximumRage) ? Math.max(1, value.cooper.maximumRage) : 1,
        unusedAtEnd: value.cooper?.unusedAtEnd === true,
      },
      cydney: {
        recordedSpinId: typeof value.cydney?.recordedSpinId === "string" ? value.cydney.recordedSpinId : null,
        recordedAmount: floorCoin(value.cydney?.recordedAmount),
        echoBonus: floorCoin(value.cydney?.echoBonus),
        paid: value.cydney?.paid === true,
      },
      gabi: {
        used: value.gabi?.used === true,
        originalResult: value.gabi?.originalResult ? clone(value.gabi.originalResult) : null,
        replacementResult: value.gabi?.replacementResult ? clone(value.gabi.replacementResult) : null,
        selectedResultId: typeof value.gabi?.selectedResultId === "string" ? value.gabi.selectedResultId : null,
        netImprovement: floorCoin(value.gabi?.netImprovement),
      },
      kenly: {
        qualifyingWins: floorCoin(value.kenly?.qualifyingWins),
        totalLemonBonus: floorCoin(value.kenly?.totalLemonBonus),
      },
      ashley: {
        used: value.ashley?.used === true,
        originalSpinId: typeof value.ashley?.originalSpinId === "string" ? value.ashley.originalSpinId : null,
        replayResult: value.ashley?.replayResult ? clone(value.ashley.replayResult) : null,
        improvement: floorCoin(value.ashley?.improvement),
      },
    };
    if (normalized.legacyNoAlly) {
      normalized.selectedId = null;
      normalized.confirmed = true;
      normalized.featureStarted = true;
    }
    if (!normalized.selectedId && !normalized.legacyNoAlly) normalized.confirmed = false;
    return normalized;
  }

  function getDefinition(sessionOrAlly) {
    const id = typeof sessionOrAlly === "string" ? sessionOrAlly : sessionOrAlly?.ally?.selectedId;
    return validId(id) ? CONFIG.allies[id] : null;
  }

  function setPendingSelection(session, allyId) {
    const next = originalCloneSession(session);
    if (!next?.active || next.ally?.featureStarted || next.ally?.confirmed || !validId(allyId)) return next;
    next.ally = normalizeAllyState(next.ally);
    next.ally.selectedId = allyId;
    return next;
  }

  function confirmSelection(session, allyId = session?.ally?.selectedId, rng = Math.random) {
    const next = setPendingSelection(session, allyId);
    if (!next?.active || next.ally?.featureStarted || next.ally?.confirmed || !validId(next.ally?.selectedId)) return next;
    next.ally.confirmed = true;
    if (next.ally.selectedId === "ryan") {
      const count = CONFIG.allies.ryan.parameters.selectedInitialSpinCount;
      next.ally.ryan.selectedSpinNumber = Math.min(count, Math.max(1, Math.floor(rng() * count) + 1));
    }
    return next;
  }

  function beginFeature(session) {
    const next = originalCloneSession(session);
    if (!next?.active || (!next.ally?.confirmed && !next.ally?.legacyNoAlly)) return next;
    next.ally = normalizeAllyState(next.ally);
    next.ally.featureStarted = true;
    return next;
  }

  function calculateInsurance(lossCount, referenceBet, definition = CONFIG.allies.sterling) {
    const perLoss = definition.parameters.insurancePerLossMultiplier;
    const cap = floorCoin(definition.parameters.insuranceCapMultiplier * referenceBet);
    return Math.min(cap, floorCoin(lossCount * perLoss * referenceBet));
  }

  function getCooperMultiplier(losses, definition = CONFIG.allies.cooper) {
    const ladder = definition.parameters.multiplierLadder;
    return ladder[Math.min(Math.max(0, floorCoin(losses)), ladder.length - 1)] || 1;
  }

  function updateResultTotal(result, finalWin, effect) {
    const totalWin = floorCoin(finalWin);
    return {
      ...result,
      allyEffect: effect ? clone(effect) : null,
      totalWin,
      finalWinTier: app.payouts.classifyWinTier(totalWin, result.referenceBet),
      winTier: app.payouts.classifyWinTier(totalWin, result.referenceBet),
    };
  }

  function applySpinModifier(result, session) {
    const ally = normalizeAllyState(session?.ally);
    const definition = getDefinition(session);
    if (!definition || !CONFIG.features.allyAbilities || result?.spinType !== "free") return result;
    const baseWin = floorCoin(result.totalWin);
    const spinNumber = floorCoin(session.completedSpins) + 1;

    if (definition.id === "ryan" && spinNumber === ally.ryan.selectedSpinNumber) {
      const finalWin = Math.floor(baseWin * definition.parameters.winMultiplier);
      return updateResultTotal(result, finalWin, {
        allyId: definition.id,
        abilityName: definition.abilityName,
        activated: true,
        spinNumber,
        baseWin,
        bonus: finalWin - baseWin,
        multiplier: definition.parameters.winMultiplier,
      });
    }

    if (definition.id === "cooper" && baseWin > 0) {
      const multiplier = getCooperMultiplier(ally.cooper.consecutiveLosses, definition);
      if (multiplier > 1) {
        const finalWin = Math.floor(baseWin * multiplier);
        return updateResultTotal(result, finalWin, {
          allyId: definition.id,
          abilityName: definition.abilityName,
          activated: true,
          baseWin,
          bonus: finalWin - baseWin,
          multiplier,
          lossesBeforeWin: ally.cooper.consecutiveLosses,
        });
      }
    }

    if (definition.id === "kenly" && result.naturalWinTier === app.WIN_TIERS.SMALL && baseWin > 0) {
      const bonus = Math.floor(result.preModifierWin * definition.parameters.lemonadeMultiplier);
      return updateResultTotal(result, baseWin + bonus, {
        allyId: definition.id,
        abilityName: definition.abilityName,
        activated: bonus > 0,
        baseWin,
        bonus,
        multiplier: definition.parameters.lemonadeMultiplier,
      });
    }

    return result;
  }

  function applySettlementState(session, spinResult) {
    const ally = normalizeAllyState(session?.ally);
    const definition = getDefinition({ ally });
    if (!definition || spinResult?.spinType !== "free") return ally;
    const finalWin = floorCoin(spinResult.totalWin);
    const effect = spinResult.allyEffect || null;
    ally.lastActivation = effect?.activated ? clone(effect) : null;
    ally.totalBonus += floorCoin(effect?.bonus);

    if (definition.id === "sterling") {
      if (finalWin === 0) {
        const before = ally.sterling.insurancePot;
        ally.sterling.lossCount += 1;
        ally.sterling.insurancePot = calculateInsurance(ally.sterling.lossCount, session.referenceBet, definition);
        ally.lastActivation = {
          allyId: definition.id,
          abilityName: definition.abilityName,
          activated: ally.sterling.insurancePot > before,
          bonus: ally.sterling.insurancePot - before,
          insurancePot: ally.sterling.insurancePot,
        };
      } else {
        ally.sterling.insurancePot = calculateInsurance(ally.sterling.lossCount, session.referenceBet, definition);
      }
    } else if (definition.id === "ryan" && effect?.activated) {
      ally.ryan.consumed = true;
      ally.ryan.basePayout = floorCoin(effect.baseWin);
      ally.ryan.bonus = floorCoin(effect.bonus);
    } else if (definition.id === "cooper") {
      if (finalWin > 0) {
        ally.cooper.consecutiveLosses = 0;
        ally.cooper.currentMultiplier = 1;
      } else {
        ally.cooper.consecutiveLosses = Math.min(3, ally.cooper.consecutiveLosses + 1);
        ally.cooper.currentMultiplier = getCooperMultiplier(ally.cooper.consecutiveLosses, definition);
        ally.cooper.maximumRage = Math.max(ally.cooper.maximumRage, ally.cooper.currentMultiplier);
      }
    } else if (definition.id === "cydney" && finalWin > 0 && !ally.cydney.recordedSpinId) {
      ally.cydney.recordedSpinId = spinResult.id;
      ally.cydney.recordedAmount = finalWin;
      ally.cydney.echoBonus = Math.floor(finalWin * definition.parameters.echoMultiplier);
      ally.lastActivation = {
        allyId: definition.id,
        abilityName: definition.abilityName,
        activated: true,
        recordedAmount: finalWin,
        bonus: ally.cydney.echoBonus,
      };
    } else if (definition.id === "gabi" && spinResult.allyReplay?.type === "gabi") {
      ally.gabi.used = true;
      ally.gabi.originalResult = clone(spinResult.allyReplay.originalResult);
      ally.gabi.replacementResult = clone(spinResult.allyReplay.replacementResult);
      ally.gabi.selectedResultId = spinResult.allyReplay.selectedResultId;
      ally.gabi.netImprovement = floorCoin(spinResult.allyReplay.netImprovement);
      ally.totalBonus += ally.gabi.netImprovement;
      ally.lastActivation = {
        allyId: definition.id,
        abilityName: definition.abilityName,
        activated: true,
        bonus: ally.gabi.netImprovement,
        selected: spinResult.allyReplay.selected,
      };
    } else if (definition.id === "kenly" && effect?.activated) {
      ally.kenly.qualifyingWins += 1;
      ally.kenly.totalLemonBonus += floorCoin(effect.bonus);
    } else if (definition.id === "ashley" && spinResult.allyReplay?.type === "ashley") {
      ally.ashley.used = true;
      ally.ashley.originalSpinId = spinResult.allyReplay.originalResult?.id || null;
      ally.ashley.replayResult = clone(spinResult.allyReplay.replacementResult);
      ally.ashley.improvement = floorCoin(spinResult.allyReplay.netImprovement);
      ally.totalBonus += ally.ashley.improvement;
      ally.lastActivation = {
        allyId: definition.id,
        abilityName: definition.abilityName,
        activated: true,
        bonus: ally.ashley.improvement,
      };
    }
    return ally;
  }

  function finalizeSession(state) {
    const session = state?.freeSpinSession;
    if (!session?.active || session.remainingSpins > 0) return { applied: false, amount: 0, type: null };
    session.ally = normalizeAllyState(session.ally, { legacy: !session.ally });
    if (session.ally.endBonusPaid || session.ally.legacyNoAlly || !session.ally.selectedId) {
      if (session.ally.selectedId === "cooper" && session.ally.cooper.consecutiveLosses > 0) session.ally.cooper.unusedAtEnd = true;
      return { applied: false, amount: 0, type: null };
    }
    let amount = 0;
    let type = null;
    if (session.ally.selectedId === "sterling") {
      amount = floorCoin(session.ally.sterling.insurancePot);
      session.ally.sterling.paid = true;
      type = "insurance";
    } else if (session.ally.selectedId === "cydney") {
      amount = floorCoin(session.ally.cydney.echoBonus);
      session.ally.cydney.paid = true;
      type = "echo";
    } else if (session.ally.selectedId === "cooper" && session.ally.cooper.consecutiveLosses > 0) {
      session.ally.cooper.unusedAtEnd = true;
    }
    session.ally.endBonusPaid = true;
    if (amount > 0) {
      state.coins += amount;
      state.lastWin = amount;
      session.accumulatedWin += amount;
      session.ally.totalBonus += amount;
      session.ally.lastActivation = {
        allyId: session.ally.selectedId,
        abilityName: CONFIG.allies[session.ally.selectedId].abilityName,
        activated: true,
        bonus: amount,
        endBonus: true,
        type,
      };
    }
    return { applied: amount > 0, amount, type };
  }

  function createFreeSpinSession(triggerResult, options = {}) {
    const session = originalCreateSession(triggerResult, options);
    if (!session) return null;
    session.ally = createAllyState();
    return session;
  }

  function cloneSession(session) {
    const next = originalCloneSession(session);
    if (!next) return null;
    next.ally = normalizeAllyState(session?.ally, { legacy: !session?.ally });
    return next;
  }

  function applyFreeSpinSettlement(session, spinResult) {
    const result = originalApplySettlement(session, spinResult);
    if (!result.session) return result;
    result.session.ally = applySettlementState(result.session, spinResult);
    return result;
  }

  function canStartFeature(session) {
    return originalCanStartFeature(session)
      && Boolean(session?.ally?.confirmed || session?.ally?.legacyNoAlly || !CONFIG.features.chooseYourAlly);
  }

  function getSessionSummary(session) {
    const summary = originalGetSummary(session);
    if (!summary) return null;
    const ally = normalizeAllyState(session?.ally, { legacy: !session?.ally });
    return {
      ...summary,
      allyId: ally.selectedId,
      ally: ally.selectedId ? CONFIG.allies[ally.selectedId] : null,
      allyBonus: ally.totalBonus,
      allyState: ally,
    };
  }

  function getHudState(session) {
    const ally = normalizeAllyState(session?.ally, { legacy: !session?.ally });
    const definition = getDefinition({ ally });
    if (!definition) return { label: "Legacy feature", value: "No ally", accent: CONFIG.characterAccentColorMap.TOL };
    let value = definition.abilityName;
    if (definition.id === "sterling") value = `Insurance ${ally.sterling.insurancePot}`;
    else if (definition.id === "ryan") value = ally.ryan.consumed ? "Big Win used" : "Big Win hidden";
    else if (definition.id === "cooper") value = ally.cooper.currentMultiplier > 1 ? `Rage ${ally.cooper.currentMultiplier}×` : "Rage ready";
    else if (definition.id === "cydney") value = ally.cydney.recordedSpinId ? `Echo ${ally.cydney.echoBonus}` : "Listening…";
    else if (definition.id === "gabi") value = ally.gabi.used ? "Eww used" : "Eww ready";
    else if (definition.id === "kenly") value = `Lemons +${ally.kenly.totalLemonBonus}`;
    else if (definition.id === "ashley") value = ally.ashley.used ? "Fastball used" : "Fastball ready";
    return { label: definition.name, value, accent: definition.accent, portrait: definition.portrait, abilityName: definition.abilityName };
  }

  app.allies = {
    floorCoin,
    createAllyState,
    normalizeAllyState,
    getDefinition,
    setPendingSelection,
    confirmSelection,
    beginFeature,
    calculateInsurance,
    getCooperMultiplier,
    applySpinModifier,
    applySettlementState,
    finalizeSession,
    getHudState,
  };

  app.freeSpins.createFreeSpinSession = createFreeSpinSession;
  app.freeSpins.cloneSession = cloneSession;
  app.freeSpins.applyFreeSpinSettlement = applyFreeSpinSettlement;
  app.freeSpins.canStartFeature = canStartFeature;
  app.freeSpins.getSessionSummary = getSessionSummary;
})();
