"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_RECORDING_SECONDS = 30;

interface Session {
  stream: MediaStream;
  recorder: MediaRecorder;
  ctx: AudioContext;
  chunks: Blob[];
  timer: number;
}

/** Microphone capture with a live analyser for the level meter. */
export function useRecorder(onAutoStop: (blob: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const session = useRef<Session | null>(null);
  const autoStop = useRef(onAutoStop);
  useEffect(() => {
    autoStop.current = onAutoStop;
  });

  const stop = useCallback((): Promise<Blob | null> => {
    const s = session.current;
    if (!s) return Promise.resolve(null);
    session.current = null;
    window.clearInterval(s.timer);
    return new Promise((resolve) => {
      s.recorder.onstop = () => {
        s.stream.getTracks().forEach((t) => t.stop());
        void s.ctx.close();
        setRecording(false);
        setAnalyser(null);
        resolve(new Blob(s.chunks, { type: s.recorder.mimeType }));
      };
      s.recorder.stop();
    });
  }, []);

  const start = useCallback(
    async (opts?: { echoCancellation?: boolean }) => {
      if (session.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: opts?.echoCancellation ?? true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    const ctx = new AudioContext();
    const node = ctx.createAnalyser();
    node.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(node);

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) {
        void stop().then((blob) => blob && autoStop.current(blob));
      }
    }, 200);
    session.current = { stream, recorder, ctx, chunks, timer };
    recorder.start();
    setSeconds(0);
    setAnalyser(node);
    setRecording(true);
  }, [stop]);

  useEffect(() => () => void stop(), [stop]);

  return { recording, seconds, analyser, start, stop };
}
