const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

router.get('/:id/students', authMiddleware, (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'coach' || req.user.id !== id) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const students = db
    .prepare(
      `SELECT u.id, u.name, u.email
       FROM coach_student_links l
       JOIN users u ON u.id = l.studentId
       WHERE l.coachId = ?
       ORDER BY u.name ASC`
    )
    .all(id);
  res.json({ students });
});

module.exports = router;
