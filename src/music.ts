export const midiHz = (midi: number, tuning = 440) =>
  tuning * 2 ** ((midi - 69) / 12);
export const hzMidi = (hz: number, tuning = 440) =>
  69 + 12 * Math.log2(hz / tuning);
export const writtenToConcert = (midi: number) => midi - 2;
export function noteName(midi: number) {
  const n = Math.round(midi);
  return (
    ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][
      ((n % 12) + 12) % 12
    ] +
    (Math.floor(n / 12) - 1)
  );
}
export const fingers: Record<number, number[]> = {
  60: [],
  62: [1, 3],
  64: [1, 2],
  65: [1],
  67: [],
  69: [1, 2],
  71: [2],
  72: [],
};
export type Note = { midi: number; beat: number; length: number };
export type Chart = {
  id: string;
  title: string;
  subtitle: string;
  bpm: number;
  notes: Note[];
  lesson?: number;
  tip: string;
};
const phrase = (pitches: number[], length = 1): Note[] =>
  pitches.map((midi, i) => ({ midi, beat: i * length, length: length * 0.8 }));
export const charts: Chart[] = [
  {
    id: "breath",
    title: "Find your sound",
    subtitle: "01 / Breath & a steady C",
    lesson: 1,
    bpm: 60,
    notes: phrase([60, 60, 60, 60], 3),
    tip: "Sit tall. Take an easy breath and let the air flow. Play written C4 with all valves open. Rest and breathe between notes. Stop if you feel dizzy.",
  },
  {
    id: "tongue",
    title: "A clean beginning",
    subtitle: "02 / Gentle articulation",
    lesson: 2,
    bpm: 64,
    notes: phrase([60, 60, 60, 60, 60, 60, 60, 60]),
    tip: "Think “too” to begin each note. Keep the air moving, release between repeated notes, and avoid pressing the mouthpiece into your lips.",
  },
  {
    id: "steps",
    title: "First three notes",
    subtitle: "03 / C · D · E",
    lesson: 3,
    bpm: 64,
    notes: phrase([60, 62, 64, 62, 60, 62, 64, 60], 2),
    tip: "C: open. D: valves 1 + 3. E: valves 1 + 2. Change fingers together; listen for the center of each note.",
  },
  {
    id: "long",
    title: "Hold the center",
    subtitle: "04 / Long tones & stability",
    lesson: 4,
    bpm: 60,
    notes: phrase([60, 64, 67, 64], 4),
    tip: "Aim for an even tone through each long note. Keep your breath comfortable. The pitch meter should settle near the center; do not force high notes.",
  },
  {
    id: "rhythm",
    title: "Put it together",
    subtitle: "05 / Pulse & melody",
    lesson: 5,
    bpm: 72,
    notes: phrase([60, 62, 64, 65, 67, 65, 64, 62, 60, 60, 67, 60]),
    tip: "Count four beats before you enter. Play with the metronome, leave space between notes, then try a slightly faster tempo when comfortable.",
  },
  {
    id: "sunrise",
    title: "First light",
    subtitle: "Original · 12 notes",
    bpm: 76,
    notes: phrase([60, 64, 67, 64, 62, 65, 67, 65, 64, 62, 60, 60]),
    tip: "A small melody built from your first five notes. Breathe after every four notes.",
  },
  {
    id: "river",
    title: "River walk",
    subtitle: "Original · 16 notes",
    bpm: 88,
    notes: phrase([
      60, 62, 64, 65, 67, 64, 62, 60, 64, 65, 67, 65, 64, 62, 60, 60,
    ]),
    tip: "Keep your fingers close to the valves and your air steady through the rising line.",
  },
  {
    id: "echo",
    title: "Golden echo",
    subtitle: "Original · 12 notes",
    bpm: 80,
    notes: phrase([67, 64, 60, 62, 64, 67, 65, 62, 60, 64, 62, 60], 1.5),
    tip: "A relaxed three-beat pattern. Count carefully and aim for a centered sound.",
  },
];
export const difficulties = {
  Gentle: { timing: 0.2, cents: 50 },
  Balanced: { timing: 0.12, cents: 35 },
  Focused: { timing: 0.06, cents: 25 },
};
export type Difficulty = keyof typeof difficulties;
