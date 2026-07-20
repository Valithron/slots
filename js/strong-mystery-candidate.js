(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const core = app.strongMysteryCore;
  const { runtime, clone, floor, randomIndex, cellKey, createStrongInstance, normalizeStrongQueue,
    chooseCells, originalLineIsNaturalTrio, baseCombinationWin } = core;

  function applyStrongCandidate(baseResult, instances, options, candidateIndex = 0) {
    const rng = options.rng || Math.random;
    const strong = CONFIG.mystery.strong;
    const result = clone(baseResult);
    const resolvedMatrix = app.payouts.cloneMatrix(result.resolvedMatrix);
    const transformations = clone(result.transformations) || [];
    const overlays = [];
    const candidateSelections = {};
    const protectedCells = [];
    let rescueAttempts = 0;
    let floodCount = 0;
    let fullCount = 0;
    let gatheringCount = 0;
    let chaosDoubleCount = 0;

    instances.forEach(instance => {
      const payload = instance.selectionPayload || {};
      const selection = {};
      if (instance.id === "scatter-magnet") {
        selection.overlayCells = chooseCells(result.originalMatrix, strong.scatterMagnetOverlays, rng, overlays);
        overlays.push(...selection.overlayCells.map(cell => ({ ...cell, source: instance.id, instanceId: instance.instanceId })));
      } else if (instance.id === "commune-gathering") gatheringCount += 1;
      else if (instance.id === "fortune-flood") floodCount += 1;
      else if (instance.id === "full-fortune") fullCount += 1;
      else if (instance.id === "commune-chaos") {
        const effects = payload.effects || [];
        if (effects.includes("chaos-center-tree")) {
          const row = CONFIG.expandingWild.rowIndex;
          const reel = CONFIG.expandingWild.reelIndex;
          const current = resolvedMatrix[row][reel];
          const created = ![CONFIG.expandingWild.symbolKey, CONFIG.mystery.symbolKey].includes(current);
          if (created) resolvedMatrix[row][reel] = CONFIG.expandingWild.symbolKey;
          transformations.push({ type: "chaos-center-tree", rowIndex: row, reelIndex: reel, created, blockedBy: created ? null : current, instanceId: instance.instanceId });
          protectedCells.push({ row, reel });
        }
        if (effects.includes("wild-spark")) {
          const cells = chooseCells(result.originalMatrix, 1, rng, protectedCells, [CONFIG.mystery.symbolKey, CONFIG.expandingWild.symbolKey]);
          selection.wildSparkCell = cells[0] || null;
          if (selection.wildSparkCell) {
            resolvedMatrix[selection.wildSparkCell.row][selection.wildSparkCell.reel] = CONFIG.expandingWild.symbolKey;
            protectedCells.push(selection.wildSparkCell);
            transformations.push({ type: "wild-spark", ...selection.wildSparkCell, instanceId: instance.instanceId });
          }
        }
        if (effects.includes("scatter-spark")) {
          const cells = chooseCells(result.originalMatrix, strong.scatterSparkOverlays, rng, [...overlays, ...protectedCells]);
          selection.scatterSparkCells = cells;
          overlays.push(...cells.map(cell => ({ ...cell, source: "scatter-spark", instanceId: instance.instanceId })));
        }
        if (effects.includes("chaos-double-commune")) chaosDoubleCount += 1;
        if (effects.includes("chaos-rescue")) rescueAttempts += strong.chaosRescueAttempts;
      }
      candidateSelections[instance.instanceId] = selection;
    });

    const normalSpotlights = result.mysterySpotlights || {};
    const lineWins = app.payouts.evaluateWins(resolvedMatrix, options.state).map(win => {
      let multiplier = normalSpotlights[win.symbolKey] || 1;
      const factors = [];
      if (multiplier > 1) factors.push({ id: "spotlight", multiplier });
      instances.forEach(instance => {
        const payload = instance.selectionPayload || {};
        if (instance.id === "golden-payline" && win.lineIndex === payload.lineIndex) {
          multiplier *= strong.goldenPaylineMultiplier;
          factors.push({ id: instance.id, multiplier: strong.goldenPaylineMultiplier });
        }
        if (instance.id === "sevenfold-fortune" && win.symbolKey === payload.characterKey) {
          const factor = originalLineIsNaturalTrio(result, win, payload.characterKey)
            ? strong.sevenfoldNaturalMultiplier
            : strong.sevenfoldAssistedMultiplier;
          multiplier *= factor;
          factors.push({ id: instance.id, multiplier: factor, naturalTrio: factor === strong.sevenfoldNaturalMultiplier });
        }
        if (instance.id === "commune-chaos") {
          if ((payload.effects || []).includes("chaos-spotlight") && win.symbolKey === payload.spotlightCharacterKey) {
            multiplier *= strong.chaosSpotlightMultiplier;
            factors.push({ id: "chaos-spotlight", multiplier: strong.chaosSpotlightMultiplier });
          }
          if ((payload.effects || []).includes("lucky-line") && win.lineIndex === payload.luckyLineIndex) {
            multiplier *= strong.luckyLineMultiplier;
            factors.push({ id: "lucky-line", multiplier: strong.luckyLineMultiplier });
          }
        }
      });
      const basePayout = floor(win.payout);
      return { ...win, basePayout, mysteryMultiplier: multiplier, strongFactors: factors, payout: Math.floor(basePayout * multiplier) };
    });

    const normalDouble = (result.mysteryActiveModifiers || []).find(item => item.id === "double-commune");
    const configuredNormalMultiplier = normalDouble ? Math.min(4, 1 + floor(normalDouble.stacks || 1)) : 1;
    const observedNormalMultiplier = Math.max(1, ...(result.combinationWins || []).map(win => floor(win.mysteryMultiplier) || 1));
    const normalCommuneMultiplier = Math.max(configuredNormalMultiplier, observedNormalMultiplier);
    const communeMultiplier = normalCommuneMultiplier * (2 ** chaosDoubleCount);
    const combinationWins = (result.combinationWins || []).map(baseCombinationWin).map(win => ({
      ...win,
      mysteryMultiplier: communeMultiplier,
      payout: Math.floor(win.basePayout * communeMultiplier),
      name: communeMultiplier > 1 ? `${win.baseName} · Commune ${communeMultiplier}×` : win.baseName,
    }));

    instances.filter(instance => instance.id === "commune-gathering").forEach(instance => {
      const payload = instance.selectionPayload || {};
      const definition = CONFIG.combinations.definitions.find(item => item.id === payload.combinationId) || CONFIG.combinations.definitions[0];
      const basePayout = definition.multiplier * app.payouts.getLineBet(options.state);
      combinationWins.push({
        id: `gathering:${instance.instanceId}`,
        name: `${definition.name} · Gathering`,
        baseName: definition.name,
        symbols: [...definition.members],
        cells: [],
        payoutType: definition.payoutType,
        multiplier: definition.multiplier,
        basePayout,
        gathering: true,
        gatheringMultiplier: strong.communeGatheringMultiplier,
        mysteryMultiplier: communeMultiplier,
        payout: Math.floor(basePayout * strong.communeGatheringMultiplier * communeMultiplier),
      });
    });

    const lineWinTotal = lineWins.reduce((sum, win) => sum + win.payout, 0);
    const combinationWinTotal = combinationWins.reduce((sum, win) => sum + win.payout, 0);
    const preModifierWin = lineWinTotal + combinationWinTotal;
    let totalWin = result.fortuneSpin?.active ? Math.floor(preModifierWin * result.fortuneSpin.multiplier) : preModifierWin;

    if (result.allyEffect?.activated) {
      if (["ryan", "cooper"].includes(result.allyEffect.allyId)) totalWin = Math.floor(totalWin * (Number(result.allyEffect.multiplier) || 1));
      else if (result.allyEffect.allyId === "kenly") totalWin += Math.floor(preModifierWin * CONFIG.allies.kenly.parameters.lemonadeMultiplier);
    }
    const preStrongGlobalWin = totalWin;
    if (floodCount) totalWin = Math.floor(totalWin * (strong.fortuneFloodMultiplier ** floodCount));
    if (fullCount) totalWin = Math.floor(totalWin * (strong.fullFortuneMultiplier ** fullCount));

    const naturalToken = app.mystery.countTokens(result.originalMatrix);
    const tokenCells = [...naturalToken.cells, ...overlays.map(({ row, reel }) => ({ row, reel }))];
    const tokenCount = naturalToken.count + overlays.length;
    let award = app.mystery.createAward(tokenCount, {
      id: result.id,
      queue: options.state?.mystery?.modifierQueue,
      rng,
      forcedModifierId: options.mysteryAwardModifier,
      forcedSpotlight: options.mysteryAwardSpotlight,
    });
    if (tokenCount >= 4 && award.modifier) {
      award.modifier = createStrongInstance(award.modifier, result.id, rng, options.strongMysteryAwardSelection || runtime.qaForcedAwardSelection || {});
      award.strongFallback = false;
    }
    if (fullCount) {
      const rewardMultiplier = strong.fullFortuneMultiplier ** fullCount;
      award = { ...award, fortunePoints: floor(award.fortunePoints * rewardMultiplier), freeSpinsRequested: floor(award.freeSpinsRequested * rewardMultiplier), fullFortuneMultiplier: rewardMultiplier };
    }

    const fortuneMeterAward = clone(result.fortuneMeterAward) || app.payouts.createFortuneMeterAward({ enabled: false });
    if (gatheringCount > 0 && floor(fortuneMeterAward.combinationPoints) === 0) {
      fortuneMeterAward.combinationPoints = floor(CONFIG.fortuneMeter.gains.combination);
    }
    fortuneMeterAward.mysteryTokenPoints = award.fortunePoints;
    fortuneMeterAward.totalPoints = floor(fortuneMeterAward.paidSpinPoints) + floor(fortuneMeterAward.tierPoints)
      + floor(fortuneMeterAward.combinationPoints) + floor(fortuneMeterAward.fortuneBurstPoints) + award.fortunePoints;
    if (fullCount) {
      const rewardMultiplier = strong.fullFortuneMultiplier ** fullCount;
      fortuneMeterAward.paidSpinPoints = floor(fortuneMeterAward.paidSpinPoints * rewardMultiplier);
      fortuneMeterAward.tierPoints = floor(fortuneMeterAward.tierPoints * rewardMultiplier);
      fortuneMeterAward.combinationPoints = floor(fortuneMeterAward.combinationPoints * rewardMultiplier);
      fortuneMeterAward.fortuneBurstPoints = floor(fortuneMeterAward.fortuneBurstPoints * rewardMultiplier);
      fortuneMeterAward.totalPoints = floor(fortuneMeterAward.paidSpinPoints) + floor(fortuneMeterAward.tierPoints)
        + floor(fortuneMeterAward.combinationPoints) + floor(fortuneMeterAward.fortuneBurstPoints) + award.fortunePoints;
    }

    const freeSpinTrigger = clone(result.freeSpinTrigger);
    if (fullCount && freeSpinTrigger?.triggered) freeSpinTrigger.awardedSpins = floor(freeSpinTrigger.awardedSpins * (strong.fullFortuneMultiplier ** fullCount));

    const session = options.state?.freeSpinSession;
    if (result.spinType === "free" && award.freeSpinsRequested > 0 && session?.active && session?.ally?.confirmed && session?.ally?.featureStarted) {
      const naturalRetriggerSpins = freeSpinTrigger?.triggered && freeSpinTrigger?.retrigger ? floor(freeSpinTrigger.awardedSpins) : 0;
      const beforeTotalAwardedSpins = Math.min(CONFIG.freeSpins.maximumAwardedSpins, floor(session.totalAwardedSpins) + naturalRetriggerSpins);
      const beforeRemainingSpins = Math.max(0, floor(session.remainingSpins) - 1) + naturalRetriggerSpins;
      const capacity = Math.max(0, CONFIG.freeSpins.maximumAwardedSpins - beforeTotalAwardedSpins);
      const allySpinsAdded = Math.min(award.freeSpinsRequested, capacity);
      const overflowMysterySpins = award.freeSpinsRequested - allySpinsAdded;
      const plan = {
        awardId: award.id,
        sessionId: session.sessionId,
        allyId: session.ally.selectedId,
        tokenCount,
        requestedSpins: award.freeSpinsRequested,
        allySpinsAdded,
        overflowMysterySpins,
        modifier: clone(award.modifier),
        strongFallback: false,
        naturalRetriggerSpins,
        beforeRemainingSpins,
        afterRemainingSpins: beforeRemainingSpins + allySpinsAdded,
        beforeTotalAwardedSpins,
        afterTotalAwardedSpins: beforeTotalAwardedSpins + allySpinsAdded,
        applied: false,
        presentationStatus: "pending",
        settlementStatus: "pending",
      };
      award = { ...award, destination: "active-ally-session", allyExtension: plan };
    }

    const meterBefore = floor(options.state?.fortuneMeter?.value);
    const consumedCharge = Boolean(result.fortuneSpin?.consumedCharge);
    const postBase = Math.min(CONFIG.fortuneMeter.capacity, (consumedCharge ? 0 : meterBefore) + floor(fortuneMeterAward.totalPoints));
    const floodFloor = floodCount ? strong.fortuneFloodFloor : 0;
    const floodPersistentGain = floodFloor > postBase ? floodFloor - postBase : 0;

    const active = instances.map(instance => ({
      ...clone(instance),
      applicationStatus: "applied",
      candidateSelection: clone(candidateSelections[instance.instanceId] || {}),
    }));

    return {
      ...result,
      resolvedMatrix,
      transformations,
      lineWins,
      combinationWins,
      lineWinTotal,
      combinationWinTotal,
      preModifierWin,
      fortuneBonus: totalWin - preModifierWin,
      totalWin,
      finalWinTier: app.payouts.classifyWinTier(totalWin, result.referenceBet),
      winTier: app.payouts.classifyWinTier(totalWin, result.referenceBet),
      mysteryTokenCount: tokenCount,
      mysteryTokenCells: tokenCells,
      mysteryOverlayCells: overlays,
      scatterWins: tokenCount ? [{ symbolKey: CONFIG.mystery.symbolKey, count: tokenCount, payout: 0, cells: tokenCells }] : [],
      mysteryAward: award,
      fortuneMeterAward,
      freeSpinTrigger,
      strongMysteryActiveModifiers: active,
      strongMysteryCandidateSelections: candidateSelections,
      strongMysteryGlobal: { floodCount, fullCount, preStrongGlobalWin, floodPersistentGain, meterFloor: floodFloor },
      strongMysteryRescueAttempts: rescueAttempts,
      strongMysteryCandidateIndex: candidateIndex,
      settlementStatus: "pending",
    };
  }

  function applyStrongToCoherentAllyResult(rawResult, instances, options, candidateIndex = 0) {
    const replay = rawResult?.allyReplay;
    if (!replay?.originalResult || !replay?.replacementResult || !["gabi", "ashley"].includes(replay.type)) {
      return applyStrongCandidate(rawResult, instances, options, candidateIndex);
    }
    const original = applyStrongCandidate(replay.originalResult, instances, options, `${candidateIndex}:original`);
    const replacement = applyStrongCandidate(replay.replacementResult, instances, options, `${candidateIndex}:replacement`);
    const selected = replay.type === "ashley" || replacement.totalWin > original.totalWin ? "replacement" : "original";
    const chosen = selected === "replacement" ? replacement : original;
    return {
      ...clone(chosen),
      id: rawResult.id,
      createdAt: rawResult.createdAt,
      allyReplay: {
        ...clone(replay),
        originalResult: clone(original),
        replacementResult: clone(replacement),
        selected,
        selectedResultId: chosen.id,
        netImprovement: Math.max(0, chosen.totalWin - original.totalWin),
      },
      settlementStatus: "pending",
    };
  }

  function persistentReward(result) {
    const base = app.mystery.inspectPersistentReward(result);
    return {
      ...base,
      fortuneFloodPersistentGain: floor(result?.strongMysteryGlobal?.floodPersistentGain),
      meaningful: base.meaningful || floor(result?.strongMysteryGlobal?.floodPersistentGain) > 0,
    };
  }

  function trulyBlank(result) {
    return floor(result?.totalWin) <= 0 && !persistentReward(result).meaningful;
  }

  function coherentRescue(original, replacements, attemptsAllowed) {
    const chosen = replacements.at(-1) || original;
    return {
      ...clone(chosen),
      id: original.id,
      createdAt: original.createdAt,
      mysteryRescue: {
        attemptsAllowed: floor(attemptsAllowed),
        attemptsUsed: replacements.length,
        originalResult: clone(original),
        replacementResults: clone(replacements),
        selected: replacements.length ? "replacement" : "original",
        selectedResultId: chosen.id,
        rescued: trulyBlank(original) && !trulyBlank(chosen),
        originalBlank: trulyBlank(original),
        selectedMeaningfulReward: persistentReward(chosen),
        stopReason: floor(chosen.totalWin) > 0 ? "coin-win" : persistentReward(chosen).meaningful ? "meaningful-non-coin-reward" : replacements.length ? "attempts-exhausted" : "original-kept",
      },
      settlementStatus: "pending",
    };
  }


  Object.assign(core, {
    applyStrongCandidate, applyStrongToCoherentAllyResult, persistentReward, trulyBlank, coherentRescue,
  });
})();
