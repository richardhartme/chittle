"use client";

import { useEffect, useRef, useState } from "react";

import { formatDuration } from "@/lib/format";

const time = (seconds: number) => formatDuration(Math.floor(seconds));

const svg = { "aria-hidden": true, viewBox: "0 0 24 24", width: 20, height: 20 } as const;

/**
 * A player for an audio recording, in the app's own style rather than the browser's controls: play
 * and pause, a seek bar with the time, and mute with volume. Recorded WebM has no duration until it
 * has played through, so the stored duration stands in until the browser knows it.
 */
export function AudioPlayer({ src, durationSeconds }: { src: string; durationSeconds: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [knownDuration, setKnownDuration] = useState<number | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const duration = knownDuration ?? durationSeconds;
  const progress = duration > 0 ? Math.min(current / duration, 1) : 0;

  // The element's own events keep the controls in step, whichever way it was changed.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onDuration = () => setKnownDuration(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
    const onTime = () => setCurrent(el.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVolume = () => {
      setVolume(el.volume);
      setMuted(el.muted);
    };
    const events: [string, () => void][] = [
      ["loadedmetadata", onDuration],
      ["durationchange", onDuration],
      ["timeupdate", onTime],
      ["seeked", onTime],
      ["play", onPlay],
      ["pause", onPause],
      ["ended", onPause],
      ["volumechange", onVolume],
    ];
    for (const [type, listener] of events) el.addEventListener(type, listener);
    onDuration();
    return () => {
      for (const [type, listener] of events) el.removeEventListener(type, listener);
    };
  }, []);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const seek = (seconds: number) => {
    const el = audio.current;
    if (!el) return;
    el.currentTime = seconds;
    setCurrent(seconds);
  };

  const changeVolume = (value: number) => {
    const el = audio.current;
    if (!el) return;
    el.volume = value;
    el.muted = value === 0;
  };

  const silent = muted || volume === 0;

  return (
    <div className="card audio-player">
      <audio ref={audio} preload="metadata" src={src} />

      <button type="button" className="primary audio-play" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>
        {playing ? (
          <svg {...svg}>
            <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg {...svg}>
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
          </svg>
        )}
      </button>

      <input
        type="range"
        className="audio-range audio-seek"
        aria-label="Seek"
        aria-valuetext={`${time(current)} of ${time(duration)}`}
        min={0}
        max={duration}
        step={0.1}
        value={Math.min(current, duration)}
        style={{ "--fill": `${progress * 100}%` } as React.CSSProperties}
        onChange={(e) => seek(Number(e.target.value))}
      />

      <span className="audio-time">
        {time(current)} / {time(duration)}
      </span>

      <button
        type="button"
        className="audio-mute"
        aria-label={silent ? "Unmute" : "Mute"}
        onClick={() => {
          const el = audio.current;
          if (!el) return;
          if (silent) {
            el.muted = false;
            if (el.volume === 0) el.volume = 1;
          } else {
            el.muted = true;
          }
        }}
      >
        <svg {...svg}>
          <path d="M4 9h4l5-4v14l-5-4H4Z" fill="currentColor" />
          {silent ? (
            <path d="m16 9 5 6M21 9l-5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
      </button>

      <input
        type="range"
        className="audio-range audio-volume"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.05}
        value={silent ? 0 : volume}
        style={{ "--fill": `${(silent ? 0 : volume) * 100}%` } as React.CSSProperties}
        onChange={(e) => changeVolume(Number(e.target.value))}
      />
    </div>
  );
}
