# Assessments run in `after()` with stale recovery, not a job queue

An assessment takes 15–60 seconds, too long to hold the upload request open. It runs in Next's `after()` callback, which starts once the response has been sent, inside the single app container. The assessment row records its status and when it started. A row still pending after about 5 minutes is treated as failed (the process was probably restarted), and the results page offers Retry. Nothing resumes on its own after a restart, and two clicks could start duplicate work, so starting an assessment must claim the row atomically.

## Considered Options

- **A Postgres job queue (a jobs table or pg-boss) with a worker loop**: survives restarts and retries by itself, but it's more infrastructure than one container and a handful of speakers need. Revisit this if assessments are lost often or if the app runs more than one instance.
