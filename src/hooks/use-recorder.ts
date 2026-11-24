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
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  if (peak < 0.012) return true;
  const win = Math.min(3200, samples.length); // 200 ms at 16 kHz
  const step = Math.max(1, Math.floor(win / 2));
  const windowRms = (start: number) => {
    let sumSq = 0;
    for (let i = 0; i < win; i++) {
      const v = samples[start + i];
      sumSq += v * v;
    }
    return Math.sqrt(sumSq / win);
  };
  let maxWindowRms = 0;
  for (let start = 0; start <= samples.length - win; start += step) {
    maxWindowRms = Math.max(maxWindowRms, windowRms(start));
  }
  if (samples.length > win && (samples.length - win) % step !== 0) {
    maxWindowRms = Math.max(maxWindowRms, windowRms(samples.length - win));
  }
  return maxWindowRms < 0.0025;
}

export const SILENT_MESSAGE = "We could not hear anything. Check that the right microphone is selected and not muted, speak a little louder, and try again. This did not use a recording.";

/** Microphone capture with a live analyser for the level meter. */
export function useRecorder(onAutoStop: (blob: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const session = useRef<Session | null>(null);
  const starting = useRef(false);
  const autoStop = useRef(onAutoStop);
  useEffect(() => {
    autoStop.current = onAutoStop;
  });

  const stop = useCallback((): Promise<Blob | null> => {
    const s = session.current;
    if (!s) return Promise.resolve(null);
    session.current = null;
    window.clearInterval(s.timer);
    const cleanup = () => {
      s.stream.getTracks().forEach((t) => t.stop());
      void s.ctx.close().catch(() => undefined);
      setRecording(false);
      setAnalyser(null);
    };
    if (s.recorder.state === "inactive") {
      cleanup();
      return Promise.resolve(s.chunks.length ? new Blob(s.chunks, { type: s.recorder.mimeType }) : null);
    }
    return new Promise((resolve) => {
      let settled = false;
      let fallback = 0;
      const finish = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallback);
        cleanup();
        resolve(blob);
      };
      // Guard against browsers dropping `onstop` when an audio device switches profile mid-take.
      fallback = window.setTimeout(
        () => finish(s.chunks.length ? new Blob(s.chunks, { type: s.recorder.mimeType }) : null),
        2000,
      );
      s.recorder.onstop = () => finish(new Blob(s.chunks, { type: s.recorder.mimeType }));
      try {
        s.recorder.stop();
      } catch {
        finish(s.chunks.length ? new Blob(s.chunks, { type: s.recorder.mimeType }) : null);
      }
    });
  }, []);

  const start = useCallback(
    async (opts?: { echoCancellation?: boolean }) => {
      if (session.current || starting.current) return;
      starting.current = true;
      try {
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
          if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
          const node = ctx.createAnalyser();
          node.fftSize = 256;
          ctx.createMediaStreamSource(stream).connect(node);

          const recorder = new MediaRecorder(stream);
          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size) chunks.push(e.data);
          };
          recorder.onerror = () => {
            if (session.current?.recorder !== recorder) return;
            const s = session.current;
            session.current = null;
            window.clearInterval(s.timer);
            s.stream.getTracks().forEach((t) => t.stop());
            void s.ctx.close().catch(() => undefined);
            setRecording(false);
            setAnalyser(null);
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
          recorder.start(250);
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
      } finally {
        starting.current = false;
      }
    },
    [stop],
  );

  useEffect(() => () => void stop(), [stop]);

  return { recording, seconds, analyser, start, stop };
}
