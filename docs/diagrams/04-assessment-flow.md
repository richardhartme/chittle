# Assessment flow

This dynamic diagram follows one recording from upload to its results. Assess and Retry on the results page take the same path from `startAssessment` on, and a re-assess skips Deepgram because the transcript is already stored.

```mermaid
sequenceDiagram
    autonumber
    actor Speaker
    participant Browser as Browser UI<br/>[record-session, assessment-poller]
    participant Upload as POST /api/recordings<br/>[API route]
    participant Status as GET /api/recordings/[id]/assessment<br/>[API route]
    participant Pipeline as Assessment pipeline<br/>[src/lib/assessment]
    participant Storage as Recording storage<br/>[local filesystem]
    participant DB as Database<br/>[PostgreSQL]
    participant Deepgram as Deepgram<br/>[External]
    participant Claude as Anthropic Claude API<br/>[External]

    Speaker->>Browser: Records an answer
    Browser->>Upload: Uploads the file with topic and mode
    Upload->>Storage: Streams the file to disk
    Upload->>DB: Inserts the recording
    Upload->>Pipeline: startAssessment
    Pipeline->>DB: Reads and decrypts the speaker's provider keys
    Pipeline->>DB: Claims the assessment row as pending, in one atomic upsert
    Upload-->>Browser: 201 with the recording id
    Browser->>Speaker: Shows the results page

    Note over Pipeline: Runs in after(), once the response has been sent

    par Results page polls
        loop Every few seconds, until done, failed or stale
            Browser->>Status: Polls the assessment's status
            Status->>DB: Reads the assessment row
            Status-->>Browser: pending, done, failed or stale
        end
    and Pipeline runs
        Pipeline->>Storage: Reads the recording
        Pipeline->>Deepgram: POST /v1/listen (Nova-3, filler words kept)
        Deepgram-->>Pipeline: Words with timings and confidence
        Pipeline->>DB: Stores the transcript
        Pipeline->>Pipeline: Measures Rhythm, Fluency and Clarity
        Pipeline->>DB: Reads the 20 most recent focus votes
        par Scoring request
            Pipeline->>Claude: Score Shape, Brevity and Conviction, write feedback
        and Coach request
            Pipeline->>Claude: Write coach insights and the ideal version
        end
        Claude-->>Pipeline: Structured judgements
        Pipeline->>Pipeline: Combines sub-scores into a score out of 1000
        Pipeline->>DB: Stores the assessment as done, if the claim still holds
        Pipeline->>DB: Reads recent assessments and focus votes
        Pipeline->>Claude: Rewrite the progress insight
        Pipeline->>DB: Stores the progress insight
    end

    Browser->>Speaker: Refreshes the page to show the score and feedback
```

## Notes

- If any step fails, the run stores the assessment as failed with a message that's safe to show the speaker, and the results page offers Retry. Secrets are redacted from logged errors.
- A row still pending after about 5 minutes counts as stale, because the process was probably restarted. Retry claims it again ([ADR 0003](../adr/0003-assessments-run-in-after-with-stale-recovery.md)).
- A run only stores its result if its claim is still the current one, so a newer Retry or re-assess wins over an older run.
- If the progress insight fails, the assessment stays done. The dashboard shows the insight once the speaker has two scored assessments.
