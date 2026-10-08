# Chittle

Practise speaking: pick a topic category, get a random topic, record yourself on video, and rate how it went. See [SPEC.md](SPEC.md) for the product and technical spec.

Built with Next.js (App Router), TypeScript, Postgres (Drizzle ORM), and the Claude API for topic generation.

## Getting started

```bash
cp .env.example .env        # then adjust if needed
docker compose up -d        # Postgres on localhost:5433
npm install
npm run db:setup            # apply migrations and seed categories/topics
npm run dev                 # http://localhost:3000
```

Sign-in is by magic link. Without `RESEND_API_KEY`, links are printed in the dev server console, so request one on `/login` and open the URL it logs.

Without `ANTHROPIC_API_KEY`, only the predefined topics are served. Once a user has seen them all in a category, they'll be told no new topics are available. With a key set, new topics are generated and stored for everyone.

Recording needs camera and microphone access, which browsers only grant on `localhost` or HTTPS.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve the build |
| `npm run db:generate` | Generate a SQL migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Upsert categories and predefined topics (safe to re-run) |
| `npm test` | Run the test suite once (Vitest) |
| `npm run test:watch` | Re-run affected tests on change |
| `npm run test:coverage` | Run the suite with a coverage report (`coverage/`) |
| `npm run lint` | ESLint |

## Layout

- `src/app` — routes, server actions (`actions.ts`) and API route handlers (`api/`)
- `src/db` — Drizzle schema, client, seed data
- `src/lib/auth` — magic links, sessions, email sending
- `src/lib/topics` — topic selection (no repeats per user) and Claude generation
- `src/lib/storage` — `Storage` interface and the local-disk implementation (recordings in `STORAGE_DIR`)

## Testing

`npm test` needs no Postgres, Docker or API keys. Database code runs against [PGlite](https://pglite.dev) (in-process Postgres) with the real migrations from `drizzle/` applied, so queries, constraints and cascades behave as in production.

- `src/test/db.ts` — the PGlite database, `resetDb()` and row factories. Tests swap it in with `vi.mock("@/db", ...)`.
- `src/test/next.ts` — in-memory `next/headers` cookies and a throwing `redirect`, mirroring Next.
- `src/test/storage.ts` — points `getStorage()` at a temp directory per test.
- Tests sit next to the code (`*.test.ts`). Component tests (`*.test.tsx`) opt in to jsdom with a `// @vitest-environment jsdom` docblock.
- External services (Resend, Anthropic) are always mocked.
- Async server-component pages (`page.tsx`, `layout.tsx`) aren't unit tested, since Vitest can't render them; their logic lives in `src/lib` and `actions.ts`, which are covered. End-to-end tests would be the way to cover the pages themselves.

## Notes

- This Next.js version has Cache Components enabled, so anything reading cookies, `params` or `searchParams`, or the database must render under a `<Suspense>` boundary. Pages follow a thin wrapper → async inner component pattern for that reason.
- Recordings are stored in whatever format the browser produces (WebM on Chrome/Firefox, MP4 on Safari). Chrome's WebM has no duration header, so seeking in playback is limited until recordings are transcoded or remuxed.
