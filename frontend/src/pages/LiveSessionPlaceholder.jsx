import { useParams } from 'react-router-dom';

// Replaced in Phase 3 with the real camera-tracking live session screen.
export default function LiveSessionPlaceholder() {
  const { id } = useParams();
  return (
    <div className="min-h-screen flex items-center justify-center px-4 text-center">
      <div>
        <p className="text-muted text-sm mb-2">Session</p>
        <p className="text-text font-mono text-sm break-all">{id}</p>
        <p className="text-muted text-sm mt-4">Live camera tracking screen coming in Phase 3.</p>
      </div>
    </div>
  );
}
