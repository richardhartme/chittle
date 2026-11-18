# Speakers bring their own provider keys for assessment

Anyone can sign up with a magic link, and assessment costs money on every recording, so each speaker pays for their own: they enter a Deepgram key and an Anthropic key on the Account page. There's no fallback to a server key, so a sign-up can never spend the operator's money. Keys are encrypted at rest with AES-256-GCM under a server-held `ENCRYPTION_KEY`, are checked with a test call when saved, are only ever shown masked, and are deleted with the account.

Topic generation deliberately keeps the server's `ANTHROPIC_API_KEY`. Generated topics are shared by every speaker and are cheap (Haiku, ten at a time), so it would be odd to charge one speaker's key for topics everyone uses.

## Considered Options

- **Server keys only**: simplest, but costs are uncapped while sign-up is open.
- **Per-user keys with server fallback**: convenient, but any sign-up spends the operator's money.
