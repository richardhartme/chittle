# Chittle — Product & Technical Spec

A web app for practising speaking. Users pick a topic category, get a random topic, and record themselves speaking on video or audio only. Each recording is saved to a private library and **assessed automatically**: it's transcribed, scored out of 1000 across six dimensions, and given written coaching feedback. A dashboard tracks scores over time.

Terms used here are defined in [GLOSSARY.md](GLOSSARY.md). Key decisions are in [docs/adr](docs/adr).

## Audience

General self-improvers and professionals (interview, presentation and public-speaking prep).

## Core user flow

1. User signs in with a magic link.
2. User picks a **category** (e.g. Interview, Everyday, Opinion, Storytelling, Work).
3. The app serves a random **topic** from that category. The user can **re-roll** as often as they like (no cap).
4. User sets their **speaking duration** and chooses to record **video and audio** or **audio only**, then continues to the record page. Setup never turns on the camera or microphone.
5. The record page asks only for the devices the chosen mode needs and shows a camera preview or a microphone level meter. The user prepares for as long as they like, then presses **Start recording**.
6. While recording, the speaking time counts down. At zero it flashes, then counts the overtime. It never stops the recording: the user stops when they've finished.
7. The recording is uploaded and saved to the user's private library, and the user lands on its results page.
8. If the user has entered their provider keys, the recording is **assessed in the background**. The results page shows "Analysing…" and fills in when it's done.
9. User reviews the score, feedback and coach insights, then can **practise the same topic again** to improve on it.

## Features

### Topics
- Two sources, both organised by category:
  - **Predefined** topics/questions, seeded into the database (e.g. Interview → "Tell me about yourself").
  - **AI-generated** topics, produced on demand by the Claude API (small, cheap model) using the **server's** API key.
- Each user's **seen topics are tracked**; picking and generation exclude topics the user has already seen, so topics don't repeat.
- Re-roll is unlimited. (Each re-roll may invoke the LLM, so cost scales with usage; a cap can be added later.)
- Each category has a **framework** that answers are judged against:

| Category | Framework |
| --- | --- |
| Interview | STAR: Situation, Task, Action, Result |
| Opinion | PREP: Point, Reason, Example, Point restated |
| Everyday life | PREP |
| Storytelling | Story arc: Setup, Conflict, Turning point, Resolution, Lesson |
| Work & presentations | What / So what / Now what |

### Recording
- Two modes, chosen on the setup page: **video and audio**, or **audio only**. The setup page remembers the last choice in the browser (`localStorage`); a mode in the URL takes priority.
- Recorded via `MediaRecorder`. Video mode shows a camera preview before and during recording; audio-only mode asks for the microphone alone and shows a live level meter.
- There's no prep timer: preparation is however long the user waits before pressing Start recording.
- The speaking time counts down, flashes at zero, then shows the overtime (e.g. "+0:23"). It never cuts the speaker off; the alert is visual only, so nothing is added to the recording.
- Store whatever format the browser produces (WebM on Chrome/Firefox, MP4 on Safari, for both video and audio) and record its MIME type. Whether a recording is audio only or video is derived from that MIME type. Transcoding is out of scope.
- No limits on recording length or storage.

### Library
- Private list of the user's recordings with topic, date, duration, an Audio or Video label and the score once assessed.
- Audio-only recordings play in an audio player.
- Playback and delete. Deleting removes the file from disk **and** the database rows, including the transcript and assessment.

### Provider keys
- Assessment runs on the user's own **Deepgram** key (transcription) and **Anthropic** key (scoring and feedback), entered on the Account page. There's no fallback to server keys ([ADR 0002](docs/adr/0002-per-user-provider-keys.md)).
- Keys are checked with a test call when saved, stored encrypted (AES-256-GCM under `ENCRYPTION_KEY`), shown only masked (last four characters), and can be replaced or removed.

### Assessment
How a recording is assessed is described in [ADR 0001](docs/adr/0001-deepgram-transcripts-and-hybrid-scoring.md) and [ADR 0003](docs/adr/0003-assessments-run-in-after-with-stale-recovery.md).

**Pipeline**
1. After upload, if the user has both keys, an assessment starts in the background (`after()`).
2. **Transcribe**: the stored file is sent to Deepgram (Nova-3, English, filler words kept, punctuation on). The transcript, with every word's timing and confidence, is stored.
3. **Measure**: code calculates the measured dimensions and statistics from the words.
4. **Judge**: Claude (`claude-opus-5-5`, fixed) receives the transcript, the topic, the category's framework, the measured metrics and the user's recent focus votes. It returns structured JSON: the judged dimension scores, all feedback text, the overview, strengths, areas to improve, coach insights and the ideal version. Feedback is in British English, and accent never lowers a score.
5. **Store** the assessment with its scoring version, then refresh the user's progress insight.

**Status**: pending, done or failed. A pending assessment older than about 5 minutes counts as failed. Failed assessments show the error and a **Retry** button. Unassessed recordings (no keys, or recorded before assessment existed) show an **Assess** button, or a link to the Account page when keys are missing. Done assessments offer **Re-assess**, which re-runs the judging step on the stored transcript and replaces the result.

**Score (out of 1000)**

| Dimension | Max | Sub-scores | Source |
| --- | --- | --- | --- |
| Structure | 250 | Logical sequence, Transitions, Signposting, Opening quality, Closing quality (50 each) | Claude |
| Conciseness | 200 | Word choice 70, Word economy 70, Sentence length 60 | Claude |
| Confidence | 150 | Hedging frequency 75, Assertiveness 75 | Claude |
| Pronunciation | 150 | Pronunciation clarity 150 | Code (Deepgram word confidence) |
| Filler rate | 150 | Filler frequency 150 | Code |
| Pace | 100 | Pause timing 50, Words per minute 50 | Code |

Structure is judged against the category's framework. Uptalk isn't scored (it needs pitch analysis, which is a future enhancement).

**Statistics shown alongside the scores**
- Conciseness: words, sentences, average sentence length (with a ≤20 / 21–30 / >30 band), long sentences, redundant phrases.
- Confidence: hedge total, hedges per minute, duration, and a breakdown by hedge phrase.
- Filler rate: filler total, fillers per minute, duration, and a breakdown by filler word.
- Pronunciation: clarity percentage and the number of flagged (unclear) words.
- Pace: average WPM, standard deviation, range, WPM over time, and Active, Baseline and Overall WPM on banded scales. Active and Baseline bands are <140, 140–180, 180–220 (ideal), 220–260, >260. Overall bands are <100, 100–130, 130–160 (ideal), 160–190, >190. Also a pace-variation chart of each stretch of speech against the baseline, with rush and drag thresholds.

**Feedback**
- Each dimension has a summary paragraph, and each sub-score has its own feedback.
- **Overview**, **strengths** and **areas to improve**. Each area to improve takes a **focus vote** (thumbs up: "I want to work on this", thumbs down: "not useful"). Votes are given to later assessments and to the progress insight.
- **Coach insights**: "How you said it" (the answer's points in the order spoken) against a "Better order" with an explanation, "Try opening with", and "Shorter ways to say it" (original sentence, shorter version, words saved).
- **Ideal version**: the user's answer rewritten in the category's framework, one section per framework step.

### Results page (`/library/[id]`)
- Player, score composition bar (each dimension's share of 1000), six dimension cards, overview, strengths, areas to improve, and the transcript as plain text.
- Clicking a dimension card opens a drawer (native `<dialog>`) with its sub-scores, "View feedback" toggles, statistics and charts. A "Coach insights" button opens a drawer with the coach insights and the ideal version.
- **Practise again** opens setup with the same topic, speaking time and mode filled in. When the speaker has an earlier assessed recording of the topic, the results show its score and the change beside the total (linking to it), and each dimension card shows its change. A Home button sits beside it.
- Re-assess, Retry or Assess as described above, and Delete.

### Dashboard (signed-in home, `/`)
- Average score and a stacked bar chart of recent scores by dimension, filterable by dimension (all, or one) and range (last 7, last 30 or all practices).
- The **progress insight**: a coaching observation across the user's last ~10 assessments, which takes their focus votes into account. It's regenerated after each assessment and stored, so the dashboard never waits on Claude.
- A prominent link to practise.

### Authentication
- Passwordless **magic link** by email.
- In development, magic links are logged to the console. In production, sent through Resend.
- Sessions stored in the database, delivered via an HTTP-only cookie.

### Account
- Provider keys (see above).
- Deleting an account removes all of the user's data, keys and recording files.

## Out of scope (planned later)
- Uptalk detection (pitch analysis of the audio).
- Body language or any analysis of the video picture.
- Sharing recordings or results with coaches/friends.
- Streaks, XP or other gamification.
- Languages other than English.
- Transcoding to a single format.
- Cloud object storage (S3/R2).
- Usage limits, quotas, payments.
- Mobile-optimised experience (desktop web first, free).

## Technical design

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router), TypeScript, full-stack |
| UI | React; charts are hand-built SVG |
| Database | Postgres from the start |
| ORM | Drizzle ORM with SQL migrations |
| Auth | Custom magic link + DB-backed sessions |
| Email | Console in dev, Resend in production |
| Topics LLM | Claude API (small model, server key) |
| Transcription | Deepgram Nova-3 (user's key) |
| Assessment LLM | Claude API, `claude-opus-5-5`, structured outputs (user's key) |
| Background work | Next `after()` with stale-pending recovery |
| File storage | Local disk behind a `Storage` interface (swap for S3/R2 later) |

### Data model

- `users` — id, email (unique), created_at
- `magic_links` — id, user_id/email, token_hash, expires_at, consumed_at
- `sessions` — id, user_id, token_hash, expires_at
- `categories` — id, slug, name, framework (`star` | `prep` | `story_arc` | `what_so_what_now_what`)
- `topics` — id, category_id, text, source (`predefined` | `generated`), created_at; text unique per category
- `user_seen_topics` — user_id, topic_id, seen_at (PK on both)
- `recordings` — id, user_id, topic_id, storage_key, mime_type, size_bytes, duration_seconds, created_at
- `provider_keys` — user_id, provider (`deepgram` | `anthropic`), encrypted_key, key_hint, updated_at (PK on user_id and provider)
- `transcripts` — recording_id (PK), text, words (JSON: word, punctuated word, start, end, confidence), audio_seconds, created_at
- `assessments` — recording_id (PK), status (`pending` | `done` | `failed`), started_at, completed_at, error, scoring_version, total_score, one score column per dimension, result (JSON: sub-scores, feedback, statistics, coach insights, ideal version)
- `focus_votes` — id, user_id, recording_id, area (the area-to-improve text), vote (`up` | `down`), created_at; unique on recording_id and area
- `progress_insights` — user_id (PK), text, generated_at

All rows referencing a recording or user cascade on delete.

### Storage interface

```ts
interface Storage {
  put(key: string, data: ReadableStream<Uint8Array>): Promise<number>; // returns bytes stored
  get(key: string, range?: { start: number; end?: number }): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>; // e.g. all of a user's files
}
```

The local-disk implementation writes under a configurable directory outside the web root. Recordings are only served through an authenticated route that checks ownership.

### Key routes

- `/login`, `/auth/verify` — magic link request and consumption
- `/` — landing page when signed out; dashboard when signed in
- `/practice` — setup: category, topic, speaking time and mode. Reads `topic`, `speak` and `mode` from the query to prefill when coming back from the record page or from Practise again.
- `/practice/record?topic=<id>&speak=<seconds>&mode=video|audio` — device access, preview or level meter, recording and upload. Redirects to `/practice` if the topic is missing or unknown; the speaking time is clamped to 10–3600 seconds and the mode defaults to video.
- `/library` — list of recordings; `/library/[id]` — results page
- `/account` — provider keys and account deletion
- `POST /api/recordings` — upload (raw audio or video body, `topicId` and `durationSeconds` in the query string), then starts an assessment; `GET /api/recordings/[id]/file` — authenticated stream with byte-range support; `DELETE /api/recordings/[id]`
- `GET /api/recordings/[id]/assessment` — the assessment's status, polled by the results page while pending
- `POST /api/topics/next` — returns an unseen topic for a category (predefined first, then generated)

### Topic selection

1. Choose a random predefined topic in the category the user hasn't seen.
2. If none remain, generate new topics with the Claude API (given the category and the user's/known existing topics to avoid duplicates), store them, and serve one.
3. Mark the served topic as seen for the user.

### Privacy
- All recordings, transcripts and assessments are private to their owner.
- Recordings are sent to Deepgram, and transcripts to Anthropic, under the user's own accounts with those providers.
- Deleting a recording or account deletes the associated files from disk.

## Known limitations
- MediaRecorder WebM (video or audio) from Chrome/Firefox has no duration header, so the player can't show a total duration or seek until recordings are transcoded/remuxed (already planned).
- Magic-link requests aren't rate limited yet.
- Topic generation happens inline in the request that needs it, so the first user to exhaust a category waits on the LLM call.
- An assessment interrupted by a restart isn't resumed; it shows as failed after about 5 minutes and must be retried.
- Pronunciation is approximated from transcription confidence, not judged from the sound.
