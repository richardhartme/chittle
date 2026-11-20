# Deployment

## Production

The `Dockerfile` builds one image that runs the web application. It serves on port 3000, keeps recordings in `/data/recordings` and is health-checked with `curl` against `/api/health`, which is how Coolify checks it. The image keeps its dev dependencies, so migrations and seeding run inside the same container.

```mermaid
---
config:
  flowchart:
    wrappingWidth: 400
---
flowchart TB
    speaker["<b>Speaker</b><br/>[Person]"]

    subgraph device ["Speaker's device [browser]"]
        browser["<b>Browser UI</b><br/>[Container: React client components]<br/><br/>Needs HTTPS for camera and microphone"]
    end

    subgraph host ["App host [Docker, Coolify]"]
        subgraph appc ["chittle [node:24-slim]"]
            web["<b>Web application</b><br/>[Container: next start, port 3000]"]
            tooling["<b>Database tooling</b><br/>[Container: npm run db:setup, run by hand]"]
        end
        volume[("<b>Recording storage</b><br/>[Container: volume at /data/recordings]")]
    end

    db[("<b>Database</b><br/>[Container: PostgreSQL 17]<br/><br/>Reached at DATABASE_URL")]

    apis["<b>Third-party APIs</b><br/>[External Systems]<br/><br/>Deepgram, Anthropic Claude API, Resend"]

    speaker --> browser
    browser -- "HTTPS, through the host's<br/>proxy, to APP_URL" --> web
    web -- "SQL / TCP" --> db
    tooling -- "SQL / TCP" --> db
    web -- "Filesystem" --> volume
    web -- "Transcription, Claude<br/>requests, sign-in email<br/>[HTTPS]" --> apis

    classDef person fill:#08427b,stroke:#052e56,color:#fff
    classDef container fill:#438dd5,stroke:#2e6295,color:#fff
    classDef external fill:#999,stroke:#6b6b6b,color:#fff
    class speaker person
    class browser,web,tooling,volume,db container
    class apis external
    style device fill:none,stroke:#888
    style host fill:none,stroke:#888
    style appc fill:none,stroke:#888,stroke-dasharray:5 5
```

The app runs as a single instance. Recordings are on the container's local volume and assessments run inside the web process, so a second instance would need shared storage and a job queue first.

### Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection. Required. |
| `APP_URL` | Public base URL, used to build magic links |
| `STORAGE_DIR` | Recording directory, `/data/recordings` in the image |
| `RESEND_API_KEY`, `EMAIL_FROM` | Magic-link email. Without a key, links are logged instead. |
| `ANTHROPIC_API_KEY`, `TOPIC_MODEL` | Server key for topic generation only |
| `ENCRYPTION_KEY` | Encrypts speakers' provider keys at rest. Changing it makes saved keys unreadable. |

## Local development and CI

```mermaid
---
config:
  flowchart:
    wrappingWidth: 400
---
flowchart LR
    subgraph laptop ["Developer machine"]
        dev["<b>Web application</b><br/>[next dev, localhost:3000]"]
        disk[("<b>Recording storage</b><br/>[./storage]")]
        pgLocal[("<b>Database</b><br/>[Postgres.app on 5432, or<br/>docker compose on 5433]")]
        console["<b>Server console</b><br/>[Magic links logged when<br/>RESEND_API_KEY is empty]"]
    end

    subgraph ci ["GitHub Actions [Node 24]"]
        checks["<b>CI job</b><br/>[lint, next typegen + tsc, vitest]"]
        pglite[("<b>PGlite</b><br/>[In-process Postgres with<br/>the real migrations]")]
    end

    dev --> disk
    dev --> pgLocal
    dev --> console
    checks --> pglite

    classDef container fill:#438dd5,stroke:#2e6295,color:#fff
    class dev,disk,pgLocal,console,checks,pglite container
    style laptop fill:none,stroke:#888
    style ci fill:none,stroke:#888
```

Tests need no Postgres server, Docker or API keys. They run against PGlite and always mock Resend, Anthropic and Deepgram.
