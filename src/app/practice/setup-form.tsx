"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { clampSpeakSeconds, isMode, type Mode, SPEAK_SECONDS, setupHref, type TopicSummary } from "@/lib/practice";


/** A setup to start from, e.g. when coming back from the record page. Every field is optional. */
export type InitialSetup = { category?: string; topic?: TopicSummary; speakSeconds?: number; mode?: Mode };

type Props = { categories: { slug: string; name: string }[]; initial?: InitialSetup };

const MODE_KEY = "chittle:practice-mode";

// The last mode chosen in this browser. Storage can be unavailable (private windows, blocked site
// data), so every access is guarded and the form falls back to video.
function readStoredMode(): Mode | null {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return isMode(value) ? value : null;
  } catch {
    return null;
  }
}

function storeMode(mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Not remembered; the choice still applies to this session.
  }
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "video", label: "Video and audio" },
  { value: "audio", label: "Audio only" },
];

export function SetupForm({ categories, initial = {} }: Props) {
  const router = useRouter();

  const [category, setCategory] = useState(initial.category ?? categories[0]?.slug ?? "");
  const [topic, setTopic] = useState<TopicSummary | null>(initial.topic ?? null);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [categoryTopics, setCategoryTopics] = useState<TopicSummary[]>([]);
  const [topicsRefresh, setTopicsRefresh] = useState(0);
  const [speakSeconds, setSpeakSeconds] = useState<number>(initial.speakSeconds ?? SPEAK_SECONDS.default);
  // The mode given in the setup wins over the one remembered in this browser.
  const [chosenMode, setChosenMode] = useState<Mode | null>(initial.mode ?? null);
  const storedMode = useSyncExternalStore(subscribeToStorage, readStoredMode, () => null);
  const mode = chosenMode ?? storedMode ?? "video";

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

  function continueToRecord() {
    if (!topic) return;
    const setup = { topicId: topic.id, speakSeconds, mode };
    // Save the setup in this page's history entry, so going back restores it even after a reload.
    window.history.replaceState(null, "", setupHref("/practice", setup));
    router.push(setupHref("/practice/record", setup));
  }

  return (
    <div className="card stack">
      {/* What to speak about: the category, then a topic from it or a random one. */}
      <div className="row topic-pickers">
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
        {categoryTopics.length > 0 && (
          <label className="topic-picker">
            Topic
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
      </div>
      <div className="row">
        <button onClick={() => fetchTopic()} disabled={loadingTopic || !category}>
          {loadingTopic ? "Finding a topic…" : topic ? "Get another topic" : "Get a random topic"}
        </button>
      </div>

      {topic ? (
        <p className="topic">{topic.text}</p>
      ) : (
        <p className="muted">Choose a topic from the list, or get a random one.</p>
      )}
      {topicError && <p className="error">{topicError}</p>}

      {/* How to record it. */}
      <div className="row setup-options">
        <label>
          Speaking time (seconds)
          <input
            type="number"
            min={SPEAK_SECONDS.min}
            max={SPEAK_SECONDS.max}
            value={speakSeconds}
            onChange={(event) => setSpeakSeconds(clampSpeakSeconds(event.target.valueAsNumber))}
          />
        </label>
        <fieldset className="choices">
          <legend>Record</legend>
          {MODE_OPTIONS.map((option) => (
            <label key={option.value} className="choice">
              <input
                type="radio"
                name="mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => (setChosenMode(option.value), storeMode(option.value))}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="row">
        <button className="primary" onClick={continueToRecord} disabled={!topic || loadingTopic}>
          Continue
        </button>
      </div>
    </div>
  );
}
