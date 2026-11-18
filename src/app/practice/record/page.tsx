import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db";
import { topics } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { parseSetup, SPEAK_SECONDS } from "@/lib/practice";
import { RecordSession } from "./record-session";

export default function RecordPage({ searchParams }: PageProps<"/practice/record">) {
  return (
    <Suspense fallback={null}>
      <Record searchParams={searchParams} />
    </Suspense>
  );
}

async function Record({ searchParams }: Pick<PageProps<"/practice/record">, "searchParams">) {
  await requireUser();
  const { topicId, speakSeconds = SPEAK_SECONDS.default, mode = "video" } = parseSetup(await searchParams);
  if (!topicId) redirect("/practice");

  const [topic] = await db.select({ id: topics.id, text: topics.text }).from(topics).where(eq(topics.id, topicId));
  if (!topic) redirect("/practice");

  return (
    <>
      <h1>Record</h1>
      {/* Keyed so a different setup starts a fresh session rather than reusing a hidden one. */}
      <RecordSession key={`${topic.id}-${speakSeconds}-${mode}`} topic={topic} speakSeconds={speakSeconds} mode={mode} />
    </>
  );
}
