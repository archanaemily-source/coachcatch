import CrossCheckBadge from './CrossCheckBadge';
import HeartRateChart from './HeartRateChart';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function SessionDetailPanel({ session }) {
  if (!session) return null;

  const isLive = session.status === 'in_progress';
  const cameraCount = session.summary ? session.summary.totalReps : session.cameraRepCount;
  const deviceCount = session.summary ? session.summary.deviceRepCount : session.deviceRepCount;
  const formScore = session.summary
    ? session.summary.avgFormScore
    : (() => {
        const scores = (session.repEvents || [])
          .filter((e) => e.source === 'camera' && e.formScore !== null && e.formScore !== undefined)
          .map((e) => e.formScore);
        return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      })();
  const heartReadings = (session.biometrics || []).filter((b) => b.type === 'heart_rate');
  // totalReps falls back to the manual count when there are zero camera events —
  // label it honestly rather than always claiming "camera".
  const hasCameraEvents = (session.repEvents || []).some((e) => e.source === 'camera');
  const repsLabel = hasCameraEvents || !session.summary ? 'Camera reps' : 'Manual reps';

  return (
    <div className="bg-panel border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm text-muted uppercase tracking-wide">{session.exerciseType || 'squat'}</div>
          <div className="text-sm text-muted">{formatDate(session.startedAt)}</div>
        </div>
        {isLive && (
          <span className="flex items-center gap-2 text-error text-xs font-semibold uppercase tracking-wide">
            <span className="live-dot h-2 w-2 rounded-full bg-error inline-block" />
            Live
          </span>
        )}
      </div>

      <div className="flex items-end gap-6 mb-4">
        <div>
          <div className="text-xs text-muted uppercase tracking-wide mb-1">{repsLabel}</div>
          <div className="font-display text-6xl font-bold text-rep leading-none">{cameraCount ?? 0}</div>
        </div>
        <div className="pb-2">
          <div className="text-xs text-muted uppercase tracking-wide mb-1">Device confirmed</div>
          <div className="flex items-center gap-2">
            <span className="font-display text-3xl font-bold text-text">{deviceCount ?? '—'}</span>
            <CrossCheckBadge cameraCount={cameraCount ?? 0} deviceCount={deviceCount} />
          </div>
        </div>
      </div>

      {formScore !== null && formScore !== undefined && (
        <div className="mb-4">
          <div className="text-xs text-muted uppercase tracking-wide mb-1">Avg form score</div>
          <div className="text-2xl font-semibold text-text">{Math.round(formScore * 100)}%</div>
        </div>
      )}

      <div>
        <div className="text-xs text-muted uppercase tracking-wide mb-2 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-heart inline-block" />
          Heart rate
          {session.latestHeartRate ? (
            <span className="text-heart font-semibold normal-case">{session.latestHeartRate} bpm latest</span>
          ) : null}
        </div>
        <HeartRateChart readings={heartReadings} />
      </div>
    </div>
  );
}
