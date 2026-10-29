import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../src/audio";
import type { PitchFrame } from "../src/scoring";
afterEach(() => vi.unstubAllGlobals());
describe("real worklet framing", () => {
  it("timestamps window center and rejects native clipping before averaging", async () => {
    const messages: PitchFrame[] = [];
    vi.stubGlobal("sampleRate", 48000);
    vi.stubGlobal("currentTime", 0);
    vi.stubGlobal(
      "AudioWorkletProcessor",
      class {
        port = {
          postMessage: (f: PitchFrame) => messages.push(f),
          onmessage: null,
        };
      },
    );
    let Processor: any;
    vi.stubGlobal("registerProcessor", (_name: string, p: unknown) => {
      Processor = p;
    });
    await import("../public/pitch-worklet.js");
    const processor = new Processor();
    for (let block = 0; block < 24; block++) {
      vi.stubGlobal("currentTime", (block * 128) / 48000);
      processor.process([
        [
          Float32Array.from(
            { length: 128 },
            (_, i) =>
              0.2 *
              Math.sin((2 * Math.PI * 233.0819 * (block * 128 + i)) / 48000),
          ),
        ],
      ]);
    }
    expect(messages).toHaveLength(1);
    expect(messages[0].capturedAt).toBeCloseTo(0.032, 6);
    expect(messages[0].windowSeconds).toBeCloseTo(0.064, 6);
    expect(messages[0].analysisRate).toBe(16000);
    expect(messages[0].hz).toBeCloseTo(233.08, 0);
    for (let block = 24; block < 48; block++) {
      vi.stubGlobal("currentTime", (block * 128) / 48000);
      // Opposing clipped samples mostly cancel under averaging; native clipping must still reject them.
      processor.process([
        [
          Float32Array.from({ length: 128 }, (_, i) =>
            (block * 128 + i) % 2 ? 1 : -1,
          ),
        ],
      ]);
    }
    expect(messages.at(-1)!.clipRatio).toBe(1);
    expect(messages.at(-1)!.hz).toBe(0);
  });
});
describe("microphone lifecycle", () => {
  it("stops a stream that arrives after disconnect during permission prompt", async () => {
    let resolveStream!: (value: MediaStream) => void;
    const request = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: () => request },
    });
    const close = vi.fn(async () => {});
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "running";
        resume = async () => {};
        close = close;
      },
    );
    const stopTrack = vi.fn();
    const engine = new AudioEngine();
    const start = engine.start(
      () => {},
      0.008,
      () => {},
    );
    await Promise.resolve();
    await engine.stop();
    resolveStream({
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream);
    await start;
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalled();
    expect(engine.stream).toBeNull();
    expect(engine.context).toBeNull();
  });
});
