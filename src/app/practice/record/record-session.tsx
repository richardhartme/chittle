"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { formatDuration } from "@/lib/format";
import { type Mode, setupHref, type TopicSummary } from "@/lib/practice";

type Phase = "ready" | "recording" | "uploading";
type Devices = "pending" | "ready" | "unavailable";

type Props = { topic: TopicSummary; speakSeconds: number; mode: Mode };

/** How long the timer flashes at zero before it switches to counting overtime. */
const FLASH_MS = 3000;

// Preferred first; the browser's default is used if none are supported.
const MIME_CANDIDATES: Record<Mode, string[]> = {
  video: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"],
  audio: ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"],
};

function pickMimeType(mode: Mode): string | undefined {
  return MIME_CANDIDATES[mode].find((type) => MediaRecorder.isTypeSupported(type));
}

export function RecordSession({ topic, speakSeconds, mode }: Props) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("ready");
  const [devices, setDevices] = useState<Devices>("pending");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [deviceAttempt, setDeviceAttempt] = useState(0);

  // False during SSR and hydration, true afterwards. The <video> is only rendered once hydrated so
  // browser extensions that inject markup around videos (e.g. Video Speed Controller) can't cause a
  // hydration mismatch.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef(0);
  const finishedRef = useRef<{ blob: Blob; durationSeconds: number } | null>(null);

  // Open the devices this mode needs: camera and microphone for video, the microphone alone for audio.
  useEffect(() => {
    let cancelled = false;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      queueMicrotask(() => !cancelled && setDevices("unavailable"));
      return;
    }

    navigator.mediaDevices
      .getUserMedia(mode === "video" ? { video: true, audio: true } : { audio: true })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        setStream(stream);
        setDevices("ready");
      })
      .catch(() => !cancelled && setDevices("unavailable"));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
      // With cacheComponents, navigating away hides the page rather than unmounting it, so state survives
      // while this cleanup runs. Reset it so the stream is re-attached when the page returns.
      setDevices("pending");
    };
  }, [mode, deviceAttempt]);

  // Attach the stream once the <video> exists.
  useEffect(() => {
    if (hydrated && devices === "ready" && videoRef.current) videoRef.current.srcObject = streamRef.current;
  }, [hydrated, devices]);

  const upload = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      setPhase("uploading");
      setUploadError(null);
      try {
        const query = new URLSearchParams({ topicId: topic.id, durationSeconds: String(durationSeconds) });
        const res = await fetch(`/api/recordings?${query}`, {
          method: "POST",
          headers: { "Content-Type": blob.type || `${mode}/webm` },
          body: blob,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "The upload failed.");
        router.push(`/library/${data.id}`);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "The upload failed.");
      }
    },
    [router, topic.id, mode],
  );

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: pickMimeType(mode) });
    recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      finishedRef.current = { blob, durationSeconds };
      void upload(blob, durationSeconds);
    };

    recorderRef.current = recorder;
    finishedRef.current = null;
    startedAtRef.current = Date.now();
    setStartedAt(startedAtRef.current);
    recorder.start(1000);
    setPhase("recording");
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  const deviceNames = mode === "video" ? "camera and microphone" : "microphone";

  return (
    <div className="stack">
      <div className="card stack">
        {mode === "video" && hydrated && (
          <video
            ref={videoRef}
            className="preview"
            autoPlay
            muted
            playsInline
            hidden={devices !== "ready"}
          />
        )}
        {mode === "audio" && devices === "ready" && stream && <LevelMeter stream={stream} />}
        {devices === "pending" && <p className="muted">Waiting for {deviceNames} access…</p>}
        {devices === "unavailable" && (
          <div className="stack">
            <p className="error">
              Chittle needs {deviceNames} access to record. Allow access in your browser, then try again.
            </p>
            <div>
              <button onClick={() => (setDevices("pending"), setDeviceAttempt((n) => n + 1))}>Try again</button>
            </div>
          </div>
        )}
      </div>

      <div className="card stack">
        <p className="topic">{topic.text}</p>

        {phase === "ready" && <p className="muted">Speaking time: {formatDuration(speakSeconds)}</p>}

        {phase === "recording" && <SpeakingTimer startedAt={startedAt} speakSeconds={speakSeconds} />}

        {phase === "ready" && (
          <div className="row">
            <button className="primary" onClick={startRecording} disabled={devices !== "ready"}>
              Start recording
            </button>
            <Link href={setupHref("/practice", { topicId: topic.id, speakSeconds, mode })}>Change setup</Link>
          </div>
        )}

        {phase === "recording" && (
          <div>
            <button className="primary" onClick={stopRecording}>
              Stop and save
            </button>
          </div>
        )}

        {phase === "uploading" &&
          (uploadError ? (
            <>
              <p className="error">Couldn&apos;t save your recording. {uploadError}</p>
              <div className="row">
                <button
                  className="primary"
                  onClick={() => finishedRef.current && upload(finishedRef.current.blob, finishedRef.current.durationSeconds)}
                >
                  Try saving again
                </button>
              </div>
            </>
          ) : (
            <p>Saving your recording…</p>
          ))}
      </div>
    </div>
  );
}

/** A live input level for the microphone, so a muted or wrong input shows up before recording. */
function LevelMeter({ stream }: { stream: MediaStream }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (typeof AudioContext === "undefined") return;

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / samples.length);
      // Square root spreads out the quiet end, where speech mostly sits.
      setLevel(Math.min(100, Math.round(Math.sqrt(rms) * 100)));
    }, 100);

    return () => {
      clearInterval(timer);
      source.disconnect();
      void context.close();
    };
  }, [stream]);

  return (
    <div className="stack">
      <p className="muted">Microphone ready. Say something to check the level.</p>
      <div
        className="level-meter"
        role="meter"
        aria-label="Microphone level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={level}
      >
        <div className="level-meter-fill" style={{ width: `${level}%` }} />
      </div>
    </div>
  );
}

/**
 * Counts the speaking time down, then flashes at zero and counts the overtime. It never stops the
 * recording: the speaker decides when they've finished.
 */
function SpeakingTimer({ startedAt, speakSeconds }: { startedAt: number; speakSeconds: number }) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => clearInterval(timer);
  }, [startedAt]);

  const overMs = elapsedMs - speakSeconds * 1000;
  const flashing = overMs >= 0 && overMs < FLASH_MS;
  const overtime = overMs >= FLASH_MS;

  let display: string;
  if (overMs < 0) display = formatDuration(Math.ceil(-overMs / 1000));
  else if (flashing) display = formatDuration(0);
  else display = `+${formatDuration(Math.floor(overMs / 1000))}`;

  return (
    <>
      <p role="timer" className={["countdown", flashing && "flash", overtime && "overtime"].filter(Boolean).join(" ")}>
        <span className="rec-dot" aria-label="Recording" />
        {display}
      </p>
      {overMs >= 0 && <p className="muted">Time&apos;s up. Finish your point, then stop and save.</p>}
    </>
  );
}
