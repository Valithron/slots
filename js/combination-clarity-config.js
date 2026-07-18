(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;

  const definition = (id, name, members, multiplier) => Object.freeze({
    id,
    name,
    members: Object.freeze([...members]),
    payoutType: "lineBet",
    multiplier,
  });

  const previousDefinition = (id, name, sequence, multiplier) => Object.freeze({
    id,
    name,
    sequence: Object.freeze([...sequence]),
    payoutType: "lineBet",
    multiplier,
  });

  const definitions = Object.freeze([
    definition("kps", "KPs", ["STR", "CYD", "TOL"], 2),
    definition("walls", "Walls", ["RYN", "GAB", "TOL"], 2),
    definition("jaaps", "Jaaps", ["KEN", "COP", "TOL"], 2),
    definition("brotherhood", "Brotherhood", ["COP", "STR", "RYN"], 3),
    definition("wives-circle", "Wives’ Circle", ["KEN", "GAB", "CYD"], 1),
    definition("household", "Household", ["ASH", "STR", "CYD"], 2),
  ]);

  const previousExactDefinitions = Object.freeze([
    previousDefinition("kps", "KPs", ["STR", "CYD", "TOL"], 8),
    previousDefinition("walls", "Walls", ["RYN", "GAB", "TOL"], 8),
    previousDefinition("jaaps", "Jaaps", ["KEN", "COP", "TOL"], 8),
    previousDefinition("brotherhood", "Brotherhood", ["COP", "STR", "RYN"], 12),
    previousDefinition("wives-circle", "Wives’ Circle", ["KEN", "GAB", "CYD"], 5),
    previousDefinition("household", "Household", ["ASH", "STR", "CYD"], 8),
  ]);

  CONFIG.combinations.definitions = definitions;
  CONFIG.combinations.matchMode = "any-order-middle-row";
  CONFIG.combinations.previousExactDefinitions = previousExactDefinitions;

  CONFIG.rtpTargets.combinations = { minimum: 0.025, maximum: 0.031 };
  CONFIG.rtpTargets.featurePassTotal = { minimum: 0.872, maximum: 0.876 };
  CONFIG.rtpTargets.fortuneTotal = { minimum: 0.883, maximum: 0.887 };
  CONFIG.rtpTargets.withFreeSpinsTotal = { minimum: 0.939, maximum: 0.944 };
})();