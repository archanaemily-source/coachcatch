const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { isLinked } = require('../lib/access');

const router = express.Router();

router.post('/', authMiddleware, (req, res) => {
  if (req.user.role !== 'coach') return res.status(403).json({ error: 'coach only' });

  const { studentId, targetReps } = req.body || {};
  if (!studentId || !Number.isFinite(Number(targetReps)) || Number(targetReps) <= 0) {
    return res.status(400).json({ error: 'studentId and a positive targetReps are required' });
  }
  if (!isLinked(req.user.id, studentId)) return res.status(403).json({ error: 'not linked to this student' });

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO goals (id, studentId, coachId, exerciseType, targetReps, active, createdAt)
     VALUES (?, ?, ?, 'squat', ?, 1, ?)`
  ).run(id, studentId, req.user.id, Number(targetReps), createdAt);

  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  res.status(201).json({ goal });
});

module.exports = router;
