import assert from 'node:assert';
import {
  calculateAngle,
  bestSideKneeAngle,
  SquatRepEngine,
  EVENT,
  formScoreFromMinAngle,
  DOWN_ANGLE,
  MIN_REP_INTERVAL_MS,
} from './repEngine.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL - ${name}`);
    console.log(`         ${err.message}`);
  }
}

// Builds a sequence of {angle, t} by piecewise-linear interpolation.
// waypoints[0] = [startAngle]; each waypoint after that is
// [targetAngle, durationMs] — transition linearly to targetAngle over
// durationMs, sampled every stepMs (a repeated angle acts as a "hold").
function buildSequence(waypoints, stepMs = 50) {
  const seq = [];
  let t = 0;
  let current = waypoints[0][0];
  seq.push({ angle: current, t });
  for (let i = 1; i < waypoints.length; i++) {
    const [toAngle, durationMs] = waypoints[i];
    const steps = Math.max(1, Math.round(durationMs / stepMs));
    for (let s = 1; s <= steps; s++) {
      t += stepMs;
      seq.push({ angle: current + (toAngle - current) * (s / steps), t });
    }
    current = toAngle;
  }
  return seq;
}

function run(engine, seq) {
  return seq.map((p) => engine.step(p.angle, p.t));
}

console.log('Running repEngine unit tests...\n');

test('calculateAngle: right angle (90deg)', () => {
  const angle = calculateAngle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 });
  assert.ok(Math.abs(angle - 90) < 0.01, `expected ~90, got ${angle}`);
});

test('calculateAngle: straight line (180deg)', () => {
  const angle = calculateAngle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 0, y: -1 });
  assert.ok(Math.abs(angle - 180) < 0.01, `expected ~180, got ${angle}`);
});

test('calculateAngle: degenerate (coincident points) returns null', () => {
  const angle = calculateAngle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 });
  assert.strictEqual(angle, null);
});

test('bestSideKneeAngle: picks the higher-visibility side', () => {
  const landmarks = new Array(33).fill(null).map(() => ({ x: 0, y: 0, visibility: 0 }));
  // Left leg (23 hip, 25 knee, 27 ankle): low visibility, bent at 90deg.
  landmarks[23] = { x: 0, y: 1, visibility: 0.2 };
  landmarks[25] = { x: 0, y: 0, visibility: 0.2 };
  landmarks[27] = { x: -1, y: 0, visibility: 0.2 };
  // Right leg (24 hip, 26 knee, 28 ankle): high visibility, straight at 180deg.
  landmarks[24] = { x: 0, y: 1, visibility: 0.9 };
  landmarks[26] = { x: 0, y: 0, visibility: 0.9 };
  landmarks[28] = { x: 0, y: -1, visibility: 0.9 };

  const result = bestSideKneeAngle(landmarks);
  assert.strictEqual(result.side, 'right');
  assert.ok(Math.abs(result.angle - 180) < 0.01);
});

test('formScoreFromMinAngle: deeper squat scores higher, capped at 1', () => {
  assert.strictEqual(formScoreFromMinAngle(100), 1); // (120-100)/20 = 1
  assert.strictEqual(formScoreFromMinAngle(70), 1); // clamps above 1
  assert.strictEqual(formScoreFromMinAngle(120), 0);
  assert.strictEqual(formScoreFromMinAngle(110), 0.5);
});

test('state machine: 175 -> 90 -> 175 counts exactly 1 full rep', () => {
  const engine = new SquatRepEngine();
  const seq = buildSequence(
    [
      [175, 0],
      [90, 600], // descend over 600ms — plenty of time past DOWN threshold+debounce
      [90, 400], // hold at the bottom
      [175, 600], // ascend back up
    ],
    50
  );
  const events = run(engine, seq);
  const repEvents = events.filter((e) => e.type === EVENT.REP);
  const shallowEvents = events.filter((e) => e.type === EVENT.SHALLOW);
  assert.strictEqual(repEvents.length, 1, `expected 1 rep, got ${repEvents.length}`);
  assert.strictEqual(shallowEvents.length, 0);
  assert.ok(repEvents[0].minAngle <= DOWN_ANGLE);
  assert.ok(repEvents[0].formScore > 0.9);
});

test('state machine: 175 -> 130 -> 175 counts as shallow, not a full rep', () => {
  const engine = new SquatRepEngine();
  const seq = buildSequence(
    [
      [175, 0],
      [130, 600],
      [130, 300],
      [175, 600],
    ],
    50
  );
  const events = run(engine, seq);
  const repEvents = events.filter((e) => e.type === EVENT.REP);
  const shallowEvents = events.filter((e) => e.type === EVENT.SHALLOW);
  assert.strictEqual(repEvents.length, 0, `expected 0 full reps, got ${repEvents.length}`);
  assert.strictEqual(shallowEvents.length, 1, `expected 1 shallow rep, got ${shallowEvents.length}`);
});

test('state machine: jittery noise near lockout counts 0 reps', () => {
  const engine = new SquatRepEngine();
  // Small oscillations that never approach the DOWN/shallow thresholds.
  const noise = [175, 178, 173, 176, 172, 177, 174, 179, 171, 175, 176, 173];
  const seq = noise.map((angle, i) => ({ angle, t: i * 50 }));
  const events = run(engine, seq);
  const repEvents = events.filter((e) => e.type === EVENT.REP);
  const shallowEvents = events.filter((e) => e.type === EVENT.SHALLOW);
  assert.strictEqual(repEvents.length, 0);
  assert.strictEqual(shallowEvents.length, 0);
});

test('state machine: jitter right at the DOWN_ANGLE boundary counts 0 reps', () => {
  const engine = new SquatRepEngine();
  // Oscillates just above/below 100 for under the debounce window, never
  // sustaining long enough or returning fully to lockout.
  const noise = [175, 150, 105, 95, 105, 95, 105, 150, 175];
  const seq = noise.map((angle, i) => ({ angle, t: i * 30 })); // 30ms steps < 250ms debounce
  const events = run(engine, seq);
  const repEvents = events.filter((e) => e.type === EVENT.REP);
  assert.strictEqual(repEvents.length, 0, `expected 0 reps from fast jitter, got ${repEvents.length}`);
});

test('state machine: MIN_REP_INTERVAL_MS rejects a second rep counted too soon', () => {
  const engine = new SquatRepEngine();
  // Two full (debounce-confirmed) dips back-to-back, the second resolving
  // well within 500ms of the first.
  const seq = buildSequence(
    [
      [175],
      [90, 300], // descend (tail dips below DOWN_ANGLE)
      [90, 300], // hold below DOWN_ANGLE long enough to confirm the phase
      [175, 100], // ascend — resolves rep 1 around t=700
      [90, 50], // descend again, fast
      [90, 300], // hold below DOWN_ANGLE again
      [175, 50], // ascend — resolves attempt 2 well under 500ms after rep 1
    ],
    50
  );
  const events = run(engine, seq);
  const repEvents = events.filter((e) => e.type === EVENT.REP);
  assert.strictEqual(repEvents.length, 1, `expected exactly 1 rep within ${MIN_REP_INTERVAL_MS}ms, got ${repEvents.length}`);
});

test('state machine: two well-spaced full reps both count', () => {
  const engine = new SquatRepEngine();
  const seq = buildSequence(
    [
      [175],
      [90, 300],
      [90, 300],
      [175, 100], // resolves rep 1
      [175, 700], // pause well past MIN_REP_INTERVAL_MS before next descent
      [90, 300],
      [90, 300],
      [175, 100], // resolves rep 2
    ],
    50
  );
  const events = run(engine, seq);
  const repEvents = events.filter((e) => e.type === EVENT.REP);
  assert.strictEqual(repEvents.length, 2, `expected 2 reps, got ${repEvents.length}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
