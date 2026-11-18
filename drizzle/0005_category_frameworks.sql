CREATE TYPE "public"."framework" AS ENUM('star', 'prep', 'story_arc', 'what_so_what_now_what');--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "framework" "framework";--> statement-breakpoint
-- Backfill the seeded categories (see src/db/seed-data.ts). Any other category gets PREP, the most general.
UPDATE "categories" SET "framework" = CASE "slug"
	WHEN 'interview' THEN 'star'
	WHEN 'storytelling' THEN 'story_arc'
	WHEN 'work' THEN 'what_so_what_now_what'
	ELSE 'prep'
END::"framework";--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "framework" SET NOT NULL;
