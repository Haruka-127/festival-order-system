import { expect, test } from "bun:test";
import { MonitorCallTracker, MonitorChime, type ChimeState } from "../src/client/monitor-sound";

function snapshot(waiting: string[], calling: string[], generation = 0) {
  return { order_generation: generation, locations: [{ waiting: waiting.map(fulfillment_id => ({ fulfillment_id })), calling: calling.map(fulfillment_id => ({ fulfillment_id })) }] };
}

test("only a known waiting task becoming callable triggers the chime", () => {
  const tracker = new MonitorCallTracker();
  expect(tracker.accept(snapshot(["waiting"], ["already-ready"]))).toBe(false);
  expect(tracker.accept(snapshot(["waiting"], ["already-ready", "unseen-ready"]))).toBe(false);
  expect(tracker.accept(snapshot([], ["already-ready", "unseen-ready", "waiting"]))).toBe(true);
  expect(tracker.accept(snapshot([], ["already-ready", "unseen-ready", "waiting"]))).toBe(false);
  expect(tracker.accept(snapshot([], []))).toBe(false);
});

test("multiple simultaneous transitions produce one notification and use task identity across locations", () => {
  const tracker = new MonitorCallTracker();
  tracker.accept(snapshot(["grill-order-001", "drink-order-001", "order-002"], []));
  expect(tracker.accept(snapshot([], ["grill-order-001", "drink-order-001", "order-002"]))).toBe(true);
  expect(tracker.accept(snapshot([], ["grill-order-001", "drink-order-001", "order-002"]))).toBe(false);
});

test("returning to preparation and calling again can trigger another chime", () => {
  const tracker = new MonitorCallTracker();
  tracker.accept(snapshot(["task"], []));
  expect(tracker.accept(snapshot([], ["task"]))).toBe(true);
  expect(tracker.accept(snapshot(["task"], []))).toBe(false);
  expect(tracker.accept(snapshot([], ["task"]))).toBe(true);
});

test("a reconnect snapshot is silent while subsequent transitions still notify", () => {
  const tracker = new MonitorCallTracker();
  tracker.accept(snapshot(["old-task", "next-task"], []));
  expect(tracker.accept(snapshot(["next-task"], ["old-task"]), true)).toBe(false);
  expect(tracker.accept(snapshot([], ["old-task", "next-task"]))).toBe(true);
});

test("a reset starts a silent baseline and stale generations cannot alter it", () => {
  const tracker = new MonitorCallTracker();
  tracker.accept(snapshot(["old-task"], []));
  expect(tracker.accept(snapshot(["new-task"], ["old-task"], 1))).toBe(false);
  expect(tracker.accept(snapshot([], ["new-task"], 0))).toBe(false);
  expect(tracker.accept(snapshot([], ["new-task"], 1))).toBe(true);
});

class FakeAudio extends EventTarget {
  currentTime = 0;
  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;
  nextPlay = Promise.resolve();
  play(): Promise<void> { this.playCalls++; return this.nextPlay; }
  pause(): void { this.pauseCalls++; }
  load(): void { this.loadCalls++; }
  finish(): void { this.dispatchEvent(new Event("ended")); }
}

test("calls play automatically without playing anything on page load", () => {
  const audio = new FakeAudio();
  const sound = new MonitorChime(audio);
  expect(audio.playCalls).toBe(0);
  sound.notify();
  expect(audio.playCalls).toBe(1);
  audio.finish();
  sound.notify();
  expect(audio.playCalls).toBe(2);
});

test("a burst of calls never overlaps playback and queues at most one extra chime", () => {
  const audio = new FakeAudio();
  const sound = new MonitorChime(audio, () => {});
  sound.notify();
  audio.finish();
  sound.notify();
  for (let index = 0; index < 20; index++) sound.notify();
  expect(audio.playCalls).toBe(2);
  audio.finish();
  expect(audio.playCalls).toBe(3);
  audio.finish();
  expect(audio.playCalls).toBe(3);
});

test("reset stops the sound and discards queued calls without disabling future notifications", () => {
  const audio = new FakeAudio();
  const sound = new MonitorChime(audio, () => {});
  sound.notify();
  sound.notify();
  sound.stop();
  audio.finish();
  expect(audio.playCalls).toBe(1);
  sound.notify();
  expect(audio.playCalls).toBe(2);
});

test("an autoplay block discards queued calls and retries only on future notifications", async () => {
  const audio = new FakeAudio();
  const states: ChimeState[] = [];
  const sound = new MonitorChime(audio, state => states.push(state));
  audio.nextPlay = Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
  sound.notify();
  sound.notify();
  await Promise.resolve();
  await Promise.resolve();
  expect(states).toEqual(["blocked"]);
  audio.finish();
  expect(audio.playCalls).toBe(1);

  audio.nextPlay = Promise.reject(new DOMException("Still blocked", "NotAllowedError"));
  sound.notify();
  await Promise.resolve();
  await Promise.resolve();
  expect(audio.playCalls).toBe(2);
  expect(states).toEqual(["blocked", "retrying", "blocked"]);

  audio.nextPlay = Promise.resolve();
  // Permission becoming available does not replay a missed call.
  expect(audio.playCalls).toBe(2);
  sound.notify();
  expect(audio.playCalls).toBe(3);
  expect(audio.loadCalls).toBe(0);
});

test("successful playback clears the notice but a later permission change shows it again", async () => {
  const audio = new FakeAudio();
  const states: ChimeState[] = [];
  const sound = new MonitorChime(audio, state => states.push(state));
  audio.nextPlay = Promise.reject(new DOMException("blocked", "NotAllowedError"));
  sound.notify();
  await Promise.resolve(); await Promise.resolve();
  audio.nextPlay = Promise.resolve();
  sound.notify();
  await Promise.resolve();
  expect(audio.playCalls).toBe(2);
  audio.finish();
  audio.nextPlay = Promise.reject(new DOMException("blocked again", "NotAllowedError"));
  sound.notify();
  await Promise.resolve(); await Promise.resolve();
  expect(states).toEqual(["blocked", "retrying", "ready", "blocked"]);
});

test("a late rejection from cancelled playback does not stop the next call", async () => {
  const audio = new FakeAudio();
  const states: ChimeState[] = [];
  const sound = new MonitorChime(audio, state => states.push(state));
  let reject!: (error: Error) => void;
  audio.nextPlay = new Promise((_, fail) => { reject = fail; });
  sound.notify();
  sound.stop();
  audio.nextPlay = Promise.resolve();
  sound.notify();
  reject(new Error("Old playback was aborted"));
  await Promise.resolve();
  await Promise.resolve();
  expect(states).toEqual([]);
  expect(audio.pauseCalls).toBe(1);
  sound.notify();
  expect(audio.playCalls).toBe(2);
  audio.finish();
  expect(audio.playCalls).toBe(3);
});

test("a media loading failure clears both playback and the pending chime", () => {
  const audio = new FakeAudio();
  const states: ChimeState[] = [];
  const sound = new MonitorChime(audio, state => states.push(state));
  sound.notify();
  sound.notify();
  audio.dispatchEvent(new Event("error"));
  audio.finish();
  expect(audio.playCalls).toBe(1);
  expect(states).toEqual(["unavailable"]);
  sound.notify();
  expect(audio.loadCalls).toBe(1);
  expect(audio.playCalls).toBe(2);
});

test("the enable action starts playback synchronously and hides the notice only after success", async () => {
  const audio = new FakeAudio();
  const states: ChimeState[] = [];
  const sound = new MonitorChime(audio, state => states.push(state));
  audio.nextPlay = Promise.reject(new DOMException("blocked", "NotAllowedError"));
  sound.notify();
  await Promise.resolve(); await Promise.resolve();

  let played!: () => void;
  audio.nextPlay = new Promise(resolve => { played = resolve; });
  sound.retry();
  expect(audio.playCalls).toBe(2);
  expect(states.at(-1)).toBe("retrying");
  sound.retry();
  expect(audio.playCalls).toBe(2);
  played();
  await Promise.resolve();
  expect(states.at(-1)).toBe("ready");
  audio.finish();
  expect(audio.playCalls).toBe(2);
  sound.notify();
  expect(audio.playCalls).toBe(3);
});

test("a denied enable action retains the notice and remains retryable", async () => {
  const audio = new FakeAudio();
  const states: ChimeState[] = [];
  const sound = new MonitorChime(audio, state => states.push(state));
  audio.nextPlay = Promise.reject(new DOMException("site setting blocked", "NotAllowedError"));
  sound.notify();
  await Promise.resolve(); await Promise.resolve();
  sound.retry();
  await Promise.resolve(); await Promise.resolve();
  expect(states).toEqual(["blocked", "retrying", "blocked"]);
  audio.nextPlay = Promise.resolve();
  sound.retry();
  await Promise.resolve();
  expect(states.at(-1)).toBe("ready");
});

test("a cancelled retry keeps the notice even if the old playback later resolves", async () => {
  const audio = new FakeAudio();
  const states: ChimeState[] = [];
  const sound = new MonitorChime(audio, state => states.push(state));
  audio.nextPlay = Promise.reject(new DOMException("blocked", "NotAllowedError"));
  sound.notify();
  await Promise.resolve(); await Promise.resolve();
  let played!: () => void;
  audio.nextPlay = new Promise(resolve => { played = resolve; });
  sound.retry();
  sound.stop();
  expect(states.at(-1)).toBe("blocked");
  played();
  await Promise.resolve();
  expect(states.at(-1)).toBe("blocked");
  sound.retry();
  await Promise.resolve();
  expect(states.at(-1)).toBe("ready");
});

test("a media failure can be reloaded and retried from the recovery action", async () => {
  const audio = new FakeAudio();
  const states: ChimeState[] = [];
  const sound = new MonitorChime(audio, state => states.push(state));
  audio.dispatchEvent(new Event("error"));
  sound.retry();
  expect(audio.loadCalls).toBe(1);
  expect(states.at(-1)).toBe("retrying");
  await Promise.resolve();
  expect(states.at(-1)).toBe("ready");
});

test("the bundled WAV contains exactly one second of stereo PCM", async () => {
  const bytes = await Bun.file(new URL("../src/assets/monitor-call-chime.wav", import.meta.url)).arrayBuffer();
  const header = new DataView(bytes);
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
  expect(header.getUint16(20, true)).toBe(1); // PCM
  expect(header.getUint16(22, true)).toBe(2); // stereo
  expect(header.getUint32(24, true)).toBe(44100);
  expect(header.getUint16(34, true)).toBe(16);
  expect(header.getUint32(40, true)).toBe(44100 * 2 * 2);
});
