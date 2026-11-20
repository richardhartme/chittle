# Containers

Chittle is one Next.js application backed by Postgres and a directory of recording files. The client-side parts run in the speaker's browser, and everything else runs in a single Node.js process. Assessments run in that same process, in Next's `after()` callback, so there is no separate worker or queue ([ADR 0003](../adr/0003-assessments-run-in-after-with-stale-recovery.md)).

```mermaid
---
config:
  flowchart:
    wrappingWidth: 400
---
flowchart TB
    speaker["<b>Speaker</b><br/>[Person]"]

    subgraph chittle ["Chittle [Software System]"]
        direction TB
        browser["<b>Browser UI</b><br/>[Container: React 19 client components]<br/><br/>Records video or audio with MediaRecorder,<br/>picks topics, polls assessment status,<br/>plays recordings, casts focus votes"]
        web["<b>Web application</b><br/>[Container: Next.js 16 App Router on Node.js 24]<br/><br/>Server-rendered pages, server actions and<br/>API route handlers. Runs the assessment<br/>pipeline in after() once a response is sent"]
        db[("<b>Database</b><br/>[Container: PostgreSQL 17]<br/><br/>Users, sessions, magic links, categories,<br/>topics, recordings, encrypted provider keys,<br/>transcripts, assessments, focus votes,<br/>progress insights")]
        files[("<b>Recording storage</b><br/>[Container: local filesystem, STORAGE_DIR]<br/><br/>Recording files in the browser's format<br/>(WebM or MP4), keyed per speaker")]
        tooling["<b>Database tooling</b><br/>[Container: drizzle-kit and tsx scripts]<br/><br/>Applies migrations from drizzle/ and seeds<br/>categories, predefined topics and the demo account"]
    end

    deepgram["<b>Deepgram</b><br/>[External System]"]
    anthropic["<b>Anthropic Claude API</b><br/>[External System]"]
    resend["<b>Resend</b><br/>[External System]"]

    speaker -- "Uses<br/>[HTTPS]" --> browser
    speaker -- "Opens pages<br/>[HTTPS]" --> web
    web -- "Delivers pages<br/>and client code<br/>[HTTPS]" --> browser
    browser -- "Uploads recordings,<br/>asks for topics, polls<br/>status, streams playback<br/>[JSON and binary<br/>over HTTPS]" --> web
    browser -- "Submits forms<br/>[Server actions<br/>over HTTPS]" --> web

    web -- "Reads and writes<br/>[SQL via Drizzle ORM<br/>and postgres.js]" --> db
    web -- "Writes, streams with<br/>byte ranges, deletes<br/>[Node.js fs streams]" --> files
    tooling -- "Migrates and seeds<br/>[SQL]" --> db

    web -- "POST /v1/listen<br/>with the file<br/>[HTTPS]" --> deepgram
    web -- "Messages API, streamed<br/>[HTTPS, Anthropic SDK]" --> anthropic
    web -- "Sends email<br/>[HTTPS, Resend SDK]" --> resend

    classDef person fill:#08427b,stroke:#052e56,color:#fff
    classDef container fill:#438dd5,stroke:#2e6295,color:#fff
    classDef external fill:#999,stroke:#6b6b6b,color:#fff
    class speaker person
    class browser,web,db,files,tooling container
    class deepgram,anthropic,resend external
    style chittle fill:none,stroke:#1168bd,stroke-dasharray:5 5
```

## Notes

- The browser talks to the web application through these endpoints:

  | Endpoint | Used for |
  | --- | --- |
  | `GET /api/topics`, `POST /api/topics` | Listing a category's topics and saving a custom topic |
  | `POST /api/topics/next` | Getting the next unseen topic, or choosing a specific one |
  | `POST /api/recordings` | Uploading a finished recording, which starts its assessment |
  | `GET /api/recordings/[id]/assessment` | Polling an assessment's status from the results page |
  | `GET /api/recordings/[id]/file` | Streaming a recording for playback, with range requests |
  | `GET /api/health` | The container health check, which runs `select 1` |

- Sign-in, sign-out, saving and removing provider keys, Assess, Retry, focus votes and deleting recordings or the account are server actions in `src/app/actions.ts`.
- Recording storage sits behind the `Storage` interface in `src/lib/storage/types.ts`. Local disk is the only implementation, so the web application and its files must share one host. More than one app instance would need shared storage and a job queue (see [ADR 0003](../adr/0003-assessments-run-in-after-with-stale-recovery.md)).
- The database tooling ships in the production image so `npm run db:setup` can run inside it.
