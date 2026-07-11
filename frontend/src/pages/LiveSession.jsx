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

  const [deviceToken, setDeviceToken] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [statusMessage, setStatusMessage] = useState('Loading pose model…');
  const [cameraReps, setCameraReps] = useState(0);
  const [shallowReps, setShallowReps] = useState(0);
  const [currentAngle, setCurrentAngle] = useState(null);
  const [phase, setPhase] = useState('up');
  const [showGoDeeper, setShowGoDeeper] = useState(false);
  const [repPop, setRepPop] = useState(false);
  const [latestHeartRate, setLatestHeartRate] = useState(null);
  const [deviceRepCount, setDeviceRepCount] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('in_progress');

  // Load the session (for deviceToken) and poll for HR / device rep cross-check.
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const poll = () => {
      api
        .getSession(sessionId, token)
        .then((data) => {
          if (cancelled) return;
          setDeviceToken(data.deviceToken ?? null);
          setLatestHeartRate(data.latestHeartRate);
          setDeviceRepCount(data.deviceRepCount);
          setSessionStatus(data.status);
          if (data.status === 'in_progress') timer = setTimeout(poll, POLL_MS);
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

    setup();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (landmarkerRef.current) landmarkerRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token]);

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

      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-heart inline-block" />
          <span className="text-heart font-semibold">{latestHeartRate ?? '—'} bpm</span>
        </div>
        <div className="text-muted">
          Device: <span className="text-text font-semibold">{deviceRepCount ?? '—'}</span>
        </div>
      </div>

      {sessionStatus === 'completed' && (
        <p className="text-muted text-sm mt-6">This session has been completed.</p>
      )}
    </div>
  );
}
