// Polls the hardware teammate's Firebase breath-analyzer feed and mirrors
// new readings into biometric_readings for whichever session(s) are
// currently in_progress. The feed has no session/device identifier, so
// this is a hackathon-scoped assumption: readings fan out to every live
// session (fine for the one-student-at-a-time demo case).
const db = require('../db');
const { encrypt } = require('../crypto');
const crypto = require('crypto');

// No hardcoded default on purpose — this points at a specific teammate's
// Firebase project. Set FIREBASE_BREATH_URL in backend/.env (gitignored) to
// enable polling; without it, startFirebaseBreathPolling() is a no-op.
const FIREBASE_URL = process.env.FIREBASE_BREATH_URL;
const POLL_MS = 4000;

// Only ingest readings that arrive after the poller starts — the feed is a
// growing log the teammate has been testing against for hours, and backfilling
// that history into a fresh session would flood it with stale data.
let lastSeenTimestamp = Date.now();

async function pollFirebaseBreathData() {
  let data;
  try {
    const res = await fetch(FIREBASE_URL);
    if (!res.ok) return;
    data = await res.json();
  } catch (err) {
    console.error('[firebase-breath] fetch failed:', err.message);
    return;
  }
  if (!data) return;

  const entries = Object.values(data)
    .filter((e) => e && typeof e.timestamp === 'number' && typeof e.score === 'number')
    .filter((e) => e.timestamp > lastSeenTimestamp)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (entries.length === 0) return;

  const liveSessions = db.prepare("SELECT id FROM sessions WHERE status = 'in_progress'").all();
  if (liveSessions.length > 0) {
    const insert = db.prepare(
      "INSERT INTO biometric_readings (id, sessionId, type, value, timestamp) VALUES (?, ?, 'breath_rate', ?, ?)"
    );
    for (const entry of entries) {
      const isoTimestamp = new Date(entry.timestamp).toISOString();
      for (const session of liveSessions) {
        insert.run(crypto.randomUUID(), session.id, encrypt(entry.score), isoTimestamp);
      }
    }
    console.log(`[firebase-breath] ingested ${entries.length} reading(s) into ${liveSessions.length} live session(s)`);
  }

  lastSeenTimestamp = entries[entries.length - 1].timestamp;
}

function startFirebaseBreathPolling() {
  if (!FIREBASE_URL) {
    console.log('[firebase-breath] FIREBASE_BREATH_URL not set — polling disabled');
    return null;
  }
  pollFirebaseBreathData();
  return setInterval(pollFirebaseBreathData, POLL_MS);
}

module.exports = { startFirebaseBreathPolling, pollFirebaseBreathData };
