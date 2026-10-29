# Design and scope

The primary milestone is **Audio Foundation**, with a fully usable practice MVP around it. Pitch recognition is experimental until the physical-device acceptance protocol is completed. No claim of real acoustic trumpet accuracy is made.

## Data path

`getUserMedia → AudioWorklet → decimated 1024-sample YIN window → timestamped PitchFrame → Scorer / guided hold → React diagnostics`

A silent gain node keeps the worklet graph running; microphone audio never reaches the speakers. The worklet owns sample collection and pitch estimation. It timestamps the center of each window on the AudioContext clock. Estimated computational/message delivery delay is receipt audio time minus window end; this does not measure ADC/browser input buffering. Render refreshes never determine grades. Scorer processes monotonically increasing capture timestamps and caps each contribution at 40 ms so gaps and duplicate deliveries cannot manufacture sustained credit.

YIN computes squared difference followed by cumulative mean normalization, selects the first local minimum under 0.15, and uses quadratic interpolation. RMS below the room-noise gate, low-confidence frames, and >10% hard-clipped samples are excluded. Harmonic-rich synthetic cases, clipping, silence, detuning and octave mismatch have regression tests. Averaging decimation and earliest-dip selection remain limitations for noise, complex timbre, missing fundamentals and strong overtones. The estimator does not infer articulation from timbre: a new attack is detected after ≥70 ms unvoiced time or a pitch change >65 cents. Very short gaps may be missed; timbral tongue attacks on continuously voiced repeated pitches are a hardware-test risk.

Rhythm attacks match the expected concert MIDI pitch (`written − 2`); centered duration earns hold credit independently. Guided mode requires a consecutive centered hold and a release for repeated pitches. Rhythm does not require consecutive good hold frames. A ±25/35/50-cent gate is a practice aid, not a diagnosis of embouchure or intonation technique. Confidence is a periodicity measure, not a probability of correctness.

Reference playback explicitly disables assessment through oscillator stop + 450 ms. Starting practice cancels previous tones, leaves a quiet tail and counts four beats. High metronome tones are outside chart target pitches, but headsets and real bleed testing remain necessary. The app intentionally has no backing music; backing tracks would need stronger echo rejection and synchronization before release.

Audio generation uses scheduled AudioContext events and a 40 ms lookahead timer. A late JavaScript callback skips an already-past click rather than firing a late click. Visual animation uses requestAnimationFrame and the same audio clock. The static fallback shows the full note sequence and the textual current target/fingering remain usable without 3D. Note highway maps pitch to horizontal position; it is a practice visualization rather than standard staff notation. The lesson score sheet gives note names, durations and fingerings.

## Local persistence

IndexedDB `trumpet-hero` v1 has `settings` and `progress` stores. Settings include A4 tuning, room RMS gate and user-entered timing offset; calibration date labels noise calibration only. Completed sessions store chart ID, mode, aggregate score, hold percentage, completed notes, attacks, pitch spread and ISO date. No PCM or full frame history persists. JSON exports are initiated by the user.

## Known limitations and release gates

- Physical phone/browser/trumpet validation is outstanding, including hard clipped overtones, repeated tongue attacks, stable low C, upper register and quiet attacks.
- Latency is not automatically calibrated. Manual offset is bounded ±300 ms and explicitly unverified.
- Full native music notation, MIDI input, backing accompaniment, richer curriculum and multi-user/cloud history are outside this MVP.
- Offline is available after a successful production worker install. Development server remains online-only; no backend exists.
- WebGL is optional. Keyboard controls use standard buttons/forms, visible focus, labels and a static note list; an external accessibility audit is still outstanding.
- Browser audio scheduling may stop in background. Visibility changes pause immediately; system AudioContext suspension pauses and requires explicit resume.
