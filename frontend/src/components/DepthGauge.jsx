import { DOWN_ANGLE } from '../repEngine';

// Gauge range — degrees mapped to the full bar height.
const GAUGE_MIN_ANGLE = 60;
const GAUGE_MAX_ANGLE = 180;

function fractionFor(angle) {
  const clamped = Math.max(GAUGE_MIN_ANGLE, Math.min(GAUGE_MAX_ANGLE, angle));
  return (clamped - GAUGE_MIN_ANGLE) / (GAUGE_MAX_ANGLE - GAUGE_MIN_ANGLE);
}

// Vertical bar on the screen edge: live knee angle vs. the DOWN_ANGLE target line.
export default function DepthGauge({ angle, phase }) {
  const hasAngle = angle !== null && angle !== undefined;
  const fillPct = hasAngle ? fractionFor(angle) * 100 : 100;
  const targetPct = fractionFor(DOWN_ANGLE) * 100;

  return (
    <div className="fixed right-2 top-1/2 -translate-y-1/2 h-64 w-6 flex flex-col items-center z-20">
      <div className="relative h-full w-2.5 bg-panel border border-border rounded-full overflow-hidden">
        <div
          className={`absolute bottom-0 left-0 w-full transition-[height] duration-100 ${
            phase === 'down' ? 'bg-rep' : 'bg-heart'
          }`}
          style={{ height: `${fillPct}%` }}
        />
        <div
          className="absolute left-[-3px] w-[16px] h-[2px] bg-text"
          style={{ bottom: `${targetPct}%` }}
          title={`${DOWN_ANGLE}° target`}
        />
      </div>
    </div>
  );
}
