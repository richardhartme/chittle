# Chittle — Product & Technical Spec

A web app for practising speaking. Users pick a topic category, get a random topic, and record themselves speaking on video. Recordings are saved to a private library where they can be replayed and self-rated.

## Audience

General self-improvers and professionals (interview, presentation and public-speaking prep).

## Core user flow

1. User signs in with a magic link.
2. User picks a **category** (e.g. Interview, Everyday, Opinion, Storytelling, Work).
3. The app serves a random **topic** from that category. The user can **re-roll** as often as they like (no cap).
4. User sets their own **prep duration** and **speaking duration** (fully user-controlled).
5. After prep, the app records **video (with audio)** from the browser. Recording is always video.
6. The recording is uploaded and saved to the user's private library.
7. User can replay, delete, and **rate** the recording.

## Features (v1)

### Topics
- Two sources, both organised by category:
  - **Predefined** topics/questions, seeded into the database (e.g. Interview → "Tell me about yourself").
  - **AI-generated** topics, produced on demand by the Claude API (small, cheap model).
- Each user's **seen topics are tracked**; picking and generation exclude topics the user has already seen, so topics don't repeat.
- Re-roll is unlimited. (Each re-roll may invoke the LLM, so cost scales with usage; a cap can be added later.)

### Recording
- Always video with audio, via `MediaRecorder`; camera preview shown before recording.
- Store whatever format the browser produces (WebM on Chrome/Firefox, MP4 on Safari) and record its MIME type. Transcoding is out of scope for v1.
- No limits on recording length or storage in v1.

### Library
- Private list of the user's recordings with topic, date and duration.
- Playback and delete. Deleting removes the file from disk **and** the database row.

### Self-assessment
Each recording can be rated 1–5 on each criterion, plus a free-text note:
- Clarity
- Confidence
- Structure
- Pacing
- Body language

### Authentication
- Passwordless **magic link** by email.
- In development, magic links are logged to the console. In production, sent through Resend.
- Sessions stored in the database, delivered via an HTTP-only cookie.

### Account
- Deleting an account removes all of the user's data and recording files.

## Out of scope for v1 (planned later)
- AI feedback: transcription, filler words, pace, clarity analysis.
- Sharing recordings with coaches/friends.
- Transcoding to a single format.
- Cloud object storage (S3/R2).
- Usage limits, quotas, payments.
- Mobile-optimised experience (desktop web first, free).

The data model and storage layer are designed so the "later" items can be added without rework.

## Technical design

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router), TypeScript, full-stack |
| UI | React |
| Database | Postgres from the start |
| ORM | Drizzle ORM with SQL migrations |
| Auth | Custom magic link + DB-backed sessions |
| Email | Console in dev, Resend in production |
| Topics LLM | Claude API (small model) |
| File storage | Local disk behind a `Storage` interface (swap for S3/R2 later) |

### Data model

- `users` — id, email (unique), created_at
- `magic_links` — id, user_id/email, token_hash, expires_at, consumed_at
- `sessions` — id, user_id, token_hash, expires_at
- `categories` — id, slug, name
- `topics` — id, category_id, text, source (`predefined` | `generated`), created_at; text unique per category
- `user_seen_topics` — user_id, topic_id, seen_at (PK on both)
- `recordings` — id, user_id, topic_id, storage_key, mime_type, size_bytes, duration_seconds, prep_seconds, created_at
- `recording_ratings` — recording_id (PK), clarity, confidence, structure, pacing, body_language (1–5), note, updated_at

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
- `/practice` — category pick, topic, timers, recording
- `/library` — list of recordings; `/library/[id]` — playback and rating
- `POST /api/recordings` — upload (raw video body, metadata in the query string); `GET /api/recordings/[id]/file` — authenticated stream with byte-range support; `DELETE /api/recordings/[id]`
- `POST /api/topics/next` — returns an unseen topic for a category (predefined first, then generated)

### Topic selection

1. Choose a random predefined topic in the category the user hasn't seen.
2. If none remain, generate new topics with the Claude API (given the category and the user's/known existing topics to avoid duplicates), store them, and serve one.
3. Mark the served topic as seen for the user.

### Privacy
- All recordings are private to their owner.
- Deleting a recording or account deletes the associated files from disk.

## Known limitations
- MediaRecorder WebM from Chrome/Firefox has no duration header, so the player can't show a total duration or seek until recordings are transcoded/remuxed (already planned).
- Magic-link requests aren't rate limited yet.
- Topic generation happens inline in the request that needs it, so the first user to exhaust a category waits on the LLM call.
