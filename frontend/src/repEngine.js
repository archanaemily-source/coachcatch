// Squat rep-counting engine. Pure, framework-free, and unit-testable —
// consumes a stream of knee angles + timestamps, emits rep/shallow-rep events.
// Every tunable constant lives here so it can be retuned without touching UI code.

// MediaPipe Pose Landmarker indices (BlazePose 33-point model).
export const LANDMARKS = {
  left: { hip: 23, knee: 25, ankle: 27 },
  right: { hip: 24, knee: 26, ankle: 28 },
};

// Below this per-landmark visibility, we don't trust the angle from that side.
export const VISIBILITY_THRESHOLD = 0.5;

// How long confident landmarks must be held before we start counting reps.
export const STARTUP_CONFIDENT_MS = 2000;

// Knee angle (degrees) below which the lifter is considered "in the hole".
export const DOWN_ANGLE = 100;

// Knee angle (degrees) above which the lifter is considered fully standing.
export const UP_ANGLE = 160;

// Dipped below this but never below DOWN_ANGLE => a shallow (not-deep-enough) rep.
export const SHALLOW_ANGLE = 140;

// A proposed UP/DOWN phase flip must hold continuously for this long to commit
// (rejects single-frame jitter at the threshold boundary).
export const TRANSITION_DEBOUNCE_MS = 250;

// Minimum time between two counted (full-depth) reps, regardless of angle noise.
export const MIN_REP_INTERVAL_MS = 500;

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

// formScore per rep: deeper squats (lower min angle) score higher, capped at 1.
export function formScoreFromMinAngle(minAngle) {
  return clamp01((120 - minAngle) / 20);
}

// Angle at point b (in degrees) formed by rays b->a and b->c, using 2D landmark
// coordinates (x, y in normalized [0,1] space — z is ignored).
export function calculateAngle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const magAB = Math.hypot(ab.x, ab.y);
  const magCB = Math.hypot(cb.x, cb.y);
  if (magAB === 0 || magCB === 0) return null;
  const cos = Math.max(-1, Math.min(1, (ab.x * cb.x + ab.y * cb.y) / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Picks whichever side (left/right) has higher average landmark visibility and
// returns its knee angle. `landmarks` is the raw 33-point MediaPipe array.
export function bestSideKneeAngle(landmarks) {
  const sides = ['left', 'right'].map((side) => {
    const { hip, knee, ankle } = LANDMARKS[side];
    const h = landmarks[hip];
    const k = landmarks[knee];
    const a = landmarks[ankle];
    const visibility = ((h.visibility ?? 0) + (k.visibility ?? 0) + (a.visibility ?? 0)) / 3;
    return { side, visibility, angle: calculateAngle(h, k, a) };
  });
  return sides[0].visibility >= sides[1].visibility ? sides[0] : sides[1];
}

// Event types emitted by SquatRepEngine.step()
export const EVENT = { NONE: 'none', REP: 'rep', SHALLOW: 'shallow' };

export class SquatRepEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = 'up'; // 'up' | 'down' — debounced, used for UI depth-gauge state
    this.pendingPhase = null;
    this.pendingSince = null;
    this.minAngle = Infinity;
    this.confirmedDownThisDip = false;
    this.lastRepAt = -Infinity;
    this.repCount = 0;
    this.shallowCount = 0;
  }

  // angle: knee angle in degrees. t: timestamp in ms (monotonic, e.g. performance.now()).
  // Returns { type, angle, phase, minAngle, formScore? }.
  step(angle, t) {
    if (angle === null || angle === undefined || Number.isNaN(angle)) {
      return { type: EVENT.NONE, angle, phase: this.phase };
    }

    // Track the deepest point of the current dip, whenever below full lockout.
    if (angle < UP_ANGLE) {
      this.minAngle = Math.min(this.minAngle, angle);
    }

    // Debounced UP/DOWN phase: a proposed flip must hold continuously for
    // TRANSITION_DEBOUNCE_MS to commit, so a single noisy frame at the
    // threshold boundary can't confirm a DOWN state (and therefore can't
    // count as a full rep — see the resolve step below).
    let rawTarget = this.phase;
    if (this.phase === 'up' && angle < DOWN_ANGLE) rawTarget = 'down';
    else if (this.phase === 'down' && angle > UP_ANGLE) rawTarget = 'up';

    if (rawTarget !== this.phase) {
      if (this.pendingPhase !== rawTarget) {
        this.pendingPhase = rawTarget;
        this.pendingSince = t;
      }
      if (t - this.pendingSince >= TRANSITION_DEBOUNCE_MS) {
        this.phase = rawTarget;
        this.pendingPhase = null;
        if (this.phase === 'down') this.confirmedDownThisDip = true;
      }
    } else {
      this.pendingPhase = null;
    }

    // Resolve a dip once the lifter returns to full lockout. Only a
    // debounce-confirmed DOWN counts as full depth — an unconfirmed dip
    // (noise that never held past the boundary) can at most be "shallow".
    if (angle >= UP_ANGLE && this.minAngle !== Infinity) {
      const reachedDepth = this.minAngle;
      const wasConfirmedDown = this.confirmedDownThisDip;
      this.minAngle = Infinity;
      this.confirmedDownThisDip = false;

      if (wasConfirmedDown && t - this.lastRepAt >= MIN_REP_INTERVAL_MS) {
        this.lastRepAt = t;
        this.repCount += 1;
        return {
          type: EVENT.REP,
          angle,
          phase: this.phase,
          minAngle: reachedDepth,
          formScore: formScoreFromMinAngle(reachedDepth),
        };
      }
      if (reachedDepth < SHALLOW_ANGLE) {
        this.shallowCount += 1;
        return { type: EVENT.SHALLOW, angle, phase: this.phase, minAngle: reachedDepth };
      }
    }

    return { type: EVENT.NONE, angle, phase: this.phase };
  }
}
