import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class Storage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}
class Param {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
  exponentialRampToValueAtTime(value) { this.value = value; }
}
class Gain { constructor() { this.gain = new Param(1); } connect() { return this; } }
class Source {
  constructor(context) { this.context = context; }
  connect() { return this; }
  start() { this.started = true; }
  stop() { this.stopped = true; this.onended?.(); }
}
class Oscillator extends Source {
  constructor(context) { super(context); this.frequency = new Param(440); this.type = "sine"; }
}
class Context {
  constructor() { Context.instances += 1; this.state = "suspended"; this.currentTime = 0; this.destination = {}; this.sampleRate = 44100; }
  createGain() { return new Gain(); }
  createBuffer() { return {}; }
  createBufferSource() { return new Source(this); }
  createOscillator() { return new Oscillator(this); }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }
  async decodeAudioData() { return {}; }
}
Context.instances = 0;

function load(overrides = {}) {
  const storage = overrides.storage || new Storage();
  const document = { hidden: false, addEventListener() {} };
  const sandbox = {
    console, URLSearchParams, performance: { now: () => 100 }, location: { search: overrides.search || "" },
    localStorage: storage, document, addEventListener() {},
    AudioContext: overrides.AudioContext === undefined ? Context : overrides.AudioContext,
    fetch: overrides.fetch || (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })),
    structuredClone, setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("js/audio.js", "utf8"), sandbox);
  return { app: sandbox.CommuneFortune, storage };
}

{
  const { app } = load({ AudioContext: null });
  assert.equal(app.audio.initialize().backend, "none");
  assert.equal(await app.audio.play("missing.event"), null);
}
{
  Context.instances = 0;
  const { app } = load();
  await Promise.all([app.audio.unlock(), app.audio.unlock()]);
  assert.equal(Context.instances, 1, "unlock creates one context");
  assert.equal(app.audio.getStatus().unlocked, true);
}
{
  const { app } = load();
  await app.audio.unlock();
  app.audio.setMuted(true);
  assert.equal(await app.audio.play("ui.button"), null);
  assert.equal(app.audio.isMuted(), true);
}
{
  const storage = new Storage();
  const first = load({ storage }).app;
  first.audio.setMasterVolume(0.4);
  first.audio.setBusVolume("music", 0.2);
  first.audio.setMuted(true);
  const second = load({ storage }).app;
  assert.deepEqual(second.audio.getSettings(), {
    muted: true,
    masterVolume: 0.4,
    busVolumes: { music: 0.2, ambience: 0.45, ui: 0.7, reels: 0.8, wins: 0.9, features: 0.9, characters: 1 },
  });
}
{
  const { app } = load();
  await app.audio.unlock();
  const handle = await app.audio.play("ui.button");
  assert.ok(handle, "configured events use synthesized fallback when no asset exists");
  assert.equal(handle.eventId, "ui.button");
  assert.equal(app.audio.getAssets()["ui.button"], "synthetic-fallback");
  app.audio.stopAll();
  assert.equal(app.audio.getStatus().activeHandles, 0);
}
{
  const { app } = load();
  app.audio.beginSpinSession("spin-1");
  assert.equal(app.audio.getStatus().spinId, "spin-1");
  app.audio.beginSpinSession("spin-2");
  assert.equal(app.audio.getStatus().spinId, "spin-2");
  app.audio.endSpinSession("spin-2");
  assert.equal(app.audio.getStatus().spinId, null);
}

console.log("Audio foundation tests passed.");