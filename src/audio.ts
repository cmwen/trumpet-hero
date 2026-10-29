import type { PitchFrame } from "./scoring";
export class AudioEngine {
  context: AudioContext | null = null;
  stream: MediaStream | null = null;
  node: AudioWorkletNode | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  private generation = 0;
  suppressedUntil = 0;
  settings: MediaTrackSettings | undefined;
  private voices = new Set<OscillatorNode>();
  async start(
    onFrame: (f: PitchFrame) => void,
    noiseFloor: number,
    onEnded: () => void,
  ) {
    if (!window.isSecureContext)
      throw new Error(
        "Microphone needs HTTPS or localhost. Open this app on a secure address, then try again.",
      );
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "This browser has no microphone capture. Try a current Chrome, Safari, Edge or Firefox browser.",
      );
    const generation = ++this.generation;
    try {
      this.context = new AudioContext({ latencyHint: "interactive" });
      await this.context.resume();
      const context = this.context;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        if (context.state !== "closed") await context.close();
        return;
      }
      this.stream = stream;
      this.stream.getTracks().forEach((t) => (t.onended = onEnded));
      this.settings = this.stream.getAudioTracks()[0].getSettings();
      await this.context.audioWorklet.addModule(
        new URL("pitch-worklet.js", document.baseURI).href,
      );
      if (generation !== this.generation) return;
      this.node = new AudioWorkletNode(this.context, "trumpet-pitch");
      this.node.port.onmessage = (e) => onFrame(e.data);
      this.setNoiseFloor(noiseFloor);
      this.source = this.context.createMediaStreamSource(this.stream);
      this.source.connect(this.node);
      const silent = this.context.createGain();
      silent.gain.value = 0;
      this.node.connect(silent);
      silent.connect(this.context.destination);
    } catch (e) {
      await this.stop();
      const name = e instanceof DOMException ? e.name : "";
      throw new Error(
        name === "NotAllowedError"
          ? "Microphone permission was denied. Allow microphone access in your browser’s site settings, then reconnect."
          : name === "NotFoundError"
            ? "No microphone was found. Connect or enable a microphone, then reconnect."
            : name === "NotReadableError"
              ? "Microphone is busy or unavailable. Close other audio apps and reconnect."
              : e instanceof Error
                ? e.message
                : "Audio setup failed. Reconnect your microphone.",
      );
    }
  }
  setNoiseFloor(value: number) {
    this.node?.port.postMessage({ noiseFloor: value });
  }
  get now() {
    return this.context?.currentTime ?? 0;
  }
  tone(hz: number, duration = 1.5) {
    if (!this.context) return;
    this.cancelSounds();
    this.suppressedUntil = this.now + duration + 0.45;
    this.beep(this.now, hz, duration, 0.12);
  }
  beep(when: number, hz: number, duration = 0.035, volume = 0.06) {
    const ctx = this.context;
    if (!ctx) return;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = hz;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(volume, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(when);
    o.stop(when + duration + 0.01);
    this.voices.add(o);
    o.onended = () => {
      this.voices.delete(o);
      o.disconnect();
      g.disconnect();
    };
  }
  cancelSounds() {
    for (const o of this.voices) {
      try {
        o.stop();
      } catch {
        /* already ended */
      }
    }
    this.voices.clear();
  }
  async stop() {
    this.generation++;
    this.cancelSounds();
    this.source?.disconnect();
    this.node?.disconnect();
    this.node?.port.close();
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    if (this.context && this.context.state !== "closed")
      await this.context.close();
    this.context = null;
    this.stream = null;
    this.node = null;
    this.source = null;
  }
}
