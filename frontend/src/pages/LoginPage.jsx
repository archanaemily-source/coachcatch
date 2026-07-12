import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result =
        mode === 'login' ? await api.login({ email, password }) : await api.register({ name, email, password, role });
      login(result.token);
      const payload = JSON.parse(atob(result.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      navigate(payload.role === 'coach' ? '/coach' : '/student');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-5xl font-extrabold text-center mb-1 text-rep">CoachCatch</h1>
        <p className="text-center text-muted mb-8 text-sm">reps prove the motion, breath proves the effort</p>

        <div className="bg-panel border border-border rounded-xl p-6">
          <div className="flex mb-6 rounded-lg overflow-hidden border border-border">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-2 text-sm font-semibold ${mode === 'login' ? 'bg-rep text-bg' : 'text-muted'}`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 py-2 text-sm font-semibold ${mode === 'register' ? 'bg-rep text-bg' : 'text-muted'}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' && (
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text placeholder:text-muted focus:outline-none focus:border-rep"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text placeholder:text-muted focus:outline-none focus:border-rep"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text placeholder:text-muted focus:outline-none focus:border-rep"
            />
            {mode === 'register' && (
              <div className="flex gap-2">
                {['student', 'coach'].map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRole(r)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${
                      role === r ? 'bg-rep border-rep text-bg' : 'border-border text-muted'
                    }`}
                  >
                    {r === 'student' ? 'Student' : 'Coach'}
                  </button>
                ))}
              </div>
            )}

            {error && <p className="text-error text-sm">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-rep text-bg font-bold py-2.5 rounded-lg disabled:opacity-50"
            >
              {mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>
        </div>

        <div className="mt-6 text-xs text-muted text-center leading-relaxed">
          <p className="mb-1 font-semibold text-text/70">Demo logins (password123)</p>
          <p>coach@demo.app — Coach Dana</p>
          <p>jordan@demo.app — student</p>
          <p>sam@demo.app — student</p>
        </div>
      </div>
    </div>
  );
}
