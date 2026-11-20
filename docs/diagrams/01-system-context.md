# System context

Chittle is used by one kind of person, the speaker. It depends on three outside services. Deepgram and Anthropic do the assessment, and Resend sends sign-in emails.

```mermaid
---
config:
  flowchart:
    wrappingWidth: 400
---
flowchart TB
    speaker["<b>Speaker</b><br/>[Person]<br/><br/>Practises impromptu speaking: records<br/>answers to topics and reads the feedback"]

    chittle["<b>Chittle</b><br/>[Software System]<br/><br/>Serves topics, stores recordings, and<br/>scores each one out of 1000 across six<br/>dimensions, with feedback and a rewrite"]

    deepgram["<b>Deepgram</b><br/>[External System]<br/><br/>Speech-to-text (Nova-3) with filler<br/>words, word timings and confidence"]
    anthropic["<b>Anthropic Claude API</b><br/>[External System]<br/><br/>Judges answers, writes feedback and<br/>insights, and generates topics"]
    resend["<b>Resend</b><br/>[External System]<br/><br/>Transactional email delivery"]

    speaker -- "Signs in, picks or<br/>writes topics, records<br/>answers, reads results<br/>[HTTPS, browser]" --> chittle
    chittle -- "Transcribes recordings<br/>[HTTPS, speaker's own key]" --> deepgram
    chittle -- "Scores, coaches and<br/>writes progress insights<br/>[HTTPS, speaker's own key]<br/>Generates shared topics<br/>[HTTPS, server key]" --> anthropic
    chittle -- "Sends magic sign-in links<br/>[HTTPS]" --> resend
    resend -. "Delivers the magic link<br/>[Email]" .-> speaker

    classDef person fill:#08427b,stroke:#052e56,color:#fff
    classDef system fill:#1168bd,stroke:#0b4884,color:#fff
    classDef external fill:#999,stroke:#6b6b6b,color:#fff
    class speaker person
    class chittle system
    class deepgram,anthropic,resend external
```

## Notes

- Speakers pay for their own assessments. They save a Deepgram key and an Anthropic key on the Account page, and there is no fallback to a server key ([ADR 0002](../adr/0002-per-user-provider-keys.md)).
- Topic generation is the one Anthropic call made with the server's `ANTHROPIC_API_KEY`, because generated topics are shared by every speaker. Without that key, Chittle serves only the predefined topics.
- Without `RESEND_API_KEY`, Chittle logs magic links to the server console rather than emailing them, which is how local development signs in.
