# Chittle

Chittle is a web app for practising impromptu speaking. You pick a topic category, get a random topic and record your answer on video or as audio only. The app transcribes the recording and scores it out of 1000 across six dimensions, with feedback and a rewrite of your answer.

- [SPEC.md](SPEC.md) is the product and technical spec.
- [GLOSSARY.md](GLOSSARY.md) defines the terms the code and docs use, such as speaker, dimension and retake.
- [docs/adr](docs/adr) records the design decisions.

Chittle is built with Next.js App Router, TypeScript, Postgres with Drizzle ORM, Deepgram for transcripts and the Claude API for topics and assessment.

## Getting started

```bash
cp .env.example .env        # then adjust if needed
# set ENCRYPTION_KEY in .env to the output of: openssl rand -base64 32
docker compose up -d        # Postgres on localhost:5433
npm install
npm run db:setup            # apply migrations and seed categories/topics
npm run dev                 # http://localhost:3000
```

Sign-in is by magic link. Without `RESEND_API_KEY`, the dev server prints links to its console. Request one on `/login` and open the URL it logs.

Without `ANTHROPIC_API_KEY`, the app serves only the predefined topics. Once a speaker has seen them all in a category, the app tells them no new topics are available. With a key set, the app generates new topics and stores them for everyone.

Assessment runs on each speaker's own Deepgram and Anthropic keys, which they save on the Account page. The app checks each key with a test call and encrypts it at rest under `ENCRYPTION_KEY`, so set `ENCRYPTION_KEY` before saving any. Changing it later makes saved keys unreadable, and speakers would have to enter them again. There is no fallback to a server key ([ADR 0002](docs/adr/0002-per-user-provider-keys.md)).

Recording needs camera and microphone access, which browsers only grant on `localhost` or HTTPS.

## How assessment works

The app starts an assessment when a recording is uploaded, or when the speaker clicks Assess. It runs in Next's `after()` callback once the response has been sent ([ADR 0003](docs/adr/0003-assessments-run-in-after-with-stale-recovery.md)).

1. Deepgram transcribes the recording and keeps filler words, with each word's timing and confidence. The app stores the transcript.
2. Code measures Pace, Filler rate and Pronunciation from the transcript's words and timings.
3. Claude scores Structure, Conciseness and Confidence against the category's framework, such as STAR for Interview or PREP for Opinion. It also writes the overview, strengths and areas to improve. The speaker's 20 most recent focus votes go into this request.
4. A second Claude request, sent at the same time, writes the coach insights. These include a better order for the answer, shorter ways to say long sentences and the ideal version.
5. Once the assessment is stored, Claude rewrites the speaker's progress insight from their recent assessments. The dashboard shows it after two scored assessments.

[ADR 0001](docs/adr/0001-deepgram-transcripts-and-hybrid-scoring.md) explains why code scores the measured dimensions and Claude scores only the judged ones.

From a recording's results page, a speaker can:

- re-assess it from the stored transcript, which calls only Claude,
- retry an assessment that failed, or one still pending after about 5 minutes,
- retake the topic and compare the new score with the previous attempt,
- vote on each area to improve.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Build for production |
| `npm start` | Serve the production build |
| `npm run db:generate` | Generate a SQL migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Upsert categories and predefined topics. Safe to re-run. |
| `npm run db:setup` | Apply migrations, then seed |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Re-run affected tests on change |
| `npm run test:coverage` | Run the suite with a coverage report in `coverage/` |
| `npm run lint` | Run ESLint |

## Layout

- `src/app` holds routes, server actions in `actions.ts` and API route handlers in `api/`. `src/app/library/[id]` is the results page.
- `src/components` holds components shared across pages, such as the site navigation, theme button and progress insight card.
- `src/db` holds the Drizzle schema, client and seed data. Migrations live in `drizzle/`.
- `src/lib/assessment` holds the assessment pipeline: claiming, Deepgram transcription, measuring, Claude judging, scoring and status.
- `src/lib/progress-insight` builds and stores each speaker's progress insight.
- `src/lib/focus-votes` saves focus votes and reads the recent ones for later assessments.
- `src/lib/dashboard.ts` reads the score history for the dashboard, which is the signed-in home page. It filters by dimension and by the last 7, the last 30 or all recordings.
- `src/lib/frameworks.ts` defines the answer frameworks and their steps.
- `src/lib/auth` holds magic links, sessions and email sending.
- `src/lib/topics` handles topic selection, with no repeats per speaker, and Claude topic generation.
- `src/lib/provider-keys` checks speakers' Deepgram and Anthropic keys when saved. `src/lib/crypto.ts` encrypts them at rest.
- `src/lib/storage` defines the `Storage` interface and the local-disk implementation, which keeps recordings in `STORAGE_DIR`.

## Testing

`npm test` needs no Postgres, Docker or API keys. Database code runs against [PGlite](https://pglite.dev), an in-process Postgres, with the real migrations from `drizzle/` applied. Queries, constraints and cascades behave as they do in production.

- `src/test/db.ts` holds the PGlite database, `resetDb()` and row factories. Tests swap it in with `vi.mock("@/db", ...)`.
- `src/test/auth.ts` creates a user and signs them in.
- `src/test/keys.ts` saves provider keys without calling the providers.
- `src/test/claude.ts` stands in for the Anthropic SDK's streaming call and keeps the SDK's real error classes. `src/test/judgement.ts` builds transcript words and a judgement for it to reply with.
- `src/test/next.ts` provides in-memory `next/headers` cookies and a throwing `redirect`, as Next does.
- `src/test/storage.ts` points `getStorage()` at a temp directory per test.
- `src/test/dialog.ts` adds the `<dialog>` behaviour that jsdom lacks.
- Tests sit next to the code as `*.test.ts`. Component tests, `*.test.tsx`, opt in to jsdom with a `// @vitest-environment jsdom` docblock.
- Tests always mock Resend, Anthropic and Deepgram.
- Vitest can't render async server-component pages such as `page.tsx` and `layout.tsx`, so they have no unit tests. Their logic lives in `src/lib` and `actions.ts`, which tests cover. End-to-end tests would cover the pages themselves.

## Deployment

The `Dockerfile` builds a production image that serves on port 3000 and stores recordings in `/data/recordings`. Mount a volume there. The image keeps dev dependencies, so `npm run db:setup` can run inside it. `/api/health` is the health check endpoint.

## Notes

- This Next.js version has Cache Components enabled. Anything that reads cookies, `params`, `searchParams` or the database must render under a `<Suspense>` boundary. For that reason, each page is a thin wrapper that renders an async inner component.
- Recordings are stored in whatever format the browser produces: WebM on Chrome and Firefox, MP4 on Safari. Chrome's WebM has no duration header. The audio player shows the stored duration until the browser knows the real one, but seeking stays unreliable until recordings are transcoded or remuxed.
