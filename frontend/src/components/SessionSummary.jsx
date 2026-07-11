function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Post-workout summary screen: camera reps are the headline, device count
// and heart rate are supporting detail. Shown right after "End workout" /
// manual entry, and when revisiting an already-completed session.
export default function SessionSummary({ session, onDone }) {
  const summary = session.summary || {};
  const heartReadings = (session.biometrics || []).filter((b) => b.type === 'heart_rate');
  const avgHr = heartReadings.length
    ? Math.round(heartReadings.reduce((a, b) => a + b.value, 0) / heartReadings.length)
    : null;
  const peakHr = heartReadings.length ? Math.max(...heartReadings.map((b) => b.value)) : null;
  // totalReps falls back to the manual count when there are zero camera events —
  // label it honestly rather than always claiming "camera".
  const hasCameraEvents = (session.repEvents || []).some((e) => e.source === 'camera');
  const repsLabel = hasCameraEvents ? 'camera reps' : 'manual reps';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 max-w-md mx-auto text-center">
      <p className="text-muted text-sm uppercase tracking-wide mb-1">Workout complete</p>
      <p className="text-muted text-xs mb-6">{formatDate(session.startedAt)}</p>

      <div className="font-display text-8xl font-extrabold text-rep leading-none mb-1">
        {summary.totalReps ?? 0}
      </div>
      <p className="text-muted text-sm uppercase tracking-wide mb-6">{repsLabel}</p>

      <div className="w-full bg-panel border border-border rounded-xl p-5 mb-6 text-left space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted text-sm">Device confirmed</span>
          <span className="text-heart font-semibold">{summary.deviceRepCount ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted text-sm">Avg form score</span>
          <span className="text-text font-semibold">
            {summary.avgFormScore !== null && summary.avgFormScore !== undefined
              ? `${Math.round(summary.avgFormScore * 100)}%`
              : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted text-sm">Avg heart rate</span>
          <span className="text-heart font-semibold">{avgHr ?? '—'} bpm</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted text-sm">Peak heart rate</span>
          <span className="text-heart font-semibold">{peakHr ?? '—'} bpm</span>
        </div>
      </div>

      {heartReadings.length > 0 && (
        <p className="text-sm text-muted mb-6 leading-relaxed">
          Effort: heart rate climbed to <span className="text-heart font-semibold">{peakHr} bpm</span> during this
          session — a strong effort signal alongside the rep count.
        </p>
      )}

      <button onClick={onDone} className="w-full bg-rep text-bg font-bold text-lg py-4 rounded-xl">
        Done
      </button>
    </div>
  );
}
