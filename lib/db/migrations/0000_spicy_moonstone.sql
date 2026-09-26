CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'complete');--> statement-breakpoint
CREATE TYPE "public"."eval_status" AS ENUM('pending', 'evaluated', 'failed', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."input_mode" AS ENUM('typed', 'voice');--> statement-breakpoint
CREATE TYPE "public"."msg_role" AS ENUM('student', 'learner');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('correct', 'partial', 'misconception', 'unsure');--> statement-breakpoint
CREATE TYPE "public"."session_phase" AS ENUM('teaching', 'assessing', 'reviewing', 'reteaching', 'reassessing', 'comparing');--> statement-breakpoint
CREATE TABLE "assessment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"form_id" text NOT NULL,
	"form_version" text NOT NULL,
	"gate_version" text NOT NULL,
	"rubric_version" text NOT NULL,
	"learning_record_id" uuid NOT NULL,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"expected_results" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "attempts_session_attempt" UNIQUE("session_id","attempt_no"),
	CONSTRAINT "attempts_id_session" UNIQUE("id","session_id"),
	CONSTRAINT "attempts_attempt_no" CHECK ("assessment_attempts"."attempt_no" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "debug_llm_payloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"message_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"session_id" uuid NOT NULL,
	"route" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_session_id_route_key_pk" PRIMARY KEY("session_id","route","key")
);
--> statement-breakpoint
CREATE TABLE "learning_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"cycle" integer NOT NULL,
	"record" jsonb NOT NULL,
	"rubric_version" text NOT NULL,
	"validator_version" text NOT NULL,
	"evaluator_model" text,
	"source_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_records_session_version" UNIQUE("session_id","version"),
	CONSTRAINT "learning_records_id_session" UNIQUE("id","session_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"turn_no" integer NOT NULL,
	"role" "msg_role" NOT NULL,
	"content" text NOT NULL,
	"input_mode" "input_mode" DEFAULT 'typed' NOT NULL,
	"cycle" integer NOT NULL,
	"eval_status" "eval_status" NOT NULL,
	"eval_error" text,
	"probe_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_session_turn" UNIQUE("session_id","turn_no"),
	CONSTRAINT "messages_id_session" UNIQUE("id","session_id"),
	CONSTRAINT "messages_content_len" CHECK (char_length("messages"."content") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "misconception_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"learning_record_id" uuid NOT NULL,
	"misconception_id" text NOT NULL,
	"origin" text NOT NULL,
	"event" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "misconception_events_origin" CHECK ("misconception_events"."origin" IN ('seeded', 'student')),
	CONSTRAINT "misconception_events_event" CHECK ("misconception_events"."event" IN ('activated', 'resolved', 'reactivated'))
);
--> statement-breakpoint
CREATE TABLE "question_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"pair_id" text NOT NULL,
	"question_snapshot" jsonb NOT NULL,
	"outcome" "outcome" NOT NULL,
	"points" integer NOT NULL,
	"max_points" integer NOT NULL,
	"earned_criteria" text[] NOT NULL,
	"fragment_ids" text[] NOT NULL,
	"answer_text" text NOT NULL,
	"blocking" jsonb NOT NULL,
	"next_step" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_results_attempt_question" UNIQUE("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_token_hash" "bytea" NOT NULL,
	"topic_id" text NOT NULL,
	"rubric_version" text NOT NULL,
	"phase" "session_phase" DEFAULT 'teaching' NOT NULL,
	"cycle" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "attempts_record_fk" FOREIGN KEY ("learning_record_id","session_id") REFERENCES "public"."learning_records"("id","session_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debug_llm_payloads" ADD CONSTRAINT "debug_llm_payloads_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_source_message_fk" FOREIGN KEY ("source_message_id","session_id") REFERENCES "public"."messages"("id","session_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misconception_events" ADD CONSTRAINT "misconception_events_record_fk" FOREIGN KEY ("learning_record_id","session_id") REFERENCES "public"."learning_records"("id","session_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_results" ADD CONSTRAINT "question_results_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_eval" ON "messages" USING btree ("session_id") WHERE "messages"."eval_status" = 'pending';