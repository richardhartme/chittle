ALTER TYPE "public"."topic_source" ADD VALUE 'custom';--> statement-breakpoint
ALTER TABLE "topics" DROP CONSTRAINT "topics_category_text_unique";--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topics_category_text_unique" ON "topics" USING btree ("category_id","text") WHERE "topics"."user_id" is null;--> statement-breakpoint
CREATE INDEX "topics_user_category_idx" ON "topics" USING btree ("user_id","category_id");--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_custom_has_owner" CHECK (("topics"."source"::text = 'custom') = ("topics"."user_id" is not null));