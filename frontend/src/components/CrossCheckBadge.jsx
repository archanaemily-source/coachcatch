export default function CrossCheckBadge({ cameraCount, deviceCount }) {
  if (deviceCount === null || deviceCount === undefined) {
    return <span className="text-xs text-muted uppercase tracking-wide">no device data</span>;
  }
  const agrees = Math.abs(cameraCount - deviceCount) <= 2;
  return (
    <span
      className={
        'text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded ' +
        (agrees ? 'bg-success/20 text-success' : 'bg-error/20 text-error')
      }
    >
      {agrees ? 'Cross-check agrees' : 'Cross-check mismatch'}
    </span>
  );
}
