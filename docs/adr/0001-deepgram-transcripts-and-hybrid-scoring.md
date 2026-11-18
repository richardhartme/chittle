# Deepgram transcripts with hybrid scoring

Claude can't take audio, so each recording is first transcribed by Deepgram (Nova-3, with filler words kept), which gives every word's timing and confidence. The measured dimensions (Pace, Filler rate, Pronunciation) are then calculated in code from those words. Claude scores only the judged dimensions (Structure, Conciseness, Confidence) and writes all the feedback text, with the calculated metrics given to it as context. Code gives scores that repeat exactly and counts that Claude might get wrong. Claude is used only where judgement is needed.

## Considered Options

- **OpenAI Whisper**: `whisper-1` drops most "um"s and "uh"s, which makes a filler score meaningless, and `gpt-4o-transcribe` has no word timestamps.
- **AssemblyAI**: comparable features (disfluencies, word timings, confidence), but asynchronous upload-then-poll. Deepgram takes the file in one request.
- **Gemini on the raw audio**: one model could hear delivery directly (uptalk, pronunciation), but its word timings are less reliable than a dedicated transcriber's, and it would replace Claude.
- **Claude scores everything**: simpler, but the numbers drift between runs and miscounts are likely.

## Consequences

- Each assessment needs two providers, so a speaker needs two provider keys ([ADR 0002](0002-per-user-provider-keys.md)).
- Anything that needs the sound itself, such as uptalk (pitch rising at the end of a statement), can't come from the transcript. Pronunciation is approximated from Deepgram's per-word confidence.
- The transcript is stored, so re-assessing calls only Claude.
