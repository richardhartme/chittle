CREATE TYPE "public"."assessment_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "assessments" (
	"recording_id" uuid PRIMARY KEY NOT NULL,
	"status" "assessment_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text,
	"scoring_version" integer,
	"total_score" integer,
	"structure_score" integer,
	"conciseness_score" integer,
	"confidence_score" integer,
	"pronunciation_score" integer,
	"filler_rate_score" integer,
	"pace_score" integer,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"recording_id" uuid PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"words" jsonb NOT NULL,
	"audio_seconds" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;