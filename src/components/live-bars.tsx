"use client";

import { useEffect, useRef } from "react";

/** Live microphone level meter drawn as centred bars. */
export function LiveBars({ analyser, className }: { analyser: AnalyserNode | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !analyser) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const color = getComputedStyle(canvas).color;
    let frame = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      analyser.getByteFrequencyData(data);
      const step = 5;
      const bars = Math.floor(w / step);
      g.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        // Mirror around the centre so the meter looks balanced.
        const d = Math.abs(i - bars / 2) / (bars / 2);
        const v = data[Math.floor(d * data.length * 0.5)] / 255;
        const bh = Math.max(2, v * h);
        g.beginPath();
        g.roundRect(i * step, (h - bh) / 2, 3, bh, 1.5);
        g.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analyser]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
