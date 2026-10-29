import { describe, it, expect } from "vitest";
import { detectPitch } from "../public/dsp.js";
import {
  midiHz,
  writtenToConcert,
  hzMidi,
  charts,
  fingers,
} from "../src/music";
import { Scorer, scoreSummary, type PitchFrame } from "../src/scoring";
const sampleRate = 16000;
function signal(hz: number, harmonics = [1], amplitude = 0.2) {
  return Float32Array.from(
    { length: 1024 },
    (_, i) =>
      harmonics.reduce(
        (s, a, h) =>
          s + a * Math.sin((2 * Math.PI * hz * (h + 1) * i) / sampleRate),
        0,
      ) * amplitude,
  );
}
const frame = (hz: number, t = 0): PitchFrame => ({
  hz,
  confidence: 0.98,
  rms: 0.2,
  clipRatio: 0,
  capturedAt: t,
  windowSeconds: 0.064,
  sampleRate: 48000,
  analysisRate: 16000,
});
function feed(s: Scorer, hz: number, start: number, end: number) {
  for (let t = start; t <= end; t += 0.016) s.process(frame(hz, t), t);
}
describe("YIN acoustic foundations", () => {
  it.each([116.54, 233.08, 329.63, 466.16, 932.33])(
    "detects %f Hz across trumpet range",
    (hz) => {
      const r = detectPitch(signal(hz), sampleRate);
      expect(Math.abs(1200 * Math.log2(r.hz / hz))).toBeLessThan(6);
      expect(r.confidence).toBeGreaterThan(0.9);
    },
  );
  it("finds fundamental when second harmonic is stronger", () => {
    const hz = midiHz(58);
    const r = detectPitch(signal(hz, [0.35, 1, 0.5, 0.2]), sampleRate);
    expect(Math.abs(1200 * Math.log2(r.hz / hz))).toBeLessThan(8);
  });
  it("rejects silence, low level and deterministic broadband noise", () => {
    expect(detectPitch(new Float32Array(1024), sampleRate).hz).toBe(0);
    expect(detectPitch(signal(233, [1], 0.001), sampleRate).hz).toBe(0);
    let seed = 19;
    const noise = Float32Array.from({ length: 1024 }, () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647 - 0.5) * 0.3;
    });
    expect(detectPitch(noise, sampleRate).hz).toBe(0);
  });
  it("rejects hard clipped signals", () => {
    const clipped = signal(233, [1], 3).map((x) =>
      Math.max(-1, Math.min(1, x)),
    );
    const r = detectPitch(clipped, sampleRate);
    expect(r.hz).toBe(0);
    expect(r.clipRatio).toBeGreaterThan(0.1);
  });
  it("retains detuning for cents feedback", () => {
    const hz = midiHz(58) * 2 ** (23 / 1200);
    const r = detectPitch(signal(hz), sampleRate);
    expect((hzMidi(r.hz) - 58) * 100).toBeCloseTo(23, 0);
  });
});
describe("written/concert notes and complete chart data", () => {
  it("maps written C4 to concert Bb3, not Bb4", () => {
    expect(writtenToConcert(60)).toBe(58);
    expect(midiHz(58)).toBeCloseTo(233.0819, 3);
  });
  it("has five lessons and three original charts with supported fingering", () => {
    expect(charts.filter((c) => c.lesson)).toHaveLength(5);
    expect(charts.filter((c) => !c.lesson)).toHaveLength(3);
    for (const c of charts)
      for (const n of c.notes) {
        expect(fingers[n.midi]).toBeDefined();
        expect(n.length).toBeGreaterThan(0);
      }
  });
});
describe("rhythm scoring", () => {
  const notes = [
    { midi: 60, beat: 1, length: 0.8 },
    { midi: 60, beat: 2, length: 0.8 },
  ];
  it("rewards timed attack, sustained pitch and fresh repeated articulation", () => {
    const s = new Scorer(notes, 60, "Balanced");
    feed(s, 0, 0, 0.9);
    feed(s, midiHz(58), 1, 1.8);
    feed(s, 0, 1.82, 1.98);
    feed(s, midiHz(58), 2, 2.8);
    const summary = scoreSummary(s.scores, notes, 60);
    expect(summary.attacks).toBe(2);
    expect(summary.completed).toBe(2);
    expect(summary.score).toBeGreaterThan(95);
  });
  it("never rewards silence or a wrong octave", () => {
    const s = new Scorer(notes, 60, "Gentle");
    feed(s, 0, 0, 1);
    feed(s, midiHz(70), 1, 3);
    expect(scoreSummary(s.scores, notes, 60).score).toBe(0);
  });
  it("scores pitch duration but not fresh attacks for continuous repeated pitch", () => {
    const s = new Scorer(notes, 60, "Gentle");
    feed(s, midiHz(58), 1, 3);
    expect(s.scores[0].onset).not.toBeNull();
    expect(s.scores[1].onset).toBeNull();
  });
  it.each([
    ["Gentle", 0.19, true],
    ["Balanced", 0.13, false],
    ["Focused", 0.061, false],
  ] as const)("applies %s onset timing window", (level, late, accepted) => {
    const s = new Scorer([{ midi: 60, beat: 1, length: 1 }], 60, level);
    s.process(frame(midiHz(58)), 1 + late);
    expect(s.scores[0].onset !== null).toBe(accepted);
  });
  it("rejects out-of-tolerance pitch and clips", () => {
    const s = new Scorer(notes, 60, "Focused");
    feed(s, midiHz(58) * 2 ** (40 / 1200), 1, 2.8);
    expect(scoreSummary(s.scores, notes, 60).score).toBe(0);
    const c = new Scorer(notes, 60, "Gentle");
    c.process({ ...frame(midiHz(58)), clipRatio: 0.2 }, 1);
    expect(c.scores[0].onset).toBeNull();
  });
  it("ignores duplicate/backward frames and caps gaps so resume does not add a pause", () => {
    const s = new Scorer([{ midi: 60, beat: 0, length: 10 }], 60, "Gentle");
    s.process(frame(midiHz(58)), 0);
    s.process(frame(midiHz(58)), 0.02);
    const held = s.scores[0].held;
    s.process(frame(midiHz(58)), 0.02);
    s.process(frame(midiHz(58)), 0.01);
    expect(s.scores[0].held).toBe(held);
    s.process(frame(midiHz(58)), 5);
    expect(s.scores[0].held - held).toBeLessThanOrEqual(0.041);
  });
});
