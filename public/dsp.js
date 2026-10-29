/** YIN difference/CMND pitch estimator. Pure and shared by worklet + tests. */
export function detectPitch(samples, sampleRate, noiseFloor = 0.008) {
  let sum = 0,
    square = 0,
    clipped = 0;
  for (const x of samples) {
    sum += x;
    square += x * x;
    if (Math.abs(x) >= 0.98) clipped++;
  }
  const rms = Math.sqrt(square / samples.length);
  const clipRatio = clipped / samples.length;
  const empty = { hz: 0, confidence: 0, rms, clipRatio };
  if (rms < noiseFloor || clipRatio > 0.1) return empty;
  const mean = sum / samples.length;
  const minTau = Math.floor(sampleRate / 1200),
    maxTau = Math.min(Math.floor(sampleRate / 100), samples.length / 2 - 1);
  const size = samples.length - maxTau;
  const difference = new Float32Array(maxTau + 1);
  let cumulative = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    let d = 0;
    for (let i = 0; i < size; i++) {
      const delta = samples[i] - mean - (samples[i + tau] - mean);
      d += delta * delta;
    }
    cumulative += d;
    difference[tau] = cumulative > 0 ? (d * tau) / cumulative : 1;
  }
  for (let tau = minTau; tau < maxTau - 1; tau++) {
    if (difference[tau] < 0.15) {
      while (tau + 1 < maxTau && difference[tau + 1] < difference[tau]) tau++;
      const a = difference[tau - 1],
        b = difference[tau],
        c = difference[tau + 1];
      const denominator = 2 * (2 * b - c - a);
      const interpolated = tau + (denominator ? (c - a) / denominator : 0);
      return {
        hz: sampleRate / interpolated,
        confidence: 1 - b,
        rms,
        clipRatio,
      };
    }
  }
  return empty;
}
