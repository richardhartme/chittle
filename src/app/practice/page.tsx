import { asc } from "drizzle-orm";
import { Suspense } from "react";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { parseSetup } from "@/lib/practice";
import { findTopic } from "@/lib/topics/next-topic";
import { type InitialSetup, SetupForm } from "./setup-form";

export default function PracticePage({ searchParams }: PageProps<"/practice">) {
  return (
    <Suspense fallback={null}>
      <Practice searchParams={searchParams} />
    </Suspense>
  );
}

async function Practice({ searchParams }: Pick<PageProps<"/practice">, "searchParams">) {
  const user = await requireUser();
  // Coming back from the record page carries the setup in the query, so the form starts from it.
  const { topicId, speakSeconds, mode } = parseSetup(await searchParams);

  const [rows, topic] = await Promise.all([
    db.select({ slug: categories.slug, name: categories.name }).from(categories).orderBy(asc(categories.name)),
    // Another user's custom topic is treated as unknown, so the form starts empty.
    topicId ? findTopic(user.id, topicId) : null,
  ]);

  const initial: InitialSetup = {
    category: topic?.category,
    topic: topic ? { id: topic.id, text: topic.text } : undefined,
    speakSeconds,
    mode,
  };

  return (
    <>
      <h1>Practise</h1>
      {/* Keyed so a different setup in the URL starts the form afresh rather than reusing a hidden one. */}
      <SetupForm key={`${topicId}-${speakSeconds}-${mode}`} categories={rows} initial={initial} />
    </>
  );
}
