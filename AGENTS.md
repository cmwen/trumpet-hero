# Trumpet Hero

This is an independent, offline React/TypeScript/Vite PWA. Repository mutations follow the parent workspace Run workflow. Do not claim phone/trumpet readiness from synthetic tests.

Required validation before integration:
- `npm ci --no-audit --no-fund`
- `npm test`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Keep DSP in `public/dsp.js` shared between AudioWorklet and unit tests; no duplicate test-only estimator. Scoring consumes the audio capture window center, not message receipt time. Written Bb trumpet pitch sounds two semitones lower. Never persist raw microphone audio. Close microphone tracks/context when disconnecting or leaving. Keep hardware validation status explicit until the `docs/AUDIO_FOUNDATION.md` gate is recorded with real evidence.
