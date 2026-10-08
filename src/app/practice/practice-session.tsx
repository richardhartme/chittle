"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatDuration } from "@/lib/format";

type Topic = { id: string; text: string };
type Phase = "setup" | "prep" | "recording" | "uploading";
type Camera = "pending" | "ready" | "unavailable";

type Props = { categories: { slug: string; name: string }[] };

// Preferred first; the browser's default is used if none are supported.
const MIME_CANDIDATES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

function pickMimeType(): string | undefined {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function PracticeSession({ categories }: Props) {
  const router = useRouter();

  const [category, setCategory] = useState(categories[0]?.slug ?? "");
  const [topic, setTopic] = useState<Topic | null>(null);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [categoryTopics, setCategoryTopics] = useState<Topic[]>([]);
  const [topicsRefresh, setTopicsRefresh] = useState(0);

  const [prepSeconds, setPrepSeconds] = useState(30);
  const [speakSeconds, setSpeakSeconds] = useState(120);

  const [phase, setPhase] = useState<Phase>("setup");
  const [remaining, setRemaining] = useState(0);
  const [camera, setCamera] = useState<Camera>("pending");
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
  // Captured when a session starts, so later edits to the form can't change what gets saved.
  const sessionRef = useRef<{ topicId: string; prepSeconds: number } | null>(null);
  const startedAtRef = useRef(0);
  const finishedRef = useRef<{ blob: Blob; durationSeconds: number } | null>(null);

  // Open the camera and microphone for the live preview.
  useEffect(() => {
    let cancelled = false;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      queueMicrotask(() => !cancelled && setCamera("unavailable"));
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        setCamera("ready");
      })
      .catch(() => !cancelled && setCamera("unavailable"));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      // With cacheComponents, navigating away hides the page rather than unmounting it, so state survives
      // while this cleanup runs. Reset it so the stream is re-attached to the <video> when the page returns.
      setCamera("pending");
    };
  }, [cameraAttempt]);

  // Attach the stream once the <video> exists.
  useEffect(() => {
    if (hydrated && camera === "ready" && videoRef.current) videoRef.current.srcObject = streamRef.current;
  }, [hydrated, camera]);

  // Load the topics the user can choose from. Refreshed after a roll, which may generate new ones.
  useEffect(() => {
    let cancelled = false;
    if (!category) return;

    fetch(`/api/topics?${new URLSearchParams({ category })}`)
      .then((res) => (res.ok ? res.json() : { topics: [] }))
      .then((data) => !cancelled && setCategoryTopics(data.topics))
      .catch(() => !cancelled && setCategoryTopics([]));

    return () => {
      cancelled = true;
    };
  }, [category, topicsRefresh]);

  async function fetchTopic(topicId?: string) {
    setLoadingTopic(true);
    setTopicError(null);
    try {
      const res = await fetch("/api/topics/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, topicId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTopicError(data.error ?? "Couldn't get a topic.");
        return;
      }
      setTopic(data.topic);
      if (!topicId) setTopicsRefresh((n) => n + 1);
    } catch {
      setTopicError("Couldn't get a topic. Check your connection and try again.");
    } finally {
      setLoadingTopic(false);
    }
  }

  const upload = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      const session = sessionRef.current;
      if (!session) return;

      setPhase("uploading");
      setUploadError(null);
      try {
        const query = new URLSearchParams({
          topicId: session.topicId,
          durationSeconds: String(durationSeconds),
          prepSeconds: String(session.prepSeconds),
        });
        const res = await fetch(`/api/recordings?${query}`, {
          method: "POST",
          headers: { "Content-Type": blob.type || "video/webm" },
          body: blob,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        router.push(`/library/${data.id}`);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      }
    },
    [router],
  );

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
    recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      finishedRef.current = { blob, durationSeconds };
      void upload(blob, durationSeconds);
    };

    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    recorder.start(1000);
    setPhase("recording");
  }, [upload]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  // Drives the prep and speaking countdowns.
  useEffect(() => {
    if (phase !== "prep" && phase !== "recording") return;

    const total = phase === "prep" ? prepSeconds : speakSeconds;
    const deadline = Date.now() + total * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left > 0) return;
      clearInterval(timer);
      if (phase === "prep") startRecording();
      else stopRecording();
    };
    const timer = setInterval(tick, 250);
    queueMicrotask(tick);
    return () => clearInterval(timer);
  }, [phase, prepSeconds, speakSeconds, startRecording, stopRecording]);

  function begin() {
    if (!topic) return;
    sessionRef.current = { topicId: topic.id, prepSeconds };
    finishedRef.current = null;
    if (prepSeconds > 0) setPhase("prep");
    else startRecording();
  }

  const busy = phase !== "setup";
  const canStart = Boolean(topic) && camera === "ready" && !loadingTopic;

  return (
    <div className="stack">
      <div className="card stack">
        {hydrated && (
          <video
            ref={videoRef}
            className="preview"
            autoPlay
            muted
            playsInline
            hidden={camera !== "ready"}
          />
        )}
        {camera === "pending" && (
          <p className="muted">Waiting for camera and microphone access…</p>
        )}
        {camera === "unavailable" && (
          <div className="stack">
            <p className="error">
              Chittle needs camera and microphone access to record. Allow access in your browser, then try again.
            </p>
            <div>
              <button onClick={() => (setCamera("pending"), setCameraAttempt((n) => n + 1))}>Try again</button>
            </div>
          </div>
        )}
      </div>

      {phase === "setup" && (
        <div className="card stack">
          <div className="row">
            <label>
              Category
              <select
                value={category}
                onChange={(event) => (setCategory(event.target.value), setTopic(null), setTopicError(null))}
              >
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Prep time (seconds)
              <input
                type="number"
                min={0}
                max={600}
                value={prepSeconds}
                onChange={(event) => setPrepSeconds(clamp(event.target.valueAsNumber, 0, 600))}
              />
            </label>
            <label>
              Speaking time (seconds)
              <input
                type="number"
                min={10}
                max={3600}
                value={speakSeconds}
                onChange={(event) => setSpeakSeconds(clamp(event.target.valueAsNumber, 10, 3600))}
              />
            </label>
          </div>

          {topic ? (
            <p className="topic">{topic.text}</p>
          ) : (
            <p className="muted">Choose a category and get a topic to speak about.</p>
          )}
          {topicError && <p className="error">{topicError}</p>}

          {categoryTopics.length > 0 && (
            <label>
              Or choose an existing topic
              <select
                value={topic?.id ?? ""}
                disabled={loadingTopic}
                onChange={(event) => event.target.value && fetchTopic(event.target.value)}
              >
                <option value="" disabled>
                  Choose a topic…
                </option>
                {categoryTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.text}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="row">
            <button onClick={() => fetchTopic()} disabled={loadingTopic || !category}>
              {loadingTopic ? "Finding a topic…" : topic ? "Re-roll topic" : "Get a topic"}
            </button>
            <button className="primary" onClick={begin} disabled={!canStart}>
              Start
            </button>
          </div>
        </div>
      )}

      {phase === "prep" && topic && (
        <div className="card stack">
          <p className="muted">Get ready. Recording starts when the timer ends.</p>
          <p className="topic">{topic.text}</p>
          <p className="countdown">{formatDuration(remaining)}</p>
          <div>
            <button className="primary" onClick={startRecording}>
              Start now
            </button>
          </div>
        </div>
      )}

      {phase === "recording" && topic && (
        <div className="card stack">
          <p className="topic">{topic.text}</p>
          <p className="countdown">
            <span className="rec-dot" aria-label="Recording" />
            {formatDuration(remaining)}
          </p>
          <div>
            <button className="primary" onClick={stopRecording}>
              Stop and save
            </button>
          </div>
        </div>
      )}

      {phase === "uploading" && (
        <div className="card stack">
          {uploadError ? (
            <>
              <p className="error">Couldn&apos;t save your recording: {uploadError}</p>
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
          )}
        </div>
      )}

      {busy && phase !== "uploading" && <p className="muted">Speak naturally. You can stop at any time.</p>}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
