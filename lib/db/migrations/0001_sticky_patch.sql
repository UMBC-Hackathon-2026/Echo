ALTER TABLE "assessment_attempts" DROP CONSTRAINT "attempts_record_fk";
--> statement-breakpoint
ALTER TABLE "learning_records" DROP CONSTRAINT "learning_records_source_message_fk";
--> statement-breakpoint
ALTER TABLE "misconception_events" DROP CONSTRAINT "misconception_events_record_fk";
--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "attempts_record_fk" FOREIGN KEY ("learning_record_id","session_id") REFERENCES "public"."learning_records"("id","session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_source_message_fk" FOREIGN KEY ("source_message_id","session_id") REFERENCES "public"."messages"("id","session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misconception_events" ADD CONSTRAINT "misconception_events_record_fk" FOREIGN KEY ("learning_record_id","session_id") REFERENCES "public"."learning_records"("id","session_id") ON DELETE cascade ON UPDATE no action;