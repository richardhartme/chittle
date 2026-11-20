import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { parseSetup, SPEAK_SECONDS } from "@/lib/practice";
import { findTopic } from "@/lib/topics/next-topic";
import { RecordSession } from "./record-session";

export default function RecordPage({ searchParams }: PageProps<"/practice/record">) {
  return (
    <Suspense fallback={null}>
      <Record searchParams={searchParams} />
    </Suspense>
  );
}

async function Record({ searchParams }: Pick<PageProps<"/practice/record">, "searchParams">) {
  const user = await requireUser();
  const { topicId, speakSeconds = SPEAK_SECONDS.default, mode = "video" } = parseSetup(await searchParams);
  if (!topicId) redirect("/practice");

  // Another user's custom topic is treated as unknown.
  const found = await findTopic(user.id, topicId);
  if (!found) redirect("/practice");
  const topic = { id: found.id, text: found.text };

  return (
    <>
      <h1>Record</h1>
      {/* Keyed so a different setup starts a fresh session rather than reusing a hidden one. */}
      <RecordSession key={`${topic.id}-${speakSeconds}-${mode}`} topic={topic} speakSeconds={speakSeconds} mode={mode} />
    </>
  );
}
