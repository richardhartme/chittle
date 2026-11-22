/**
 * Seeds a demo account for screenshots: two assessed attempts at one interview question, the second
 * an improvement on the first, with hand-written feedback standing in for Claude's. Re-running it
 * replaces the account. Prints a magic link that signs in as it. Never runs in production.
 *
 *   npm run db:seed-demo
 */
import { config } from "dotenv";
config({ path: ".env" });

import type { Judgement } from "@/lib/assessment/judgement";

import type { TranscriptWord } from "./schema";

const DEMO_EMAIL = "demo@chittle.local";
const TOPIC = "Tell me about a time you led a team through a difficult situation.";

const FIRST_TRANSCRIPT = `Um, so, I guess this was, like, last year at work. We had, um, a project, it was a checkout redesign, and kind of a lot went wrong with it. The payments people changed their API, uh, quite late, and we basically had to redo a big part of it. I was sort of leading the team at the time, so I, um, tried to keep everyone calm. We did a lot of meetings and, you know, we worked through it. I think we moved some features around. In the end it launched, um, pretty much on time, and I think people were happy with it. Uh, so yeah, I think that's an example of me leading through something difficult.`;

const SECOND_TRANSCRIPT = `Last spring I was leading a team of five developers on a checkout redesign for an online retailer. Three weeks before launch, our payments provider told us they were retiring the API we'd built on. Um, so we suddenly had to rebuild the whole payment step, and the launch date couldn't move because it was tied to a national marketing campaign. My job was to get us to launch on time without burning the team out. The first thing I did was get everyone in a room and, you know, lay out exactly what had changed and what hadn't. Then I split the work into two streams. Two people rebuilt the payment integration, and the rest finished the features we'd already planned. I cut two nice-to-have features and agreed that with the product owner the same afternoon. I think the most important thing was a fifteen-minute check-in every morning, so problems came up in hours rather than days. We launched on the original date. Conversion went up eleven per cent in the first month, and nobody worked a weekend. What I took from it is that when the plan breaks, people need clarity more than they need speed.`;

/** A repeatable stream of numbers from 0 to 1, so every run seeds the same timings. */
function random(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/**
 * Deepgram-style words for a transcript: about `wordsPerSecond` while speaking, a pause after each
 * sentence, and the words at `unclear` heard with low confidence.
 */
type WordOptions = { seed: number; wordsPerSecond: number; unclear: Record<number, number> };

function wordsOf(text: string, { seed, wordsPerSecond, unclear }: WordOptions) {
  const next = random(seed);
  let t = 0.6;
  return text.split(/\s+/).map((punctuated, i): TranscriptWord => {
    const length = (1 / wordsPerSecond) * (0.7 + next() * 0.6);
    const word = {
      word: punctuated.toLowerCase().replace(/[^a-z0-9'-]/g, ""),
      punctuated_word: punctuated,
      start: round(t),
      end: round(t + length * 0.8),
      confidence: unclear[i] ?? round(0.9 + next() * 0.09),
    };
    t += length;
    if (/[.?!]$/.test(punctuated)) t += 0.5 + next() * 0.7;
    else if (/,$/.test(punctuated)) t += 0.15 + next() * 0.25;
    return word;
  });
}

const round = (n: number) => Math.round(n * 100) / 100;

/** A silent WAV of `seconds`, standing in for the recording so the player has a file to load. */
function silentWav(seconds: number): Uint8Array<ArrayBuffer> {
  const rate = 8000;
  const samples = Math.round(seconds * rate);
  const buffer = new Uint8Array(44 + samples).fill(128);
  const view = new DataView(buffer.buffer);
  const write = (text: string, at: number) => [...text].forEach((c, i) => (buffer[at + i] = c.charCodeAt(0)));
  write("RIFF", 0);
  view.setUint32(4, 36 + samples, true);
  write("WAVEfmt ", 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true); // bytes per second
  view.setUint16(32, 1, true); // bytes per sample
  view.setUint16(34, 8, true); // bits per sample
  write("data", 36);
  view.setUint32(40, samples, true);
  return buffer;
}

const sub = (score: number, feedback: string) => ({ score, feedback });

const FIRST_JUDGEMENT: Judgement = {
  structure: {
    summary:
      "The answer touches each part of a STAR story but never settles into one. The situation is vague, your own task isn't stated, and the result is “pretty much on time” with nothing measured.",
    logicalSequence: sub(30, "The events come in order, but “I think we moved some features around” arrives after the result is half-told."),
    transitions: sub(24, "Most links are “and” or “so”, which run the points together rather than moving between them."),
    signposting: sub(20, "Nothing tells the listener which part of the story they're in."),
    openingQuality: sub(22, "“Um, so, I guess this was, like, last year at work” spends the opening on hesitation."),
    closingQuality: sub(26, "“I think that's an example of me leading” tells the listener what to conclude instead of showing it."),
  },
  conciseness: {
    summary: "Short, but much of it is padding: “kind of”, “basically” and “pretty much” soften every claim.",
    wordChoice: sub(44, "“The payments people” and “a big part of it” are vaguer than the detail you have."),
    wordEconomy: sub(38, "Qualifiers like “basically” and “pretty much” add words without meaning."),
    sentenceLength: sub(42, "Sentence length is fine; the clauses inside them are loose."),
  },
  confidence: {
    summary: "Frequent hedging makes your own leadership sound uncertain, which undercuts the question.",
    hedgingFrequency: sub(34, "“I guess”, “sort of” and four uses of “I think” in under a minute."),
    assertiveness: sub(36, "“I was sort of leading the team” plays down the role the question asks about."),
  },
  pronunciation: { summary: "Clear throughout.", pronunciationClarity: { feedback: "Nearly every word was heard clearly." } },
  fillerRate: {
    summary: "Fillers are the main thing holding this answer back.",
    fillerFrequency: { feedback: "“Um” and “uh” come roughly every ten words, with “like” and “you know” on top." },
  },
  pace: {
    summary: "A comfortable pace, if a little hurried at the start.",
    pauseTiming: { feedback: "Pauses mostly fall between sentences, where they help." },
    wordsPerMinute: { feedback: "Your speaking rate is in a comfortable range." },
  },
  hedges: [
    { phrase: "i guess", count: 1 },
    { phrase: "kind of", count: 1 },
    { phrase: "sort of", count: 1 },
    { phrase: "i think", count: 4 },
  ],
  discourseFillers: [
    { phrase: "like", count: 1 },
    { phrase: "you know", count: 1 },
    { phrase: "so yeah", count: 1 },
  ],
  redundantPhrases: ["basically", "pretty much"],
  overview:
    "You have a good story here, a late API change you led a team through, but it's told without the details that make it convincing. Say what you did and what it achieved.",
  strengths: ["A relevant, real example", "Calm, even delivery"],
  areasToImprove: ["Open with the situation, not “I guess”", "State what you personally did", "End on a measured result"],
  coachInsights: {
    summary: "Say what you did. The answer describes what happened to the team, but the question is about how you led it.",
    howYouSaidIt: [
      "It was last year, on a checkout redesign.",
      "The payments API changed late.",
      "You tried to keep everyone calm.",
      "You held meetings and moved features around.",
      "It launched roughly on time.",
    ],
    betterOrder: [
      "A late payments API change threatened a checkout launch.",
      "You were leading the team.",
      "You reorganised the work and moved features out.",
      "It launched on time.",
    ],
    orderExplanation: "A STAR answer earns its result through your actions. Naming your role early lets the listener credit the actions to you.",
    tryOpeningWith: "Last year a late API change put our checkout launch at risk, and I was leading the team that had to fix it.",
    shorterWays: [
      {
        original: "The payments people changed their API, uh, quite late, and we basically had to redo a big part of it.",
        shorter: "Our payments provider changed its API late, so we had to rebuild.",
      },
    ],
    idealVersion: [
      { step: "Situation", text: "Last year I was leading a team on a checkout redesign when our payments provider changed its API late in the project." },
      { step: "Task", text: "I had to get the launch back on track and keep the team calm." },
      { step: "Action", text: "I reorganised the work and moved some features out of the launch." },
      { step: "Result", text: "We launched on time, and the team was happy with how it went." },
    ],
  },
};

const SECOND_JUDGEMENT: Judgement = {
  structure: {
    summary:
      "A clear STAR answer: the situation and stakes are set quickly, your task is stated in one sentence, your actions are specific, and the result is measured. Signposting between the steps is the remaining gap.",
    logicalSequence: sub(45, "Each step follows from the last, from the retired API to the two work streams to the launch."),
    transitions: sub(40, "“Then I split the work” moves the story on well; elsewhere sentences simply follow one another."),
    signposting: sub(36, "“My job was to” marks the task clearly, but the action and result aren't flagged in the same way."),
    openingQuality: sub(44, "“Last spring I was leading a team of five developers” sets the scene and your role at once."),
    closingQuality: sub(46, "“People need clarity more than they need speed” ends on a lesson the listener will remember."),
  },
  conciseness: {
    summary: "Mostly tight. A couple of sentences carry a few more words than they need.",
    wordChoice: sub(60, "Specific details like “eleven per cent” and “fifteen-minute check-in” do a lot of work."),
    wordEconomy: sub(54, "“The first thing I did was get everyone in a room and” could be simply “First, I got everyone together”."),
    sentenceLength: sub(50, "Most sentences are an easy length; the one about the launch date runs long."),
  },
  confidence: {
    summary: "You own your decisions here, which is exactly what this question is listening for.",
    hedgingFrequency: sub(66, "Only one hedge, “I think the most important thing”, and the claim is strong enough without it."),
    assertiveness: sub(64, "“I cut two nice-to-have features and agreed that with the product owner” shows a decision made and owned."),
  },
  pronunciation: { summary: "Clear and easy to follow.", pronunciationClarity: { feedback: "Almost every word was heard clearly." } },
  fillerRate: {
    summary: "Fillers are rare now and don't get in the way.",
    fillerFrequency: { feedback: "One “um” and one “you know” in the whole answer." },
  },
  pace: {
    summary: "A confident, even pace with pauses in the right places.",
    pauseTiming: { feedback: "You pause between sentences, which gives each point room to land." },
    wordsPerMinute: { feedback: "Your speaking rate sits in the ideal range." },
  },
  hedges: [{ phrase: "i think", count: 1 }],
  discourseFillers: [{ phrase: "you know", count: 1 }],
  redundantPhrases: ["the first thing I did was"],
  overview:
    "A strong, specific answer with a measured result and a memorable lesson. The biggest gain now is to lead with that result, so the listener knows from the first sentence that the story ends well.",
  strengths: ["Specific, measured result", "Clear ownership of decisions", "Memorable closing lesson"],
  areasToImprove: ["Lead with the result", "Signpost the action and result", "Drop “I think” before strong claims"],
  coachInsights: {
    summary: "Open with the result. Saying you launched on time with conversion up eleven per cent would hook the listener before the detail.",
    howYouSaidIt: [
      "You were leading five developers on a checkout redesign.",
      "The payments provider retired its API three weeks before launch.",
      "You had to launch on time without burning the team out.",
      "You split the work into two streams and cut two features.",
      "Daily fifteen-minute check-ins surfaced problems early.",
      "You launched on time, conversion rose eleven per cent, and nobody worked a weekend.",
      "When a plan breaks, people need clarity more than speed.",
    ],
    betterOrder: [
      "You launched a checkout redesign on time, even though its payments API was retired three weeks out.",
      "You led five developers, and the date was tied to a national campaign.",
      "You split the work into two streams and cut two features the same afternoon.",
      "Daily fifteen-minute check-ins surfaced problems in hours, not days.",
      "Conversion rose eleven per cent and nobody worked a weekend.",
      "When a plan breaks, people need clarity more than speed.",
    ],
    orderExplanation:
      "Interviewers listen hardest in the first few seconds. Leading with the outcome tells them the story ends well, so your situation and actions land as the explanation of a result they already want to hear about, rather than a build-up they have to wait through.",
    tryOpeningWith: "Three weeks before launch our payments API was retired, and I led my team to ship on the original date anyway.",
    shorterWays: [
      {
        original: "The first thing I did was get everyone in a room and, you know, lay out exactly what had changed and what hadn't.",
        shorter: "First, I got everyone together and laid out exactly what had changed.",
      },
      {
        original: "I think the most important thing was a fifteen-minute check-in every morning, so problems came up in hours rather than days.",
        shorter: "A fifteen-minute check-in each morning surfaced problems in hours, not days.",
      },
    ],
    idealVersion: [
      {
        step: "Situation",
        text: "Last spring I led five developers on a checkout redesign for an online retailer. Three weeks before launch, our payments provider retired the API we'd built on, and the date was tied to a national campaign.",
      },
      { step: "Task", text: "I had to get us to launch on time without burning the team out." },
      {
        step: "Action",
        text: "I laid out exactly what had changed, split the work into two streams, cut two nice-to-have features with the product owner that afternoon, and ran a fifteen-minute check-in every morning.",
      },
      {
        step: "Result",
        text: "We launched on the original date, conversion rose eleven per cent in the first month, and nobody worked a weekend. When a plan breaks, people need clarity more than speed.",
      },
    ],
  },
};

const PROGRESS_INSIGHT =
  "Your Shape score has made the biggest leap: your latest answer sets the scene, names your task and ends on a measured result. Hedges have dropped from seven to one. Next, try leading with the result, which you've voted to work on.";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("The demo account is for local screenshots only.");

  // Imported after dotenv so DATABASE_URL is set when the client is created.
  const { eq } = await import("drizzle-orm");
  const { db } = await import("./index");
  const { assessments, focusVotes, magicLinks, progressInsights, recordings, topics, transcripts, users } = await import("./schema");
  const { measure } = await import("@/lib/assessment/measure");
  const { scoreJudgement } = await import("@/lib/assessment/score");
  const { SCORING_VERSION } = await import("@/lib/assessment/version");
  const { getStorage } = await import("@/lib/storage");
  const { env } = await import("@/lib/env");
  const { generateToken, hashToken } = await import("@/lib/auth/tokens");

  const [topic] = await db.select().from(topics).where(eq(topics.text, TOPIC));
  if (!topic) throw new Error(`Topic not found. Run npm run db:seed first. (${TOPIC})`);

  // Start again: the user's rows cascade, and their files go with them.
  const [old] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  if (old) {
    await getStorage().deletePrefix(old.id);
    await db.delete(users).where(eq(users.id, old.id));
  }
  const [user] = await db.insert(users).values({ email: DEMO_EMAIL }).returning();

  const attempts: { transcript: string; judgement: Judgement; words: WordOptions; createdAt: Date }[] = [
    {
      transcript: FIRST_TRANSCRIPT,
      judgement: FIRST_JUDGEMENT,
      words: { seed: 7, wordsPerSecond: 2.7, unclear: { 31: 0.72, 58: 0.55 } },
      createdAt: new Date("2026-11-03T10:12:00Z"),
    },
    {
      transcript: SECOND_TRANSCRIPT,
      judgement: SECOND_JUDGEMENT,
      words: { seed: 11, wordsPerSecond: 3.2, unclear: { 92: 0.7, 151: 0.74 } },
      createdAt: new Date("2026-11-17T18:40:00Z"),
    },
  ];

  let latest = "";
  for (const attempt of attempts) {
    const words = wordsOf(attempt.transcript, attempt.words);
    const audioSeconds = round(words[words.length - 1].end + 0.8);
    const [recording] = await db
      .insert(recordings)
      .values({
        userId: user.id,
        topicId: topic.id,
        storageKey: `${user.id}/${crypto.randomUUID()}.wav`,
        mimeType: "audio/wav",
        sizeBytes: 0,
        durationSeconds: Math.round(audioSeconds),
        createdAt: attempt.createdAt,
      })
      .returning();
    const sizeBytes = await getStorage().put(recording.storageKey, new Response(silentWav(audioSeconds)).body!);
    await db.update(recordings).set({ sizeBytes }).where(eq(recordings.id, recording.id));

    await db.insert(transcripts).values({ recordingId: recording.id, text: attempt.transcript, words, audioSeconds });
    const measured = measure(words, audioSeconds);
    const { scores, total, judged } = scoreJudgement({ judgement: attempt.judgement, measured, words, durationSeconds: audioSeconds });
    await db.insert(assessments).values({
      recordingId: recording.id,
      status: "done",
      startedAt: attempt.createdAt,
      completedAt: attempt.createdAt,
      scoringVersion: SCORING_VERSION,
      totalScore: total,
      structureScore: scores.structure,
      concisenessScore: scores.conciseness,
      confidenceScore: scores.confidence,
      pronunciationScore: scores.pronunciation,
      fillerRateScore: scores.fillerRate,
      paceScore: scores.pace,
      result: { measured, judged },
    });
    console.log(`${attempt.createdAt.toDateString()}: ${total}/1000`, scores);
    latest = recording.id;
  }

  await db.insert(focusVotes).values({ userId: user.id, recordingId: latest, area: "Lead with the result", vote: "up" });
  await db.insert(progressInsights).values({ userId: user.id, text: PROGRESS_INSIGHT });

  const token = generateToken();
  await db.insert(magicLinks).values({ email: DEMO_EMAIL, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
  console.log(`\nSign in as ${DEMO_EMAIL}:\n  ${env.appUrl}/auth/verify?token=${token}\nLatest attempt: ${env.appUrl}/library/${latest}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
