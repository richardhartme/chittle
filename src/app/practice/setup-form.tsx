"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  CUSTOM_TOPIC_LENGTH,
  clampSpeakSeconds,
  isMode,
  type Mode,
  SPEAK_SECONDS,
  setupHref,
  type TopicSummary,
} from "@/lib/practice";


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
  const [customTopics, setCustomTopics] = useState<TopicSummary[]>([]);
  const [topicsRefresh, setTopicsRefresh] = useState(0);
  // Writing a custom topic: whether the field is open, what's in it, and whether it's being saved.
  const [writing, setWriting] = useState(false);
  const [customText, setCustomText] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);
  const busy = loadingTopic || savingTopic;
  const [speakSeconds, setSpeakSeconds] = useState<number>(initial.speakSeconds ?? SPEAK_SECONDS.default);
  // The mode given in the setup wins over the one remembered in this browser.
  const [chosenMode, setChosenMode] = useState<Mode | null>(initial.mode ?? null);
  const storedMode = useSyncExternalStore(subscribeToStorage, readStoredMode, () => null);
  const mode = chosenMode ?? storedMode ?? "video";

  // Load the topics the user can choose from: the shared ones and their own custom ones. Refreshed
  // after a roll, which may generate new ones.
  useEffect(() => {
    let cancelled = false;
    if (!category) return;

    const show = (data: { topics?: TopicSummary[]; customTopics?: TopicSummary[] }) => {
      if (cancelled) return;
      setCategoryTopics(data.topics ?? []);
      setCustomTopics(data.customTopics ?? []);
    };
    fetch(`/api/topics?${new URLSearchParams({ category })}`)
      .then((res) => (res.ok ? res.json() : {}))
      .then(show)
      .catch(() => show({}));

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

  // Saves what the user wrote as a custom topic in the chosen category, then uses it.
  async function saveCustomTopic() {
    setSavingTopic(true);
    setTopicError(null);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, text: customText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTopicError(data.error ?? "Couldn't save your topic.");
        return;
      }
      setTopic(data.topic);
      setCustomTopics((current) => [data.topic, ...current]);
      closeWriter();
    } catch {
      setTopicError("Couldn't save your topic. Check your connection and try again.");
    } finally {
      setSavingTopic(false);
    }
  }

  function closeWriter() {
    setWriting(false);
    setCustomText("");
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
        {(categoryTopics.length > 0 || customTopics.length > 0) && (
          <label className="topic-picker">
            Topic
            <select
              value={topic?.id ?? ""}
              disabled={busy}
              onChange={(event) => event.target.value && fetchTopic(event.target.value)}
            >
              <option value="" disabled>
                Choose a topic…
              </option>
              {/* The user's own topics come first, grouped, once they have any in this category. */}
              {customTopics.length > 0 ? (
                <>
                  <optgroup label="Your topics">{topicOptions(customTopics)}</optgroup>
                  {categoryTopics.length > 0 && <optgroup label="All topics">{topicOptions(categoryTopics)}</optgroup>}
                </>
              ) : (
                topicOptions(categoryTopics)
              )}
            </select>
          </label>
        )}
      </div>
      <div className="row">
        <button onClick={() => fetchTopic()} disabled={busy || !category}>
          {loadingTopic ? "Finding a topic…" : topic ? "Get another topic" : "Get a random topic"}
        </button>
        {!writing && (
          <button onClick={() => (setWriting(true), setTopicError(null))} disabled={busy || !category}>
            Write your own topic
          </button>
        )}
      </div>

      {writing && (
        <form
          className="stack"
          onSubmit={(event) => (event.preventDefault(), saveCustomTopic())}
        >
          <label>
            Your topic
            <input
              type="text"
              value={customText}
              maxLength={CUSTOM_TOPIC_LENGTH.max}
              placeholder="Describe a time you changed your mind"
              autoFocus
              onChange={(event) => setCustomText(event.target.value)}
            />
          </label>
          <div className="row">
            <button type="submit" disabled={busy || customText.trim().length < CUSTOM_TOPIC_LENGTH.min}>
              {savingTopic ? "Saving…" : "Use this topic"}
            </button>
            <button type="button" className="link-button" onClick={closeWriter}>
              Cancel
            </button>
          </div>
        </form>
      )}

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
        <button className="primary" onClick={continueToRecord} disabled={!topic || busy}>
          Continue
        </button>
      </div>
    </div>
  );
}

function topicOptions(topics: TopicSummary[]) {
  return topics.map((t) => (
    <option key={t.id} value={t.id}>
      {t.text}
    </option>
  ));
}
