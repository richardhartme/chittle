import { asc } from "drizzle-orm";
import { Suspense } from "react";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { PracticeSession } from "./practice-session";

export default function PracticePage() {
  return (
    <Suspense fallback={null}>
      <Practice />
    </Suspense>
  );
}

async function Practice() {
  await requireUser();
  const rows = await db
    .select({ slug: categories.slug, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.name));

  return (
    <>
      <h1>Practise</h1>
      <PracticeSession categories={rows} />
    </>
  );
}
