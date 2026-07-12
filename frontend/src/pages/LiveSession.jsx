import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilesetResolver, PoseLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  SquatRepEngine,
  EVENT,
  bestSideKneeAngle,
  VISIBILITY_THRESHOLD,
  STARTUP_CONFIDENT_MS,
} from '../repEngine';
import DepthGauge from '../components/DepthGauge';
import SessionSummary from '../components/SessionSummary';

const MEDIAPIPE_VERSION = '0.10.35';
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

const POLL_MS = 4000;
const GO_DEEPER_FLASH_MS = 1200;
const REP_POP_MS = 220;

export default function LiveSession() {
  const { id: sessionId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(new SquatRepEngine());
  const confidentSinceRef = useRef(null);
  const repNumberRef = useRef(0);
  const rafRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const stopCameraRef = useRef(() => {});

  const [deviceToken, setDeviceToken] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [statusMessage, setStatusMessage] = useState('Loading pose model…');
  const [cameraReps, setCameraReps] = useState(0);
  const [shallowReps, setShallowReps] = useState(0);
  const [currentAngle, setCurrentAngle] = useState(null);
  const [phase, setPhase] = useState('up');
  const [showGoDeeper, setShowGoDeeper] = useState(false);
  const [repPop, setRepPop] = useState(false);
  const [latestBreathRate, setLatestBreathRate] = useState(null);
  const [deviceRepCount, setDeviceRepCount] = useState(null);
  const [summarySession, setSummarySession] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCount, setManualCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  // Load the session (for deviceToken) and poll for breath rate / device rep cross-check.
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const poll = () => {
      api
        .getSession(sessionId, token)
        .then((data) => {
          if (cancelled) return;
          setDeviceToken(data.deviceToken ?? null);
          setLatestBreathRate(data.latestBreathRate);
          setDeviceRepCount(data.deviceRepCount);
          if (data.status === 'in_progress') {
            timer = setTimeout(poll, POLL_MS);
          } else {
            // Session was completed (e.g. by an end-workout action, or on reload
            // after finishing) — show the summary instead of the live view.
            stopCameraRef.current();
            setSummarySession((prev) => prev ?? data);
          }
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(poll, POLL_MS);
        });
    };
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, token]);

  // Camera + pose model setup and the per-frame detection loop.
  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        if (cancelled) return;
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setStatusMessage('Position check…');
        rafRef.current = requestAnimationFrame(detectLoop);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Could not access the camera.');
      }
    }

    function detectLoop() {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const canvas = canvasRef.current;
      if (!video || !landmarker || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const drawer = new DrawingUtils(ctx);

      if (result.landmarks && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0];
        drawer.drawLandmarks(landmarks, { radius: 3, color: '#FF5C1F' });
        drawer.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: '#3EC9A7', lineWidth: 2 });

        const { angle, visibility } = bestSideKneeAngle(landmarks);
        handleFrame(angle, visibility, now);
      } else {
        handleFrame(null, 0, now);
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(detectLoop);
    }

    function handleFrame(angle, visibility, now) {
      if (visibility < VISIBILITY_THRESHOLD || angle === null) {
        confidentSinceRef.current = null;
        setStatusMessage('Step back — whole body in frame');
        setCurrentAngle(null);
        return;
      }

      if (confidentSinceRef.current === null) confidentSinceRef.current = now;
      const confidentFor = now - confidentSinceRef.current;

      setCurrentAngle(angle);

      if (confidentFor < STARTUP_CONFIDENT_MS) {
        setStatusMessage('Position check…');
        return;
      }

      setStatusMessage('');
      const event = engineRef.current.step(angle, now);
      setPhase(event.phase);

      if (event.type === EVENT.REP) {
        repNumberRef.current += 1;
        setCameraReps(repNumberRef.current);
        setRepPop(true);
        setTimeout(() => setRepPop(false), REP_POP_MS);
        if (navigator.vibrate) navigator.vibrate(60);
        api
          .postRep(
            sessionId,
            {
              source: 'camera',
              repNumber: repNumberRef.current,
              timestamp: new Date().toISOString(),
              formScore: event.formScore,
            },
            token
          )
          .catch(() => {});
      } else if (event.type === EVENT.SHALLOW) {
        setShallowReps((n) => n + 1);
        setShowGoDeeper(true);
        setTimeout(() => setShowGoDeeper(false), GO_DEEPER_FLASH_MS);
      }
    }

    function stopCamera() {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }
    stopCameraRef.current = stopCamera;

    setup();

    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token]);

  async function handleEndWorkout() {
    setBusy(true);
    setActionError('');
    stopCameraRef.current();
    try {
      await api.completeSession(sessionId, token);
      const full = await api.getSession(sessionId, token);
      setSummarySession(full);
    } catch (err) {
      setActionError(err.message);
      setBusy(false);
    }
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    const count = Number(manualCount);
    if (!Number.isFinite(count) || count <= 0) return;
    setBusy(true);
    setActionError('');
    stopCameraRef.current();
    try {
      for (let i = 1; i <= count; i++) {
        // eslint-disable-next-line no-await-in-loop
        await api.postRep(sessionId, { source: 'manual', repNumber: i, timestamp: new Date().toISOString() }, token);
      }
      await api.completeSession(sessionId, token);
      const full = await api.getSession(sessionId, token);
      setSummarySession(full);
    } catch (err) {
      setActionError(err.message);
      setBusy(false);
    }
  }

  if (summarySession) {
    return <SessionSummary session={summarySession} onDone={() => navigate('/student')} />;
  }

  const showStatusBanner = statusMessage && !loadError;

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-4 max-w-md mx-auto">
      <div className="w-full text-center mb-3">
        <div className="text-xs text-muted uppercase tracking-wide">Sensor code</div>
        <div className="font-display text-4xl font-extrabold tracking-wider text-text">
          {deviceToken || '········'}
        </div>
      </div>

      <div className="relative w-full aspect-[3/4] bg-panel border border-border rounded-xl overflow-hidden mb-4">
        <video ref={videoRef} className="w-full h-full object-cover -scale-x-100" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full -scale-x-100" />

        {showStatusBanner && (
          <div className="absolute inset-x-0 top-0 bg-bg/80 text-text text-sm font-semibold text-center py-2">
            {statusMessage}
          </div>
        )}
        {showGoDeeper && (
          <div className="absolute inset-0 flex items-center justify-center bg-error/30">
            <span className="font-display text-4xl font-extrabold text-error bg-bg/70 px-4 py-2 rounded">
              GO DEEPER
            </span>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/90 px-4 text-center">
            <p className="text-error text-sm">{loadError}</p>
          </div>
        )}
      </div>

      <DepthGauge angle={currentAngle} phase={phase} />

      <div className={`font-display text-8xl font-extrabold text-rep leading-none mb-1 ${repPop ? 'rep-pop' : ''}`}>
        {cameraReps}
      </div>
      <div className="text-xs text-muted uppercase tracking-wide mb-4">
        reps{shallowReps > 0 ? ` · ${shallowReps} shallow` : ''}
      </div>

      <div className="flex items-center gap-6 text-sm mb-6">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-breath inline-block" />
          <span className="text-breath font-semibold">{latestBreathRate ?? '—'} breaths/min</span>
        </div>
        <div className="text-muted">
          Device: <span className="text-text font-semibold">{deviceRepCount ?? '—'}</span>
        </div>
      </div>

      {actionError && <p className="text-error text-sm mb-3">{actionError}</p>}

      <div className="w-full space-y-3">
        <button
          onClick={handleEndWorkout}
          disabled={busy}
          className="w-full bg-rep text-bg font-bold text-lg py-3.5 rounded-xl disabled:opacity-50"
        >
          {busy ? 'Ending…' : 'End workout'}
        </button>

        {!manualOpen && (
          <button
            onClick={() => setManualOpen(true)}
            disabled={busy}
            className="w-full text-muted text-sm underline py-1"
          >
            Manual entry
          </button>
        )}

        {manualOpen && (
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="number"
              min="1"
              placeholder="Reps completed"
              value={manualCount}
              onChange={(e) => setManualCount(e.target.value)}
              required
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-text placeholder:text-muted focus:outline-none focus:border-rep"
            />
            <button
              type="submit"
              disabled={busy}
              className="bg-panel border border-border text-text font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {busy ? '…' : 'Log & finish'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
