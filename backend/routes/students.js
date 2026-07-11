const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { canViewStudent } = require('../lib/access');
const { getRepEvents, repCounts, computeSummary } = require('../lib/summary');

const router = express.Router();

router.get('/:id/goals', authMiddleware, (req, res) => {
  const { id } = req.params;
  if (!canViewStudent(req.user, id)) return res.status(403).json({ error: 'forbidden' });

  const goals = db
    .prepare('SELECT * FROM goals WHERE studentId = ? ORDER BY createdAt DESC')
    .all(id);
  res.json({ goals });
});

router.get('/:id/sessions', authMiddleware, (req, res) => {
  const { id } = req.params;
  if (!canViewStudent(req.user, id)) return res.status(403).json({ error: 'forbidden' });

  const sessions = db
    .prepare('SELECT * FROM sessions WHERE studentId = ? ORDER BY startedAt DESC')
    .all(id);

  const result = sessions.map((session) => {
    const events = getRepEvents(session.id);
    const { cameraRepCount, deviceRepCount } = repCounts(events);
    const isCoach = req.user.role === 'coach';
    const { deviceToken, ...rest } = session;
    return {
      ...rest,
      ...(isCoach ? {} : { deviceToken }),
      cameraRepCount,
      deviceRepCount,
      summary: session.status === 'completed' ? computeSummary(session, events) : null,
    };
  });

  res.json({ sessions: result });
});

module.exports = router;
