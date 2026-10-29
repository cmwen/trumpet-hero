# Trumpet Hero

Play online: https://cmwen.dev/trumpet-hero/

Public source repository: https://github.com/cmwen/trumpet-hero

GitHub Actions validates and deploys `main` to GitHub Pages. The production build uses relative asset URLs so it works under the `/trumpet-hero/` project path, including the inherited account domain.

An offline practice room for a **real B♭ trumpet**: microphone pitch feedback, five progressive lessons, three short original melodies, guided learning and an audio-clock rhythm game with a Three.js note highway.

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm run preview
```

Open the local Vite address, choose **Sound check**, connect the microphone, and play written C4 (open valves). The tuner labels **written** pitch: C4 sounds concert B♭3, 233.08 Hz at A4=440. Try headphones, leave 1–2 meters between bell and microphone, and measure quiet-room noise before starting.

**Status: runnable MVP / Audio Foundation preview. Real phone + trumpet validation has NOT been performed.** Synthetic DSP/scoring tests support development; they do not establish trumpet tracking, attack timing, latency or speaker-bleed performance. Complete [the hardware gate](docs/AUDIO_FOUNDATION.md) before treating the app as a reliable performance judge.

## Practice

- Five lessons: breath and written C; tongued attacks; C/D/E; long tones; pulse and melody.
- Three newly authored, original exercises: First light, River walk, Golden echo. No third-party compositions, recordings, or backing tracks.
- Guided mode waits for a consecutive centered hold lasting 70% of the requested note, then advances. Repeated notes require a release. Timing is not graded.
- Rhythm mode includes a four-beat count-in. Gentle/Balanced/Focused allow ±200/120/60 ms attack timing and ±50/35/25 cents pitch respectively. The score combines attack rate (30%) and correct sustained duration (70%). A note is complete at 70% correct duration. Pitch spread is the standard deviation of in-tolerance cents samples, not a full tone-quality measure.
- Tempo is adjustable from 40 to 140 BPM. Every note includes written pitch, concert pitch, and trumpet valve fingering. Static view removes moving graphics and is selected for reduced-motion preferences; it also works when WebGL is unavailable.
- Pause/resume preserves elapsed song time; backgrounding pauses practice. End session abandons an incomplete attempt. Completed sessions save locally.

## Audio and privacy

AudioWorklet captures mono PCM and runs non-ML YIN on a 1024-sample frame at approximately 16–24 kHz. At 48 kHz input it averages groups of three samples and analyzes at 16 kHz, with a 64 ms window and 16 ms hops. This is a simple averaging prefilter, not a production antialias filter. Pitch range is 100–1200 Hz. Confidence, a configurable noise gate and clipping rejection guard scoring. Microphone processing requests echo cancellation, automatic gain and noise suppression **off**; browsers may not honor every request. Diagnostics report actual track settings.

A captured frame carries its audio-clock window-center timestamp. Scoring uses that timestamp, an explicitly unverified manual offset, and the song’s AudioContext start time. UI refresh and message-delivery time are separate from capture timing. Browser/hardware input latency is **unknown**; neither reported output latency nor a manual offset calibrates the complete input path. See [architecture and limitations](docs/DESIGN.md).

The reference oscillator gates scoring through playback and a 450 ms tail. Metronome clicks are short high-frequency sine bursts, outside the exercise pitch range. Headphones are recommended because acoustic bleed has not been hardware validated. No microphone monitoring, raw audio recordings, network uploads, analytics, account, backend or ML model. Only progress and numerical calibration settings enter IndexedDB. Diagnostic export contains recent numerical pitch statistics and device/browser settings, never a recording.

## Offline and phone access

`npm run build` emits a versioned service worker that caches the bundled shell, fonts (system fonts only), engine, DSP and worklet. After a successful first load, the production build is usable offline. Development mode does not register a worker. Update by closing all app tabs and opening again after a new deployed version has been fetched. Clearing site data deletes cached files and progress.

Microphone and AudioWorklet require a **secure context**. `http://localhost` is allowed on your computer. A phone opening an ordinary LAN address such as `http://192.168…:5173` will not have microphone access. Use a trusted HTTPS development proxy/deployment or Chrome Android USB port forwarding (`adb reverse tcp:5173 tcp:5173`, open `http://localhost:5173` on the phone). Never disable browser security as a workaround. Installability varies by browser/platform; the manifest includes an SVG icon, while some launchers may require additional raster icons before offering installation.

Permission denial, missing/busy/disconnected microphones and storage failures have visible recovery messages. Reconnect after changing site permissions. The app stops all microphone tracks and closes the AudioContext on disconnect and component unmount. If the system interrupts audio, resume the paused session or reconnect.
