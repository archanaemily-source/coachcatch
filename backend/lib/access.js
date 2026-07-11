const db = require('../db');

function isLinked(coachId, studentId) {
  const row = db
    .prepare('SELECT id FROM coach_student_links WHERE coachId = ? AND studentId = ?')
    .get(coachId, studentId);
  return !!row;
}

// Returns true if req.user may view the given student's data (owner or linked coach).
function canViewStudent(user, studentId) {
  if (user.role === 'student' && user.id === studentId) return true;
  if (user.role === 'coach' && isLinked(user.id, studentId)) return true;
  return false;
}

module.exports = { isLinked, canViewStudent };
