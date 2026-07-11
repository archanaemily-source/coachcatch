import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import SessionDetailPanel from '../components/SessionDetailPanel';

export default function StudentHome() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [goals, setGoals] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api
      .getStudentGoals(user.id, token)
      .then((data) => setGoals(data.goals.filter((g) => g.active)))
      .catch((err) => setError(err.message));
    api
      .getStudentSessions(user.id, token)
      .then((data) => setSessions(data.sessions))
      .catch((err) => setError(err.message));
  }, [user.id, token]);

  const handleStart = async () => {
    setStarting(true);
    setError('');
    try {
      const goalId = goals[0]?.id;
      const { sessionId } = await api.startSession({ goalId }, token);
      navigate(`/session/${sessionId}`);
    } catch (err) {
      setError(err.message);
      setStarting(false);
    }
  };

  const handleSelectSession = (id) => {
    if (selectedSessionId === id) {
      setSelectedSessionId(null);
      setSelectedSession(null);
      return;
    }
    setSelectedSessionId(id);
    api
      .getSession(id, token)
      .then((data) => setSelectedSession(data))
      .catch((err) => setError(err.message));
  };

  return (
    <div className="min-h-screen px-4 py-6 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Hey {user.name.split(' ')[0]}</h1>
          <p className="text-muted text-sm">Ready to train?</p>
        </div>
        <button onClick={logout} className="text-muted text-sm underline">
          Log out
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-sm text-muted uppercase tracking-wide mb-2">Active goals</h2>
        {goals.length === 0 && <p className="text-muted text-sm">No active goals yet — your coach will assign one.</p>}
        <div className="space-y-2">
          {goals.map((g) => (
            <div key={g.id} className="bg-panel border border-border rounded-xl p-4 flex items-center justify-between">
              <span className="capitalize text-text font-semibold">{g.exerciseType}</span>
              <span className="font-display text-2xl font-bold text-rep">{g.targetReps} reps</span>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-error text-sm mb-4">{error}</p>}

      <button
        onClick={handleStart}
        disabled={starting}
        className="w-full bg-rep text-bg font-bold text-lg py-4 rounded-xl disabled:opacity-50 mb-8"
      >
        {starting ? 'Starting…' : 'Start session'}
      </button>

      <div>
        <h2 className="text-sm text-muted uppercase tracking-wide mb-2">Session history</h2>
        {sessions.length === 0 && <p className="text-muted text-sm">No sessions yet.</p>}
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id}>
              <button
                onClick={() => handleSelectSession(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border flex items-center justify-between ${
                  selectedSessionId === s.id ? 'border-rep bg-panel' : 'border-border bg-panel/50'
                }`}
              >
                <span className="text-text text-sm">{new Date(s.startedAt).toLocaleString()}</span>
                {s.status === 'in_progress' ? (
                  <span className="text-error text-xs font-semibold uppercase">Live</span>
                ) : (
                  <span className="text-muted text-xs">{s.summary?.totalReps ?? s.cameraRepCount} reps</span>
                )}
              </button>
              {selectedSessionId === s.id && selectedSession && (
                <div className="mt-2">
                  <SessionDetailPanel session={selectedSession} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
