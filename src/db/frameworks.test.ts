import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import { seedCategories } from "./seed-data";

const migrations = fileURLToPath(new URL("../../drizzle/", import.meta.url));

// Booted at module load, like src/test/db.ts, so PGlite's start-up (seconds on a busy CI runner) isn't
// counted against the test's timeout.
const client = await PGlite.create();

const applied = new WeakMap<PGlite, number>();

/** Applies the next migrations in order, up to and including `lastTag`, as drizzle's migrator would. */
async function migrateTo(client: PGlite, lastTag: string) {
  const journal = JSON.parse(await readFile(`${migrations}meta/_journal.json`, "utf8")) as { entries: { tag: string }[] };
  for (const [index, { tag }] of journal.entries.entries()) {
    if (index < (applied.get(client) ?? 0)) continue;
    applied.set(client, index + 1);
    const sql = await readFile(`${migrations}${tag}.sql`, "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }
    if (tag === lastTag) return;
  }
  throw new Error(`No migration tagged ${lastTag}`);
}

describe("category frameworks", () => {
  it("are set in the seed data for every category, as the spec maps them", () => {
    expect(Object.fromEntries(seedCategories.map((c) => [c.name, c.framework]))).toEqual({
      Interview: "star",
      Opinion: "prep",
      "Everyday life": "prep",
      Storytelling: "story_arc",
      "Work & presentations": "what_so_what_now_what",
    });
  });

  it("are backfilled by the migration for categories that already exist", async () => {
    await migrateTo(client, "0004_assessments");
    for (const slug of [...seedCategories.map((c) => c.slug), "made-up"]) {
      await client.query("insert into categories (slug, name) values ($1, $1)", [slug]);
    }

    await migrateTo(client, "0005_category_frameworks");

    const { rows } = await client.query<{ slug: string; framework: string }>("select slug, framework from categories");
    expect(Object.fromEntries(rows.map((r) => [r.slug, r.framework]))).toEqual({
      interview: "star",
      opinion: "prep",
      everyday: "prep",
      storytelling: "story_arc",
      work: "what_so_what_now_what",
      "made-up": "prep",
    });
  });
});
