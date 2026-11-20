"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SHORT } from "@/lib/short";

export const MAX_RECORDING_SECONDS = SHORT.seconds;

interface Session {
  stream: MediaStream;
  recorder: MediaRecorder;
  ctx: AudioContext;
  chunks: Blob[];
  timer: number;
}

/** A recording problem with a message that is safe to show the learner as it is. */
export class MicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicError";
  }
}

function micMessage(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return "Microphone access is blocked. Allow it from the lock or camera icon in the address bar, then press Record again. Nothing is recorded until you press the button.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return "No microphone found. Plug one in or pick one in your system sound settings, then try again.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Your microphone is busy in another app or tab. Close it there and try again.";
  }
  return "We could not start the microphone. Check that it is connected and allowed, then try again.";
}

/** The tone of a failed start, for callers that only have the thrown value. */
export const recorderErrorMessage = (err: unknown) => (err instanceof MicError ? err.message : micMessage(err));

/** True when a recording holds no usable speech: near-silence from a muted or wrong microphone. */
export function isSilent(samples: Float32Array): boolean {
  if (!samples.length) return true;
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
    sumSq += v * v;
  }
  return peak < 0.015 || Math.sqrt(sumSq / samples.length) < 0.002;
}

export const SILENT_MESSAGE = "We could not hear anything. Check that the right microphone is selected and not muted, speak a little louder, and try again. This did not use a recording.";

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
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new MicError("This browser cannot record audio. Try a current version of Chrome, Safari, Edge or Firefox, on a secure (https) page.");
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: opts?.echoCancellation ?? true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        throw new MicError(micMessage(err));
      }
      let ctx: AudioContext | null = null;
      try {
        ctx = new AudioContext();
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
      } catch (err) {
        // Do not leave the microphone switched on when setup fails half way.
        stream.getTracks().forEach((t) => t.stop());
        void ctx?.close().catch(() => undefined);
        session.current = null;
        throw new MicError(micMessage(err));
      }
    },
    [stop],
  );

  useEffect(() => () => void stop(), [stop]);

  return { recording, seconds, analyser, start, stop };
}
