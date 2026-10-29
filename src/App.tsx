import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine } from "./audio";
import {
  charts,
  difficulties,
  fingers,
  hzMidi,
  midiHz,
  noteName,
  writtenToConcert,
  type Chart,
  type Difficulty,
} from "./music";
import { Scorer, scoreSummary, type PitchFrame } from "./scoring";
import {
  clearProgress,
  defaults,
  readStore,
  saveStore,
  type Progress,
  type Settings,
} from "./storage";
import { NoteHighway } from "./NoteHighway";
type Mode = "Guided" | "Rhythm";
type Session = {
  chart: Chart;
  bpm: number;
  mode: Mode;
  start: number;
  paused: boolean;
  elapsed: number;
  scorer: Scorer;
  learnIndex: number;
  hold: number;
  lastFrame: number;
  release: boolean;
  clicks: Set<number>;
};
const silent: PitchFrame = {
  hz: 0,
  confidence: 0,
  rms: 0,
  clipRatio: 0,
  capturedAt: 0,
  windowSeconds: 0,
  sampleRate: 0,
  analysisRate: 0,
};
const download = (name: string, value: unknown) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export default function App() {
  const [tab, setTab] = useState<"Practice" | "Sound check" | "Progress">(
      "Sound check",
    ),
    [chart, setChart] = useState(charts[0]),
    [mode, setMode] = useState<Mode>("Guided"),
    [difficulty, setDifficulty] = useState<Difficulty>("Gentle"),
    [bpm, setBpm] = useState(60),
    [settings, setSettings] = useState<Settings>(defaults),
    [progress, setProgress] = useState<Progress[]>([]);
  const [connected, setConnected] = useState(false),
    [connecting, setConnecting] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [frame, setFrame] = useState<PitchFrame>(silent),
    [running, setRunning] = useState(false),
    [paused, setPaused] = useState(false),
    [tick, setTick] = useState(0),
    [result, setResult] = useState<Progress | null>(null),
    [calibrating, setCalibrating] = useState(false),
    [metronome, setMetronome] = useState(true),
    [reduced, setReduced] = useState(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  const engine = useRef(new AudioEngine()),
    session = useRef<Session | null>(null),
    settingsRef = useRef(settings),
    latest = useRef(silent),
    calibration = useRef<{ until: number; values: number[] } | null>(null),
    renderAt = useRef(0),
    clock = useRef(0),
    metro = useRef(true),
    delay = useRef(0);
  settingsRef.current = settings;
  metro.current = metronome;
  const persistSettings = useCallback((next: Settings) => {
    setSettings(next);
    settingsRef.current = next;
    engine.current.setNoiseFloor(next.noiseFloor);
    void saveStore("settings", next, "audio").catch(() =>
      setNotice(
        "Browser storage is unavailable. Settings last for this visit only.",
      ),
    );
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([
      readStore<Settings>("settings", "audio"),
      readStore<Progress[]>("progress"),
    ])
      .then(([s, p]) => {
        if (active) {
          if (s) setSettings(s);
          setProgress(p ?? []);
        }
      })
      .catch(() =>
        setNotice(
          "Browser storage is unavailable. Your progress may not persist.",
        ),
      );
    return () => {
      active = false;
      void engine.current.stop();
    };
  }, []);
  const finish = useCallback((save = true) => {
    const s = session.current;
    if (!s) return;
    engine.current.cancelSounds();
    session.current = null;
    setRunning(false);
    setPaused(false);
    if (save) {
      const summary = scoreSummary(s.scorer.scores, s.chart.notes, s.bpm);
      const r: Progress = {
        chart: s.chart.id,
        ...summary,
        score:
          s.mode === "Guided"
            ? Math.round((100 * summary.completed) / s.chart.notes.length)
            : summary.score,
        mode: s.mode,
        date: new Date().toISOString(),
      };
      setResult(r);
      setProgress((p) => [...p, r]);
      void saveStore("progress", r).catch(() =>
        setNotice(
          "This result could not be saved. Browser storage may be full or disabled.",
        ),
      );
    }
  }, []);
  const onFrame = useCallback(
    (f: PitchFrame) => {
      latest.current = f;
      delay.current =
        Math.max(0, engine.current.now - f.capturedAt - f.windowSeconds / 2) *
        1000;
      if (performance.now() - renderAt.current > 90) {
        setFrame(f);
        renderAt.current = performance.now();
      }
      const cal = calibration.current;
      if (cal) {
        cal.values.push(f.rms);
        if (engine.current.now >= cal.until) {
          const sorted = cal.values.sort((a, b) => a - b);
          const floor = Math.max(
            0.003,
            Math.min(
              0.08,
              (sorted[Math.floor(sorted.length * 0.9)] ?? 0.004) * 2,
            ),
          );
          persistSettings({
            ...settingsRef.current,
            noiseFloor: floor,
            calibratedAt: new Date().toISOString(),
          });
          calibration.current = null;
          setCalibrating(false);
          setNotice(
            `Room noise measured. Gate set to ${floor.toFixed(3)} RMS. This does not measure device latency.`,
          );
        }
        return;
      }
      const s = session.current;
      if (!s || s.paused || engine.current.now < engine.current.suppressedUntil)
        return;
      const elapsed =
        f.capturedAt - s.start - settingsRef.current.offsetMs / 1000;
      if (elapsed < 0) return;
      if (s.mode === "Rhythm") {
        s.scorer.process(f, elapsed);
        return;
      }
      const n = s.chart.notes[s.learnIndex];
      if (!n) return;
      const dt = s.lastFrame
        ? Math.min(0.04, Math.max(0, f.capturedAt - s.lastFrame))
        : 0;
      s.lastFrame = f.capturedAt;
      const voiced = f.hz > 0 && f.confidence >= 0.85 && f.clipRatio < 0.1;
      if (s.release) {
        if (!voiced) s.release = false;
        return;
      }
      const cents = voiced
        ? (hzMidi(f.hz, settingsRef.current.tuning) -
            writtenToConcert(n.midi)) *
          100
        : Infinity;
      if (Math.abs(cents) <= difficulties[s.scorer.difficulty].cents) {
        s.hold += dt;
        s.scorer.scores[s.learnIndex].cents.push(cents);
      } else s.hold = 0;
      const required = ((n.length * 60) / s.bpm) * 0.7;
      if (s.hold >= required) {
        const score = s.scorer.scores[s.learnIndex];
        score.held = required;
        score.complete = true;
        score.onset = 0;
        s.learnIndex++;
        s.hold = 0;
        s.release = s.chart.notes[s.learnIndex]?.midi === n.midi;
        if (s.learnIndex >= s.chart.notes.length) finish();
      }
    },
    [finish, persistSettings],
  );
  const disconnect = useCallback(async () => {
    finish(false);
    calibration.current = null;
    setCalibrating(false);
    await engine.current.stop();
    setConnected(false);
    setFrame(silent);
  }, [finish]);
  async function connect() {
    setConnecting(true);
    setError("");
    try {
      await engine.current.start(
        onFrame,
        settingsRef.current.noiseFloor,
        () => {
          void disconnect();
          setError(
            "Microphone disconnected. Check your connection and reconnect.",
          );
        },
      );
      if (engine.current.context)
        engine.current.context.onstatechange = () => {
          if (
            engine.current.context?.state === "suspended" &&
            session.current
          ) {
            session.current.elapsed =
              engine.current.now - session.current.start;
            session.current.paused = true;
            engine.current.cancelSounds();
            setPaused(true);
            setNotice("Audio was interrupted. Resume when you are ready.");
          }
        };
      setConnected(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not connect microphone.",
      );
    } finally {
      setConnecting(false);
    }
  }
  useEffect(() => {
    const id = setInterval(() => {
      const s = session.current;
      if (!s || s.paused) return;
      const now = engine.current.now;
      clock.current = now - s.start;
      if (
        s.mode === "Rhythm" &&
        now - s.start >
          ((s.chart.notes.at(-1)!.beat + s.chart.notes.at(-1)!.length) * 60) /
            s.bpm +
            0.25
      ) {
        finish();
        return;
      }
      // A 100ms lookahead keeps clicks on the audio clock; onset/pitch scoring uses captured sample time.
      const beatSeconds = 60 / s.bpm;
      const current = Math.floor((now - s.start) / beatSeconds);
      for (let beat = Math.max(-4, current); beat <= current + 1; beat++) {
        const when = s.start + beat * beatSeconds;
        if (when >= now && when <= now + 0.15 && !s.clicks.has(beat)) {
          s.clicks.add(beat);
          if (metro.current)
            engine.current.beep(
              when,
              beat % 4 === 0 ? 1600 : 1100,
              0.025,
              0.025,
            );
        }
      }
      setTick((t) => t + 1);
    }, 40);
    return () => clearInterval(id);
  }, [finish]);
  useEffect(() => {
    const hide = () => {
      const s = session.current;
      if (document.hidden && s && !s.paused) {
        s.elapsed = engine.current.now - s.start;
        s.paused = true;
        engine.current.cancelSounds();
        setPaused(true);
        setNotice("Practice paused while the app is in the background.");
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  function start() {
    if (!connected) return;
    engine.current.cancelSounds();
    engine.current.suppressedUntil = engine.current.now + 0.45;
    const start = engine.current.now + (4 * 60) / bpm;
    session.current = {
      chart,
      bpm,
      mode,
      start,
      paused: false,
      elapsed: 0,
      scorer: new Scorer(chart.notes, bpm, difficulty, settings.tuning),
      learnIndex: 0,
      hold: 0,
      lastFrame: 0,
      release: false,
      clicks: new Set(),
    };
    clock.current = (-4 * 60) / bpm;
    setResult(null);
    setRunning(true);
    setPaused(false);
    setTab("Practice");
  }
  async function togglePause() {
    const s = session.current;
    if (!s) return;
    if (!s.paused) {
      s.elapsed = engine.current.now - s.start;
      s.paused = true;
      engine.current.cancelSounds();
    } else {
      try {
        await engine.current.context?.resume();
        s.start = engine.current.now - s.elapsed;
        s.lastFrame = 0;
        s.paused = false;
      } catch {
        setError("Audio could not resume. Reconnect the microphone.");
      }
    }
    setPaused(s.paused);
  }
  function select(c: Chart) {
    if (running) return;
    setChart(c);
    setBpm(c.bpm);
    setResult(null);
  }
  const s = session.current,
    elapsed = s?.paused ? s.elapsed : clock.current;
  const currentIndex =
    s?.mode === "Guided"
      ? s.learnIndex
      : Math.max(
          0,
          chart.notes.findIndex(
            (n) =>
              (n.beat * 60) / bpm + (n.length * 60) / bpm >=
              Math.max(0, elapsed),
          ),
        );
  const target = chart.notes[Math.min(currentIndex, chart.notes.length - 1)];
  const measured = frame.hz ? hzMidi(frame.hz, settings.tuning) : null,
    cents =
      measured === null
        ? null
        : (measured - writtenToConcert(target.midi)) * 100;
  const getBeat = () => {
    const state = session.current;
    if (!state) return 0;
    if (state.mode === "Guided" && clock.current >= 0)
      return state.chart.notes[state.learnIndex]?.beat ?? 0;
    return (
      ((state.paused ? state.elapsed : engine.current.now - state.start) *
        state.bpm) /
      60
    );
  };
  const liveScore = s
    ? scoreSummary(s.scorer.scores, s.chart.notes, s.bpm)
    : null;
  const pitchStatus =
    frame.clipRatio > 0.1
      ? "Clipping · move farther away"
      : frame.rms < settings.noiseFloor
        ? "Listening for your trumpet"
        : !frame.hz
          ? "Unclear pitch · try a steady tone"
          : engine.current.now < engine.current.suppressedUntil
            ? "Reference playing · scoring muted"
            : "Pitch detected";
  return (
    <div className="app">
      <header>
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-icon">♬</span>
          <span>
            TRUMPET<span className="gold"> HERO</span>
            <small>YOUR DAILY PRACTICE ROOM</small>
          </span>
        </a>
        <span className="build-tag">AUDIO FOUNDATION · PREVIEW</span>
        <span className={"status " + (connected ? "ready" : "")}>
          <i />
          {connected ? "Microphone on" : "Microphone off"}
        </span>
      </header>
      <nav aria-label="Main navigation">
        {(["Practice", "Sound check", "Progress"] as const).map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <main>
        {error && (
          <div role="alert" className="banner error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="banner">
            {notice}
            <button aria-label="Dismiss message" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {tab === "Sound check" && (
          <>
            <div className="page-heading">
              <p className="eyebrow">01 / SETTLE IN</p>
              <h1>
                A great session starts
                <br />
                with a clear sound.
              </h1>
              <p>
                Connect your microphone, find the center of your note,
                <br className="desktop" /> and take a moment to get comfortable.
              </p>
            </div>
            <div className="sound-grid">
              <section className="card tuner">
                <div className="section-top">
                  <h2>Live sound check</h2>
                  <span className="pill">B♭ TRUMPET</span>
                </div>
                <p className="muted">
                  Play a comfortable, steady written C4. All valves open.
                </p>
                <div className="tuner-note">
                  {measured === null ? "—" : noteName(measured + 2)}
                  <small>WRITTEN PITCH</small>
                </div>
                <div className="tuning-scale">
                  <span>FLAT</span>
                  <span>IN TUNE</span>
                  <span>SHARP</span>
                </div>
                <div className="meter">
                  <span className="center-mark" />
                  <i
                    style={{
                      left: `${50 + Math.max(-48, Math.min(48, (cents ?? 0) * 0.48))}%`,
                      opacity: cents === null ? 0 : 1,
                    }}
                  />
                </div>
                <p className="tuning-value">
                  {cents === null
                    ? "Play a note to begin"
                    : `${cents >= 0 ? "+" : ""}${Math.round(cents)} cents from written ${noteName(target.midi)}`}
                </p>
                <p className="signal-state" role="status">
                  {pitchStatus}
                </p>
                <div className="mic-actions">
                  <button
                    className="primary"
                    disabled={connecting}
                    onClick={() =>
                      connected ? void disconnect() : void connect()
                    }
                  >
                    {connecting
                      ? "Connecting…"
                      : connected
                        ? "Disconnect microphone"
                        : "Connect microphone"}{" "}
                    <span>↗</span>
                  </button>
                  <p>
                    Audio stays on your device.
                    <br />
                    No recordings are saved or uploaded.
                  </p>
                </div>
              </section>
              <aside className="card setup">
                <p className="eyebrow">MAKE YOURSELF HEARD</p>
                <h2>A little room to play.</h2>
                <ol className="setup-steps">
                  <li>
                    <span>01</span>
                    <div>
                      <strong>Give the bell some space</strong>
                      <p>
                        Start about 1–2 meters from your phone. Move back if the
                        level clips.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <strong>Keep the room quiet</strong>
                      <p>
                        Use headphones for clicks and reference tones. Speakers
                        can confuse the microphone.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <strong>Take an easy breath</strong>
                      <p>Play naturally. A steady, relaxed tone is the goal.</p>
                    </div>
                  </li>
                </ol>
                <div className="reference">
                  <span>
                    REFERENCE NOTE
                    <strong>
                      Written C4 <span>→ concert B♭3</span>
                    </strong>
                  </span>
                  <button
                    disabled={!connected || running || calibrating}
                    onClick={() =>
                      engine.current.tone(
                        midiHz(writtenToConcert(60), settings.tuning),
                      )
                    }
                    aria-label="Play written C4 reference tone"
                  >
                    ▶
                  </button>
                </div>
                <p className="tiny">
                  Reference tones disable scoring through playback and a 450 ms
                  tail.
                </p>
              </aside>
            </div>
            <section className="card diagnostics">
              <div className="section-top">
                <div>
                  <p className="eyebrow">AUDIO FOUNDATION</p>
                  <h2>Calibration & diagnostics</h2>
                </div>
                <span className="pill">PHONE + TRUMPET TEST PENDING</span>
              </div>
              <p className="muted">
                Synthetic checks pass before release. Real trumpet, microphone
                latency and speaker rejection still need the physical-device
                test in the project’s Audio Foundation protocol.
              </p>
              <div className="diagnostic-grid">
                <div>
                  <span>Input level</span>
                  <strong>{frame.rms.toFixed(4)} RMS</strong>
                  <progress
                    max="0.25"
                    value={frame.rms}
                    aria-label="Microphone input level"
                  />
                </div>
                <div>
                  <span>Pitch confidence</span>
                  <strong>{Math.round(frame.confidence * 100)}%</strong>
                </div>
                <div>
                  <span>Capture / analysis rate</span>
                  <strong>
                    {frame.sampleRate
                      ? `${frame.sampleRate} / ${frame.analysisRate} Hz`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Analysis window</span>
                  <strong>
                    {frame.windowSeconds
                      ? `${Math.round(frame.windowSeconds * 1000)} ms`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Delivery after window end</span>
                  <strong>
                    {connected ? `${Math.round(delay.current)} ms` : "—"}
                  </strong>
                </div>
                <div>
                  <span>Reported output latency</span>
                  <strong>
                    {engine.current.context
                      ? `${Math.round((engine.current.context.outputLatency ?? 0) * 1000)} ms`
                      : "—"}
                  </strong>
                </div>
              </div>
              <p className="tiny">
                Capture timestamp is the analysis window center. Delivery delay
                is measured separately. Browser input/hardware latency is
                unknown; output latency is browser-reported, not an end-to-end
                measurement.
              </p>
              <div className="settings-row">
                <label>
                  Reference tuning A4
                  <input
                    type="number"
                    min="430"
                    max="450"
                    value={settings.tuning}
                    disabled={running}
                    onChange={(e) =>
                      persistSettings({
                        ...settings,
                        tuning: Math.min(
                          450,
                          Math.max(430, Number(e.target.value) || 440),
                        ),
                      })
                    }
                  />
                  <span>Hz</span>
                </label>
                <label>
                  Manual timing offset
                  <input
                    type="number"
                    min="-300"
                    max="300"
                    step="10"
                    value={settings.offsetMs}
                    disabled={running}
                    onChange={(e) =>
                      persistSettings({
                        ...settings,
                        offsetMs: Math.min(
                          300,
                          Math.max(-300, Number(e.target.value) || 0),
                        ),
                      })
                    }
                  />
                  <span>ms · unverified</span>
                </label>
                <button
                  disabled={!connected || running || calibrating}
                  onClick={() => {
                    calibration.current = {
                      until: engine.current.now + 3,
                      values: [],
                    };
                    setCalibrating(true);
                    engine.current.cancelSounds();
                    setNotice(
                      "Stay quiet for three seconds. Measuring ambient room noise…",
                    );
                  }}
                >
                  {calibrating ? "Measuring quiet room…" : "Measure room noise"}
                </button>
                <button
                  onClick={() =>
                    download("trumpet-hero-diagnostics.json", {
                      date: new Date().toISOString(),
                      hardwareValidation: "NOT PERFORMED",
                      settings,
                      frame: latest.current,
                      deliveryMs: delay.current,
                      track: engine.current.settings,
                      userAgent: navigator.userAgent,
                    })
                  }
                >
                  Export diagnostics
                </button>
              </div>
              <p className="tiny">
                Noise gate: {settings.noiseFloor.toFixed(3)} RMS ·{" "}
                {settings.calibratedAt
                  ? "room measurement saved"
                  : "default; not calibrated"}
                . Positive offset shifts your captured attack earlier. No raw
                audio is included in exports.
              </p>
            </section>
            <div className="next-step">
              <span>Ready when you are.</span>
              <button className="primary" onClick={() => setTab("Practice")}>
                Explore your lessons <span>→</span>
              </button>
            </div>
          </>
        )}
        {tab === "Practice" && (
          <>
            <div className="page-heading compact">
              <p className="eyebrow">02 / MAKE A LITTLE PROGRESS</p>
              <h1>Small steps. A stronger sound.</h1>
              <p>
                Five guided lessons, three original melodies, and room to find
                your rhythm.
              </p>
            </div>
            <div className="practice-grid">
              <aside className="card library">
                <h2>Your practice path</h2>
                <p className="muted">Build a little every day.</p>
                <h3>THE FOUNDATIONS</h3>
                {charts
                  .filter((c) => c.lesson)
                  .map((c) => (
                    <button
                      key={c.id}
                      disabled={running}
                      className={
                        "chart " + (chart.id === c.id ? "selected" : "")
                      }
                      onClick={() => select(c)}
                    >
                      <span className="lesson-number">
                        {String(c.lesson).padStart(2, "0")}
                      </span>
                      <span>
                        <strong>{c.title}</strong>
                        <small>{c.subtitle.split("/ ")[1]}</small>
                      </span>
                      <span className="chart-arrow">
                        {progress.some(
                          (p) =>
                            p.chart === c.id && p.completed === c.notes.length,
                        )
                          ? "✓"
                          : "↗"}
                      </span>
                    </button>
                  ))}
                <h3>PLAY A MELODY</h3>
                {charts
                  .filter((c) => !c.lesson)
                  .map((c) => (
                    <button
                      key={c.id}
                      disabled={running}
                      className={
                        "chart " + (chart.id === c.id ? "selected" : "")
                      }
                      onClick={() => select(c)}
                    >
                      <span className="lesson-number">♪</span>
                      <span>
                        <strong>{c.title}</strong>
                        <small>{c.subtitle}</small>
                      </span>
                      <span className="chart-arrow">↗</span>
                    </button>
                  ))}
              </aside>
              <section className="card stage">
                <div className="section-top">
                  <div>
                    <p className="eyebrow">
                      {chart.lesson
                        ? `LESSON ${String(chart.lesson).padStart(2, "0")}`
                        : "ORIGINAL COMPOSITION"}
                    </p>
                    <h2>{chart.title}</h2>
                  </div>
                  <span className="pill">{mode.toUpperCase()}</span>
                </div>
                <p className="lesson-tip">{chart.tip}</p>
                <div className="stage-display">
                  <NoteHighway
                    notes={chart.notes}
                    getBeat={getBeat}
                    reduced={reduced}
                  />
                  <div className="target-strip">
                    <div>
                      <small>
                        {running && elapsed < 0
                          ? "GET READY"
                          : "YOUR NEXT NOTE"}
                      </small>
                      <strong>
                        {running && elapsed < 0
                          ? Math.max(1, Math.ceil((-elapsed * bpm) / 60))
                          : noteName(target.midi)}
                      </strong>
                      <span>
                        {running && elapsed < 0
                          ? "Four-beat count-in"
                          : `sounds ${noteName(writtenToConcert(target.midi))}`}
                      </span>
                    </div>
                    <div
                      className="valves"
                      aria-label={`Fingering ${fingers[target.midi]?.length ? fingers[target.midi].join(" and ") : "open"}`}
                    >
                      {[1, 2, 3].map((v) => (
                        <span
                          className={
                            fingers[target.midi]?.includes(v) ? "down" : ""
                          }
                          key={v}
                        >
                          {v}
                        </span>
                      ))}
                      <small>
                        {fingers[target.midi]?.length
                          ? "FILLED = PRESS"
                          : "OPEN"}
                      </small>
                    </div>
                    <div className="live-pitch">
                      <small>HEARD · WRITTEN</small>
                      <strong>
                        {measured === null ? "—" : noteName(measured + 2)}
                      </strong>
                      <span>
                        {cents === null
                          ? "listening…"
                          : `${Math.round(cents) > 0 ? "+" : ""}${Math.round(cents)} cents`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="transport">
                  <button
                    className="primary"
                    disabled={!connected || calibrating || connecting}
                    onClick={() => (running ? void togglePause() : start())}
                  >
                    {running
                      ? paused
                        ? "▶ Resume"
                        : "Ⅱ Pause"
                      : "▶ Start practice"}
                  </button>
                  {running && (
                    <button onClick={() => finish(false)}>End session</button>
                  )}
                  {!connected && (
                    <button
                      onClick={() => void connect()}
                      disabled={connecting}
                    >
                      {connecting ? "Connecting…" : "Connect microphone"}
                    </button>
                  )}
                  <span className="transport-info">
                    {running
                      ? paused
                        ? "Paused"
                        : mode === "Guided"
                          ? `Note ${Math.min((s?.learnIndex ?? 0) + 1, chart.notes.length)} of ${chart.notes.length} · hold ${(s?.hold ?? 0).toFixed(1)} s`
                          : `${liveScore?.score ?? 0} points · ${liveScore?.attacks ?? 0} attacks`
                      : `${chart.notes.length} notes · ${Math.ceil(((chart.notes.at(-1)!.beat + chart.notes.at(-1)!.length) * 60) / bpm)} sec at ${bpm} BPM`}
                  </span>
                </div>
                <div className="practice-controls">
                  <label>
                    Practice mode
                    <select
                      value={mode}
                      disabled={running}
                      onChange={(e) => setMode(e.target.value as Mode)}
                    >
                      <option>Guided</option>
                      <option>Rhythm</option>
                    </select>
                  </label>
                  <label>
                    Difficulty
                    <select
                      value={difficulty}
                      disabled={running}
                      onChange={(e) =>
                        setDifficulty(e.target.value as Difficulty)
                      }
                    >
                      {Object.keys(difficulties).map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tempo · {bpm} BPM
                    <input
                      type="range"
                      min="40"
                      max="140"
                      value={bpm}
                      disabled={running}
                      onChange={(e) => setBpm(Number(e.target.value))}
                    />
                  </label>
                </div>
                <div className="toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={metronome}
                      onChange={(e) => setMetronome(e.target.checked)}
                    />{" "}
                    Audible metronome
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={reduced}
                      onChange={(e) => setReduced(e.target.checked)}
                    />{" "}
                    Static note view
                  </label>
                  <button
                    className="text-button"
                    disabled={!connected || running}
                    onClick={() =>
                      engine.current.tone(
                        midiHz(writtenToConcert(target.midi), settings.tuning),
                      )
                    }
                  >
                    ♪ Hear target
                  </button>
                </div>
                <p className="tiny">
                  {mode === "Guided"
                    ? "Guided waits for you: hold the correct pitch steadily for 70% of each note’s duration. Timing is not graded. Release before repeated notes."
                    : `Rhythm: onset ±${difficulties[difficulty].timing * 1000} ms, pitch ±${difficulties[difficulty].cents} cents. Score = 30% attacks + 70% correct sustained duration. Repeated notes need a fresh attack.`}{" "}
                  Headphones help keep clicks out of the microphone.
                </p>
              </section>
            </div>
            {result && (
              <section className="card results" role="status">
                <div>
                  <p className="eyebrow">
                    SESSION COMPLETE · {result.mode.toUpperCase()}
                  </p>
                  <h2>You showed up. That counts.</h2>
                  <p className="muted">
                    {result.mode === "Guided"
                      ? "Guided completion — timing was not graded."
                      : "Use this session as a starting point for your next practice."}
                  </p>
                </div>
                <div className="result-score">
                  {result.score}
                  <small>
                    {result.mode === "Guided" ? "% COMPLETE" : "POINTS / 100"}
                  </small>
                </div>
                <div>
                  <strong>
                    {result.completed} / {chart.notes.length}
                  </strong>
                  <p>Notes completed</p>
                  <strong>
                    {result.stability === null
                      ? "—"
                      : `${result.stability.toFixed(1)} cents`}
                  </strong>
                  <p>Pitch spread (standard deviation)</p>
                </div>
              </section>
            )}
            <section className="card score-sheet">
              <div className="section-top">
                <h2>The notes, at your pace</h2>
                <span className="muted">Written B♭ trumpet notation</span>
              </div>
              <div className="note-list">
                {chart.notes.map((n, i) => (
                  <span
                    className={running && i === currentIndex ? "now" : ""}
                    key={i}
                  >
                    <strong>{noteName(n.midi)}</strong>
                    <small>
                      {n.beat + 1} · {n.length.toFixed(1)} beats
                    </small>
                    <small>{fingers[n.midi]?.join(" + ") || "open"}</small>
                  </span>
                ))}
              </div>
            </section>
          </>
        )}
        {tab === "Progress" && (
          <>
            <div className="page-heading">
              <p className="eyebrow">03 / KEEP SHOWING UP</p>
              <h1>Your practice, taking shape.</h1>
              <p>
                Saved only in this browser. Every comfortable note is a step
                forward.
              </p>
            </div>
            <section className="card">
              <div className="section-top">
                <h2>{progress.length} completed sessions</h2>
                <div className="progress-actions">
                  <button
                    disabled={!progress.length}
                    onClick={() =>
                      download("trumpet-hero-progress.json", progress)
                    }
                  >
                    Export progress
                  </button>
                  <button
                    disabled={!progress.length}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete all saved practice sessions from this browser?",
                        )
                      )
                        void clearProgress()
                          .then(() => setProgress([]))
                          .catch(() =>
                            setError("Progress could not be deleted."),
                          );
                    }}
                  >
                    Clear history
                  </button>
                </div>
              </div>
              {!progress.length ? (
                <div className="empty">
                  <span>♬</span>
                  <h2>Your first session starts a story.</h2>
                  <p>Choose a lesson, take a breath, and play a few notes.</p>
                  <button
                    className="primary"
                    onClick={() => setTab("Practice")}
                  >
                    Choose a lesson →
                  </button>
                </div>
              ) : (
                <div className="history">
                  {[...progress].reverse().map((p, i) => (
                    <article key={i}>
                      <div>
                        <strong>
                          {charts.find((c) => c.id === p.chart)?.title ??
                            p.chart}
                        </strong>
                        <p>
                          {new Date(p.date).toLocaleString()} · {p.mode}
                        </p>
                      </div>
                      <div>
                        <strong>
                          {p.score}
                          {p.mode === "Guided" ? "%" : " pts"}
                        </strong>
                        <p>{p.completed} notes completed</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <footer>
        <span>
          TRUMPET HERO <i> / </i> A little practice goes a long way.
        </span>
        <span>Private by design · Works offline after first load</span>
      </footer>
      <span hidden>{tick}</span>
    </div>
  );
}
