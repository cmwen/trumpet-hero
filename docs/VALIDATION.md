# Software validation — 2026-10-30

This record is **not physical phone/trumpet validation**. The Audio Foundation gate remains NOT EXECUTED.

- `npm ci --offline --no-audit --no-fund`: passed from the pinned lockfile and populated npm cache (118 packages).
- `npm test`: passed, 21 cases in two files. Covers YIN pitch range, weak fundamental/strong harmonic, deterministic noise/silence, detuning, hard clipping, actual worklet window-center timestamp/native clipping, written/concert mapping, chart fingering coverage, scoring gates/repeated articulation, duplicate/gap handling, and a late permission-prompt stream cleanup race.
- `npm run typecheck`: passed.
- `npm run build`: passed. Three.js is separated from application code; all assets are local.
- `git diff --check`: passed.
- Headless Chromium software smoke: passed for no-microphone startup and practice gating; chart selection; synthetic capture connect; start/pause/resume/end; disconnect; 390px sound/practice layouts without horizontal overflow; production offline reload; offline worklet/DSP fetches (both HTTP 200). No JavaScript page errors.

- Full synthetic-WAV end-to-end check: four articulated 233.08188 Hz tones flowed through the actual AudioWorklet, completed all four guided C4 notes at 140 BPM, produced 100% guided completion, and saved a session that remained after page reload. This validates software wiring using generated tones; it does not validate acoustic trumpet performance.

The browser smoke initially found an offline module-load failure: preview server responses include `Vary: Origin`, while cached asset requests and module requests carry different Origin headers. Static same-origin cached shell lookups now use `ignoreVary: true`; the post-fix offline reload rendered the full app. The service worker is scoped to the app path and caches only the public shell/assets. Its cache revision hashes the HTML, public resources, and hashed bundle filenames.

Browser evidence and the local smoke scripts live under the workspace `.workspace/artifacts/trumpet-hero/` directory, outside the independent app repository. Scripts use the environment's existing Playwright/Chromium installation and launch their own preview server; they are development evidence, not a portable test dependency.

See `AUDIO_FOUNDATION.md` for the still-required acoustic/phone checks. Real input latency, trumpet overtone behavior, speaker bleed, quiet attacks and brief tongue articulation remain unverified.
