# Audio Foundation: physical acceptance gate

**Gate status: NOT EXECUTED — no phone or acoustic trumpet evidence yet.**

Do not replace this status with pass on the basis of synthetic tests, fake browser capture, a microphone icon, WebGL smoke, or oscillator loopback. Attach numerical diagnostics and a concise observation log from a real trumpet and phone.

## Setup and evidence

1. Record phone model, OS/browser/version, speaker/headset, room distance, trumpet type and app commit. Open a trusted HTTPS URL or local forwarded secure context (README). Reject a plain insecure LAN origin. Disable Bluetooth for the initial latency test.
2. Open Sound check, grant microphone permission, inspect actual sample rate/track settings, and measure 3 seconds of quiet room. Export diagnostics. Verify microphone indicator stops when Disconnect is pressed and when the page is closed.
3. Run each case below. Record expected written/concert note, displayed note, false octave count, centered cents spread, missed/extra attacks, clipping status and any interruptions. Keep recordings outside app storage if independently collecting evidence with user consent; the app itself never records audio.

## Required acoustic cases

| Case | Procedure | Proposed acceptance / evidence |
| --- | --- | --- |
| Written/concert mapping | Open written C4 (all valves open), then D4 (1+3), E4 (1+2), G4 (open) | UI written pitch is correct; C4 corresponds to concert Bb3 around 233 Hz at A4=440; no octave confusion |
| Sustained fundamental | Hold each comfortable written C4/E4/G4 five times, 2 seconds each | At least 90% of voiced steady frames near intended octave, no persistent harmonic lock; note limitations if not measurable from aggregate diagnostics |
| Harmonic-rich attacks | Soft, medium and loud tongued notes, then repeated C4s with varied gaps | No systematic octave-up grading; quantify missed attacks from short tongue gaps; revise detector if unacceptable |
| Silence / room noise | 15 seconds quiet, speech, breathing and handling noise separately | No completed guided note or rhythm attack credit from non-trumpet input; note occasional pitch display separately |
| Detune | Intentionally bend 30–60 cents flat/sharp, return to center | Tuner sign correct; out-of-gate pitch receives no hold credit for selected difficulty |
| Clipping | Briefly approach microphone while playing comfortably (do not overblow); then move back | Clipping warning appears, scoring rejects clipped frames, tracking recovers at safe distance |
| Timing | Use external recording of clicks and trumpet attack for 20 played notes; compare with app and manual offset 0 | Record mean/variance of actual timing bias. Do not call ±60 ms mode accurate until input latency and detector delay are measured |
| Reference bleed | Play reference through phone speaker; do not play trumpet | No score during tone or tail; reference ends before count-in. Check an unusually reverberant room separately |
| Click bleed | Rhythm session with phone speaker, no trumpet, every difficulty | Zero score and no completed notes. If any false credit, require headphones and fix before enabling speaker mode |
| Pause / resume | Pause in note, resume, background/foreground, lock screen/interruption | No duplicated attacks, jumps, accumulated pause credit or runaway click audio; explicit resume needed |
| Failure recovery | Deny permission, revoke permission, unplug headset/mic, then reconnect | Actionable message; no stuck active capture; recovered capture is graded once only |
| Offline / install | Load production app, wait for worker activation, airplane mode, reload, play and save, reopen | UI/worklet/DSP load from cache; progress survives; no external font/asset requests |

## Decision

Record **PASS / FAIL / PARTIAL** per case, environment, date and artifacts. Hardware timing, reliable acoustic pitch and speaker bleed are blocking gates for promoting this preview to a trustworthy scored game. Keep Guided mode available for experimentation with the preview status visible; do not imply validated performance. Five low-level implementation/check cycles are the default before reassessing a persistent failure.

## Development checks (separate from physical gate)

`npm test`, `npm run typecheck`, `npm run build`, browser smoke and offline fetch verification demonstrate software behavior only. Test results and dates belong in `docs/VALIDATION.md`.
