import {
  hzMidi,
  writtenToConcert,
  type Note,
  type Difficulty,
  difficulties,
} from "./music";
export type PitchFrame = {
  hz: number;
  confidence: number;
  rms: number;
  clipRatio: number;
  capturedAt: number;
  windowSeconds: number;
  sampleRate: number;
  analysisRate: number;
};
export type NoteScore = {
  onset: number | null;
  held: number;
  total: number;
  cents: number[];
  complete: boolean;
};
export const blankScores = (notes: Note[]): NoteScore[] =>
  notes.map(() => ({
    onset: null,
    held: 0,
    total: 0,
    cents: [],
    complete: false,
  }));
export function scoreSummary(scores: NoteScore[], notes: Note[], bpm: number) {
  const pitch =
    scores.reduce((s, x) => s + x.held, 0) /
    Math.max(
      0.001,
      notes.reduce((s, n) => s + (n.length * 60) / bpm, 0),
    );
  const timing =
    scores.filter((s) => s.onset !== null).length / Math.max(1, notes.length);
  const deviations = scores.flatMap((x) => x.cents);
  const mean =
    deviations.reduce((a, b) => a + b, 0) / Math.max(1, deviations.length);
  const stability = deviations.length
    ? Math.sqrt(
        deviations.reduce((a, b) => a + (b - mean) ** 2, 0) / deviations.length,
      )
    : null;
  return {
    score: Math.round(100 * (Math.min(1, pitch) * 0.7 + timing * 0.3)),
    pitch: Math.round(100 * Math.min(1, pitch)),
    attacks: scores.filter((x) => x.onset !== null).length,
    stability,
    completed: scores.filter((x) => x.complete).length,
  };
}
export class Scorer {
  scores: NoteScore[];
  private lastTime: number | null = null;
  private lastMidi: number | null = null;
  private lastVoice = -100;
  constructor(
    public notes: Note[],
    public bpm: number,
    public difficulty: Difficulty,
    public tuning = 440,
  ) {
    this.scores = blankScores(notes);
  }
  process(frame: PitchFrame, elapsed: number) {
    const dt =
      this.lastTime === null
        ? 0
        : Math.min(0.04, Math.max(0, elapsed - this.lastTime));
    if (this.lastTime !== null && elapsed <= this.lastTime) return;
    this.lastTime = elapsed;
    const voiced =
      frame.hz > 0 && frame.confidence >= 0.85 && frame.clipRatio < 0.1;
    const midi = voiced ? hzMidi(frame.hz, this.tuning) : null;
    const attack =
      midi !== null &&
      (elapsed - this.lastVoice > 0.07 ||
        this.lastMidi === null ||
        Math.abs(midi - this.lastMidi) > 0.65);
    const config = difficulties[this.difficulty];
    if (midi !== null) {
      for (let i = 0; i < this.notes.length; i++) {
        const n = this.notes[i],
          s = this.scores[i],
          start = (n.beat * 60) / this.bpm,
          duration = (n.length * 60) / this.bpm;
        const cents = (midi - writtenToConcert(n.midi)) * 100,
          correct = Math.abs(cents) <= config.cents;
        if (
          attack &&
          correct &&
          s.onset === null &&
          Math.abs(elapsed - start) <= config.timing
        )
          s.onset = elapsed - start;
        if (elapsed >= start && elapsed <= start + duration) {
          s.total += dt;
          if (correct) {
            s.held += Math.min(dt, Math.max(0, elapsed - start));
            s.cents.push(cents);
          }
          s.complete = s.held >= duration * 0.7;
        }
      }
      this.lastVoice = elapsed;
      this.lastMidi = midi;
    }
  }
}
