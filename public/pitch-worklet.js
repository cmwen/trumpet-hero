import { detectPitch } from "./dsp.js";
class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(1024);
    this.clips = new Float32Array(1024);
    this.blockClips = 0;
    this.write = 0;
    this.total = 0;
    this.hop = 0;
    this.noiseFloor = 0.008;
    this.factor = Math.max(1, Math.floor(sampleRate / 16000));
    this.phase = 0;
    this.accumulator = 0;
    this.port.onmessage = (e) => {
      if (Number.isFinite(e.data.noiseFloor))
        this.noiseFloor = e.data.noiseFloor;
    };
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.accumulator += input[i];
      this.phase++;
      if (Math.abs(input[i]) >= 0.98) this.blockClips++;
      if (this.phase < this.factor) continue;
      this.clips[this.write] = this.blockClips / this.factor;
      this.blockClips = 0;
      this.frame[this.write] = this.accumulator / this.factor;
      this.phase = 0;
      this.accumulator = 0;
      this.write = (this.write + 1) % 1024;
      this.total++;
      this.hop++;
      if (this.total >= 1024 && this.hop >= 256) {
        this.hop = 0;
        const ordered = new Float32Array(1024);
        for (let j = 0; j < 1024; j++)
          ordered[j] = this.frame[(this.write + j) % 1024];
        const rate = sampleRate / this.factor;
        const windowSeconds = 1024 / rate;
        // Audio graph clock at CENTER of captured analysis window, not receipt time.
        const capturedAt =
          currentTime + (i + 1) / sampleRate - windowSeconds / 2;
        const result = detectPitch(ordered, rate, this.noiseFloor);
        const rawClipRatio = this.clips.reduce((a, b) => a + b, 0) / 1024;
        result.clipRatio = Math.max(result.clipRatio, rawClipRatio);
        if (result.clipRatio > 0.1) {
          result.hz = 0;
          result.confidence = 0;
        }
        this.port.postMessage({
          ...result,
          capturedAt,
          windowSeconds,
          sampleRate,
          analysisRate: rate,
        });
      }
    }
    return true;
  }
}
registerProcessor("trumpet-pitch", PitchProcessor);
