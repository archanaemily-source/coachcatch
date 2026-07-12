const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { canViewStudent } = require('../lib/access');
const { getRepEvents, getBiometrics, repCounts, computeSummary } = require('../lib/summary');

const router = express.Router();

function generateDeviceToken() {
  return crypto.randomBytes(4).toString('hex'); // 8 hex chars
}

router.post('/', authMiddleware, (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'student only' });

  const { goalId } = req.body || {};
  if (goalId) {
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId);
    if (!goal || goal.studentId !== req.user.id) {
      return res.status(400).json({ error: 'invalid goalId' });
    }
  }

  const id = crypto.randomUUID();
  const deviceToken = generateDeviceToken();
  const startedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO sessions (id, studentId, goalId, exerciseType, deviceToken, startedAt, endedAt, status)
     VALUES (?, ?, ?, 'squat', ?, ?, NULL, 'in_progress')`
  ).run(id, req.user.id, goalId || null, deviceToken, startedAt);

  res.status(201).json({ sessionId: id, deviceToken });
});

router.post('/:id/reps', authMiddleware, (req, res) => {
  const { id } = req.params;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (session.studentId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (session.status === 'completed') return res.status(409).json({ error: 'session already completed' });

  const { source, repNumber, timestamp, formScore } = req.body || {};
  if (!['camera', 'manual'].includes(source) || !Number.isFinite(Number(repNumber))) {
    return res.status(400).json({ error: "source must be 'camera' or 'manual', repNumber is required" });
  }

  const eventId = crypto.randomUUID();
  const ts = timestamp || new Date().toISOString();
  const score = formScore === undefined || formScore === null ? null : Number(formScore);
  db.prepare(
    'INSERT INTO rep_events (id, sessionId, source, repNumber, timestamp, formScore) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(eventId, id, source, Number(repNumber), ts, score);

  const event = db.prepare('SELECT * FROM rep_events WHERE id = ?').get(eventId);
  res.status(201).json({ event });
});

router.post('/:id/complete', authMiddleware, (req, res) => {
  const { id } = req.params;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (session.studentId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

  if (session.status !== 'completed') {
    const endedAt = new Date().toISOString();
    db.prepare("UPDATE sessions SET status = 'completed', endedAt = ?, deviceToken = NULL WHERE id = ?").run(
      endedAt,
      id
    );
  }

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  const events = getRepEvents(id);
  const summary = computeSummary(updated, events);
  res.json({ summary });
});

router.get('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (!canViewStudent(req.user, session.studentId)) return res.status(403).json({ error: 'forbidden' });

  const events = getRepEvents(id);
  const biometrics = getBiometrics(id);
  const { cameraRepCount, deviceRepCount } = repCounts(events);
  const breathRates = biometrics.filter((b) => b.type === 'breath_rate');
  const latestBreathRate = breathRates.length ? breathRates[breathRates.length - 1].value : null;

  const isCoach = req.user.role === 'coach';
  const { deviceToken, ...rest } = session;

  res.json({
    ...rest,
    ...(isCoach ? {} : { deviceToken }),
    repEvents: events,
    biometrics,
    cameraRepCount,
    deviceRepCount,
    latestBreathRate,
    summary: session.status === 'completed' ? computeSummary(session, events) : null,
  });
});

module.exports = router;
