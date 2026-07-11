const db = require('../db');
const { decrypt } = require('../crypto');

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

// formScore per rep = clamp01((120 - minKneeAngleDuringRep) / 20)
function formScoreFromMinAngle(minAngle) {
  return clamp01((120 - minAngle) / 20);
}

function getRepEvents(sessionId) {
  return db
    .prepare('SELECT * FROM rep_events WHERE sessionId = ? ORDER BY timestamp ASC, id ASC')
    .all(sessionId);
}

function getBiometrics(sessionId) {
  const rows = db
    .prepare('SELECT * FROM biometric_readings WHERE sessionId = ? ORDER BY timestamp ASC, id ASC')
    .all(sessionId);
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    type: r.type,
    value: Number(decrypt(r.value)),
    timestamp: r.timestamp,
  }));
}

function repCounts(events) {
  const cameraEvents = events.filter((e) => e.source === 'camera');
  const manualEvents = events.filter((e) => e.source === 'manual');
  const deviceEvents = events.filter((e) => e.source === 'device');
  return {
    cameraRepCount: cameraEvents.length,
    manualRepCount: manualEvents.length,
    deviceRepCount: deviceEvents.length > 0 ? deviceEvents.length : null,
    cameraEvents,
    manualEvents,
    deviceEvents,
  };
}

function computeSummary(session, events) {
  const { cameraEvents, manualEvents, deviceRepCount } = repCounts(events);
  const totalReps = cameraEvents.length > 0 ? cameraEvents.length : manualEvents.length;
  const formScores = cameraEvents
    .map((e) => e.formScore)
    .filter((v) => v !== null && v !== undefined);
  const avgFormScore = formScores.length
    ? Math.round((formScores.reduce((a, b) => a + b, 0) / formScores.length) * 1000) / 1000
    : null;

  const startMs = new Date(session.startedAt).getTime();
  const endMs = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  const durationSeconds = Number.isFinite(startMs) ? Math.max(0, Math.round((endMs - startMs) / 1000)) : null;

  return {
    totalReps,
    deviceRepCount,
    avgFormScore,
    durationSeconds,
  };
}

module.exports = { getRepEvents, getBiometrics, repCounts, computeSummary, formScoreFromMinAngle, clamp01 };
