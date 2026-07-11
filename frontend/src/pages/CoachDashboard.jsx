import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import SessionDetailPanel from '../components/SessionDetailPanel';

const POLL_MS = 4000;

export default function CoachDashboard() {
  const { user, token, logout } = useAuth();
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [goals, setGoals] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [targetReps, setTargetReps] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getCoachStudents(user.id, token)
      .then((data) => setStudents(data.students))
      .catch((err) => setError(err.message));
  }, [user.id, token]);

  const loadStudentData = (studentId) => {
    setSelectedStudentId(studentId);
    setSelectedSessionId(null);
    setSelectedSession(null);
    api
      .getStudentGoals(studentId, token)
      .then((data) => setGoals(data.goals))
      .catch((err) => setError(err.message));
    api
      .getStudentSessions(studentId, token)
      .then((data) => setSessions(data.sessions))
      .catch((err) => setError(err.message));
  };

  const handleAssignGoal = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createGoal({ studentId: selectedStudentId, targetReps: Number(targetReps) }, token);
      setTargetReps('');
      const data = await api.getStudentGoals(selectedStudentId, token);
      setGoals(data.goals);
    } catch (err) {
      setError(err.message);
    }
  };

  // Poll the selected session every 4s while it's live; stop once it completes.
  useEffect(() => {
    if (!selectedSessionId) return;
    let cancelled = false;
    let timer = null;

    const fetchSession = () => {
      api
        .getSession(selectedSessionId, token)
        .then((data) => {
          if (cancelled) return;
          setSelectedSession(data);
          if (data.status === 'in_progress') {
            timer = setTimeout(fetchSession, POLL_MS);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        });
    };

    fetchSession();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [selectedSessionId, token]);

  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  return (
    <div className="min-h-screen px-6 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">{user.name}</h1>
          <p className="text-muted text-sm">Roster & live sessions</p>
        </div>
        <button onClick={logout} className="text-muted text-sm underline">
          Log out
        </button>
      </div>

      {error && <p className="text-error text-sm mb-4">{error}</p>}

      <div className="grid grid-cols-[220px_1fr_1fr] gap-6">
        <div>
          <h2 className="text-sm text-muted uppercase tracking-wide mb-2">Students</h2>
          <div className="space-y-2">
            {students.map((s) => (
              <button
                key={s.id}
                onClick={() => loadStudentData(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border ${
                  selectedStudentId === s.id ? 'border-rep bg-panel' : 'border-border bg-panel/50'
                }`}
              >
                <div className="font-semibold text-text">{s.name}</div>
                <div className="text-xs text-muted">{s.email}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          {selectedStudent ? (
            <>
              <h2 className="text-sm text-muted uppercase tracking-wide mb-2">{selectedStudent.name}'s goals</h2>
              <div className="space-y-2 mb-4">
                {goals.map((g) => (
                  <div
                    key={g.id}
                    className="bg-panel border border-border rounded-xl p-3 flex items-center justify-between"
                  >
                    <span className="capitalize text-text">{g.exerciseType}</span>
                    <span className="font-display text-xl font-bold text-rep">{g.targetReps} reps</span>
                  </div>
                ))}
                {goals.length === 0 && <p className="text-muted text-sm">No goals yet.</p>}
              </div>

              <form onSubmit={handleAssignGoal} className="flex gap-2 mb-8">
                <input
                  type="number"
                  min="1"
                  placeholder="Target reps"
                  value={targetReps}
                  onChange={(e) => setTargetReps(e.target.value)}
                  required
                  className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-text placeholder:text-muted focus:outline-none focus:border-rep"
                />
                <button type="submit" className="bg-rep text-bg font-semibold px-4 py-2 rounded-lg">
                  Assign squat goal
                </button>
              </form>

              <h2 className="text-sm text-muted uppercase tracking-wide mb-2">Session history</h2>
              <div className="space-y-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSessionId(s.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border flex items-center justify-between ${
                      selectedSessionId === s.id ? 'border-rep bg-panel' : 'border-border bg-panel/50'
                    }`}
                  >
                    <span className="text-text text-sm">{new Date(s.startedAt).toLocaleString()}</span>
                    {s.status === 'in_progress' ? (
                      <span className="text-error text-xs font-semibold uppercase">Live</span>
                    ) : (
                      <span className="text-muted text-xs">{s.cameraRepCount} reps</span>
                    )}
                  </button>
                ))}
                {sessions.length === 0 && <p className="text-muted text-sm">No sessions yet.</p>}
              </div>
            </>
          ) : (
            <p className="text-muted text-sm">Select a student to see their goals and sessions.</p>
          )}
        </div>

        <div>
          {selectedSession ? (
            <SessionDetailPanel session={selectedSession} />
          ) : (
            <p className="text-muted text-sm">Select a session to see details.</p>
          )}
        </div>
      </div>
    </div>
  );
}
