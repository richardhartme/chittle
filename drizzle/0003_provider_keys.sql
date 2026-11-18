CREATE TYPE "public"."provider" AS ENUM('deepgram', 'anthropic');--> statement-breakpoint
CREATE TABLE "provider_keys" (
	"user_id" uuid NOT NULL,
	"provider" "provider" NOT NULL,
	"encrypted_key" text NOT NULL,
	"key_hint" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_keys_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;