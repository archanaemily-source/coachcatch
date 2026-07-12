import { useEffect, useRef } from 'react';

const LINE_COLOR = '#3EC9A7';
const GRID_COLOR = '#2A3038';
const LABEL_COLOR = '#9BA1A8';
const PADDING = { top: 16, right: 16, bottom: 24, left: 36 };

// Hand-rolled canvas line chart — no chart library, per spec.
export default function BreathRateChart({ readings }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = 180;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!readings || readings.length === 0) {
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = '13px Inter, sans-serif';
      ctx.fillText('No breath rate data yet', PADDING.left, height / 2);
      return;
    }

    const values = readings.map((r) => r.value);
    const minV = Math.min(...values) - 5;
    const maxV = Math.max(...values) + 5;
    const plotW = width - PADDING.left - PADDING.right;
    const plotH = height - PADDING.top - PADDING.bottom;

    const xFor = (i) => PADDING.left + (readings.length === 1 ? plotW / 2 : (i / (readings.length - 1)) * plotW);
    const yFor = (v) => PADDING.top + plotH - ((v - minV) / (maxV - minV)) * plotH;

    // gridlines + y labels
    ctx.strokeStyle = GRID_COLOR;
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = '11px Inter, sans-serif';
    ctx.lineWidth = 1;
    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const v = minV + ((maxV - minV) * i) / steps;
      const y = yFor(v);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(width - PADDING.right, y);
      ctx.stroke();
      ctx.fillText(Math.round(v).toString(), 4, y + 4);
    }

    // line
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    readings.forEach((r, i) => {
      const x = xFor(i);
      const y = yFor(r.value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // points
    ctx.fillStyle = LINE_COLOR;
    readings.forEach((r, i) => {
      const x = xFor(i);
      const y = yFor(r.value);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [readings]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
