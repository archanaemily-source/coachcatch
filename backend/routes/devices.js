const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { encrypt } = require('../crypto');

const router = express.Router();

function deviceAuthMiddleware(req, res, next) {
  const token = req.headers['x-device-token'];
  if (!token) return res.status(401).json({ error: 'missing X-Device-Token header' });

  const session = db
    .prepare("SELECT * FROM sessions WHERE deviceToken = ? AND status = 'in_progress'")
    .get(token);
  if (!session) return res.status(401).json({ error: 'invalid or expired device token' });

  req.deviceSession = session;
  next();
}

router.post('/reps', deviceAuthMiddleware, (req, res) => {
  const { sessionId, repNumber, timestamp } = req.body || {};
  if (sessionId && sessionId !== req.deviceSession.id) {
    return res.status(400).json({ error: 'sessionId does not match device token' });
  }
  if (!Number.isFinite(Number(repNumber))) {
    return res.status(400).json({ error: 'repNumber is required' });
  }

  const eventId = crypto.randomUUID();
  const ts = timestamp || new Date().toISOString();
  db.prepare(
    "INSERT INTO rep_events (id, sessionId, source, repNumber, timestamp, formScore) VALUES (?, ?, 'device', ?, ?, NULL)"
  ).run(eventId, req.deviceSession.id, Number(repNumber), ts);

  res.status(201).json({ ok: true });
});

router.post('/biometrics', deviceAuthMiddleware, (req, res) => {
  const { sessionId, type, value, timestamp } = req.body || {};
  if (sessionId && sessionId !== req.deviceSession.id) {
    return res.status(400).json({ error: 'sessionId does not match device token' });
  }
  if (type !== 'heart_rate' || value === undefined || value === null) {
    return res.status(400).json({ error: "type must be 'heart_rate' and value is required" });
  }

  const readingId = crypto.randomUUID();
  const ts = timestamp || new Date().toISOString();
  db.prepare(
    'INSERT INTO biometric_readings (id, sessionId, type, value, timestamp) VALUES (?, ?, ?, ?, ?)'
  ).run(readingId, req.deviceSession.id, type, encrypt(value), ts);

  res.status(201).json({ ok: true });
});

module.exports = router;
