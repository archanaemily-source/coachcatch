// The breath analyzer's "score" is a breath-force/intensity reading, not a
// literal rate (breaths/min) — these zones are the hardware teammate's own
// calibration scale for the sensor.
export const BREATH_ZONES = [
  { max: 10, label: 'Resting' },
  { max: 20, label: 'Moderate breathing' },
  { max: 40, label: 'Heavy breathing' },
  { max: Infinity, label: 'Labored breathing' },
];

export function breathIntensityLabel(score) {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  const zone = BREATH_ZONES.find((z) => score < z.max);
  return zone.label;
}
