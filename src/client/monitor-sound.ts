type SoundSnapshot = {
  locations: { waiting: { fulfillment_id: string }[]; calling: { fulfillment_id: string }[] }[];
  order_generation?: number;
};

// Compare tasks rather than display numbers: one order can be called separately
// at several locations. Initial/reconnected snapshots establish a silent baseline.
export class MonitorCallTracker {
  private generation: number | null = null;
  private waiting = new Set<string>();

  accept(snapshot: SoundSnapshot, silent = false): boolean {
    const generation = snapshot.order_generation ?? 0;
    if (this.generation !== null && generation < this.generation) return false;
    const transitioned = !silent && this.generation === generation
      && snapshot.locations.some(location => location.calling.some(entry => this.waiting.has(entry.fulfillment_id)));
    this.generation = generation;
    this.waiting = new Set(snapshot.locations.flatMap(location => location.waiting.map(entry => entry.fulfillment_id)));
    return transitioned;
  }
}

type AudioPlayer = Pick<HTMLAudioElement, "play" | "pause" | "load" | "currentTime" | "addEventListener">;
export type ChimeError = "blocked" | "unavailable";
export type ChimeState = "ready" | "retrying" | ChimeError;

export class MonitorChime {
  private playing = false;
  private queued = false;
  private playbackVersion = 0;
  private needsReload = false;
  private lastError: ChimeError | null = null;
  private state: ChimeState = "ready";

  constructor(private audio: AudioPlayer, private onStateChange: (state: ChimeState) => void = () => {}) {
    audio.addEventListener("ended", () => {
      this.playing = false;
      if (this.queued) {
        this.queued = false;
        this.start();
      }
    });
    audio.addEventListener("error", () => this.fail(new Error("Media could not be loaded")));
  }

  notify(): void {
    if (this.playing) { this.queued = true; return; }
    this.start();
  }

  // Call synchronously from the button's click handler so Safari can associate
  // playback with the gesture. A double click must not queue a confirmation tone.
  retry(): void {
    if (!this.playing) this.start();
  }

  stop(): void {
    this.playbackVersion += 1;
    this.playing = false;
    this.queued = false;
    this.audio.pause();
    this.audio.currentTime = 0;
    if (this.state === "retrying") this.setState(this.lastError ?? "ready");
  }

  private start(): void {
    const version = ++this.playbackVersion;
    this.playing = true;
    if (this.lastError) this.setState("retrying");
    try {
      if (this.needsReload) { this.needsReload = false; this.audio.load(); }
      this.audio.currentTime = 0;
      void this.audio.play().then(() => {
        if (version !== this.playbackVersion) return;
        this.lastError = null;
        this.setState("ready");
      }).catch(error => {
        if (version === this.playbackVersion) this.fail(error);
      });
    } catch (error) { if (version === this.playbackVersion) this.fail(error); }
  }

  private fail(reason: unknown): void {
    const blocked = typeof reason === "object" && reason !== null && "name" in reason && reason.name === "NotAllowedError";
    const error: ChimeError = blocked ? "blocked" : "unavailable";
    this.needsReload = !blocked;
    this.lastError = error;
    this.stop();
    // Missed calls are discarded; the operator can retry from the notice, or
    // the next real call can recover after changing the browser's site settings.
    this.setState(error);
  }

  private setState(state: ChimeState): void {
    if (this.state === state) return;
    this.state = state;
    this.onStateChange(state);
  }
}
